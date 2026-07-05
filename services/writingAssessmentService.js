const {
    roundToNearestHalfBand,
    roundToHalfBand
} = require("../utils/ieltsBands");

const MIN_WORDS_BY_TASK = {
    task1: 150,
    task2: 250
};

const TASK_CONFIG = {
    task1: {
        publicTaskType: "Task 1",
        primaryCriterionKey: "taskAchievement",
        primaryCriterionLabel: "Task Achievement",
        scoreKeys: ["taskAchievement", "coherence", "lexical", "grammar"]
    },
    task2: {
        publicTaskType: "Task 2",
        primaryCriterionKey: "taskResponse",
        primaryCriterionLabel: "Task Response",
        scoreKeys: ["taskResponse", "coherence", "lexical", "grammar"]
    }
};

const DEFAULT_DEBUG_ENABLED =
    process.env.NODE_ENV !== "production" &&
    process.env.WRITING_AI_DEBUG !== "0";

const normalizeText = (value, fallback = "") =>
    typeof value === "string" ? value.trim() : fallback;

const normalizeList = (value) =>
    Array.isArray(value)
        ? value
              .map((item) => normalizeText(item))
              .filter(Boolean)
        : [];

const uniqueList = (items = []) => {
    const seen = new Set();
    const list = [];

    for (const item of items) {
        const clean = normalizeText(item);
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        list.push(clean);
    }

    return list;
};

const clampBand = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(9, num));
};

const normalizeCriterionBand = (value) => {
    const safe = clampBand(value);
    if (safe == null) return null;
    return roundToNearestHalfBand(safe);
};

const roundIeltsOverallBand = (value) => roundToNearestHalfBand(value);

const countWords = (text = "") => {
    const matches = String(text)
        .trim()
        .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);

    return matches ? matches.length : 0;
};

const getTaskConfig = (taskType) => TASK_CONFIG[taskType] || null;

const getPublicTaskType = (taskType) =>
    getTaskConfig(taskType)?.publicTaskType || "Overall";

const isPlainObject = (value) =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeGrammarCorrections = (value) => {
    if (!Array.isArray(value)) return [];

    const seen = new Set();
    const list = [];

    for (const item of value) {
        const entry = {
            original: normalizeText(item?.original),
            correct: normalizeText(item?.correct),
            reason: normalizeText(item?.reason)
        };

        if (!entry.original || !entry.correct || !entry.reason) continue;

        const key = `${entry.original.toLowerCase()}|${entry.correct.toLowerCase()}|${entry.reason.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(entry);
    }

    return list;
};

const normalizeVocabularySuggestions = (value) => {
    if (!Array.isArray(value)) return [];

    const seen = new Set();
    const list = [];

    for (const item of value) {
        const original = normalizeText(item?.original);
        const alternatives = uniqueList(item?.alternatives || []);

        if (!original || !alternatives.length) continue;

        const key = original.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
            original,
            alternatives
        });
    }

    return list;
};

const normalizeCriterionFeedbackEntry = (value, fallbackBand = null) => {
    if (isPlainObject(value)) {
        return {
            band:
                normalizeCriterionBand(value.band) ??
                normalizeCriterionBand(fallbackBand),
            analysis: normalizeText(value.analysis || value.comment || value.feedback),
            evidence: uniqueList(value.evidence || [])
        };
    }

    const analysis = normalizeText(value);
    if (!analysis && fallbackBand == null) {
        return null;
    }

    return {
        band: normalizeCriterionBand(fallbackBand),
        analysis,
        evidence: []
    };
};

const buildImprovementTips = ({
    weaknesses = [],
    grammarCorrections = [],
    vocabularySuggestions = []
}) =>
    uniqueList([
        ...weaknesses,
        ...grammarCorrections
            .slice(0, 2)
            .map((item) => `Change "${item.original}" to "${item.correct}" because ${item.reason}.`),
        ...vocabularySuggestions
            .slice(0, 2)
            .map(
                (item) =>
                    `Replace "${item.original}" with ${item.alternatives
                        .slice(0, 3)
                        .join(", ")} when the meaning fits better.`
            )
    ]).slice(0, 6);

const averageScores = (scores = {}) => {
    const values = [
        scores.taskAchievement,
        scores.taskResponse,
        scores.coherence,
        scores.lexical,
        scores.grammar
    ]
        .filter((value) => value != null)
        .map(Number)
        .filter(Number.isFinite);

    if (values.length !== 4) return null;

    return values.reduce((sum, value) => sum + value, 0) / 4;
};

const buildTaskSummary = (assessment) => {
    const strengths = uniqueList(assessment.strengths || []);
    const weaknesses = uniqueList(assessment.weaknesses || []);
    const tips = uniqueList(assessment.improvementTips || []);
    const config = getTaskConfig(assessment.taskType);
    const primaryEntry = config
        ? assessment.criterionFeedback?.[config.primaryCriterionKey]
        : null;

    const parts = [
        `Estimated band ${assessment.scores?.overall ?? "—"} for ${getPublicTaskType(
            assessment.taskType
        )}.`
    ];

    if (strengths.length) {
        parts.push(`Strengths: ${strengths.slice(0, 2).join("; ")}.`);
    }

    if (weaknesses.length) {
        parts.push(`Weaknesses: ${weaknesses.slice(0, 2).join("; ")}.`);
    }

    if (normalizeText(primaryEntry?.analysis)) {
        parts.push(primaryEntry.analysis);
    }

    if (tips.length) {
        parts.push(`Next step: ${tips[0]}.`);
    }

    return parts.join(" ").trim();
};

const buildLegacyResultPayload = (assessment) => ({
    band_score: assessment?.scores?.overall ?? null,
    estimated_band: assessment?.scores?.overall ?? null,
    final_summary: buildTaskSummary(assessment)
});

const CRITERION_FEEDBACK_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        band: { type: "number", minimum: 0, maximum: 9 },
        analysis: { type: "string" },
        evidence: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["band", "analysis", "evidence"]
};

const GRAMMAR_CORRECTION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        original: { type: "string" },
        correct: { type: "string" },
        reason: { type: "string" }
    },
    required: ["original", "correct", "reason"]
};

const VOCABULARY_SUGGESTION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        original: { type: "string" },
        alternatives: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["original", "alternatives"]
};

const buildWritingResponseSchema = (taskType) => {
    const config = getTaskConfig(taskType);
    if (!config) {
        throw new Error(`Unknown writing task type: ${taskType}`);
    }

    const primaryKey = config.primaryCriterionKey;

    return {
        type: "object",
        additionalProperties: false,
        properties: {
            taskType: {
                type: "string",
                enum: [config.publicTaskType]
            },
            scores: {
                type: "object",
                additionalProperties: false,
                properties: {
                    [primaryKey]: { type: "number", minimum: 0, maximum: 9 },
                    coherence: { type: "number", minimum: 0, maximum: 9 },
                    lexical: { type: "number", minimum: 0, maximum: 9 },
                    grammar: { type: "number", minimum: 0, maximum: 9 },
                    overall: { type: "number", minimum: 0, maximum: 9 }
                },
                required: [primaryKey, "coherence", "lexical", "grammar", "overall"]
            },
            strengths: {
                type: "array",
                items: { type: "string" }
            },
            weaknesses: {
                type: "array",
                items: { type: "string" }
            },
            criterionFeedback: {
                type: "object",
                additionalProperties: false,
                properties: {
                    [primaryKey]: CRITERION_FEEDBACK_SCHEMA,
                    coherence: CRITERION_FEEDBACK_SCHEMA,
                    lexical: CRITERION_FEEDBACK_SCHEMA,
                    grammar: CRITERION_FEEDBACK_SCHEMA
                },
                required: [primaryKey, "coherence", "lexical", "grammar"]
            },
            grammarCorrections: {
                type: "array",
                items: GRAMMAR_CORRECTION_SCHEMA
            },
            vocabularySuggestions: {
                type: "array",
                items: VOCABULARY_SUGGESTION_SCHEMA
            },
            estimatedExaminerComment: {
                type: "string"
            }
        },
        required: [
            "taskType",
            "scores",
            "strengths",
            "weaknesses",
            "criterionFeedback",
            "grammarCorrections",
            "vocabularySuggestions",
            "estimatedExaminerComment"
        ]
    };
};

const WRITING_RESPONSE_SCHEMAS = {
    task1: buildWritingResponseSchema("task1"),
    task2: buildWritingResponseSchema("task2")
};

const safeSerializeForLog = (value) => {
    try {
        return JSON.stringify(value, null, 2);
    } catch (error) {
        return String(value);
    }
};

const logWritingDebug = (stage, payload) => {
    if (!DEFAULT_DEBUG_ENABLED) return;
    console.log(`[writing-ai:${stage}] ${safeSerializeForLog(payload)}`);
};

const buildPrompt = ({ essay, taskType, question, language }) => {
    const config = getTaskConfig(taskType);
    const lang = String(language || "en").trim().toLowerCase();
    const feedbackLanguage = lang === "uz" ? "Uzbek" : "English";
    const minWords = MIN_WORDS_BY_TASK[taskType] || 0;
    const essayWordCount = countWords(essay);

    return `
You are an official IELTS Writing Examiner with over 20 years of experience.

Your only responsibility is to score this essay exactly according to the official IELTS Writing Band Descriptors.

Return ONLY valid JSON.
Do not include markdown.
Do not include code fences.
Do not include explanations outside the JSON.
Write every feedback string in ${feedbackLanguage}.

Score ONLY these four criteria:
1. ${config.primaryCriterionLabel}
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Very important scoring rules:
- Use only evidence from the essay and the task question.
- Never guess scores.
- Never default to Band 6 or Band 6.5.
- Do not avoid giving Band 8 if the essay clearly deserves it.
- Do not deduct twice for the same issue.
- Do not reduce Grammar because of vocabulary mistakes.
- Do not reduce Coherence because of grammar mistakes.
- Every deduction must be supported by evidence from the essay.
- If there is no evidence, do not deduct.
- If the essay is under the minimum word count, reflect that mainly in ${config.primaryCriterionLabel}.
- The essay is ${config.publicTaskType}. Minimum word count is ${minWords}. The essay contains ${essayWordCount} words.

Before producing the final scores, perform an internal verification:
Step 1: Assign preliminary band scores.
Step 2: Re-read the essay using the official IELTS descriptors.
Step 3: Check whether every score has sufficient evidence.
Step 4: If evidence is insufficient, revise the score.
Only after verification return the final JSON.

Feedback rules:
- Strengths and weaknesses must be specific to this essay.
- Generic advice is not allowed.
- criterionFeedback.analysis must explain the band logically.
- criterionFeedback.evidence must quote or reference exact phrases from the essay when relevant.
- grammarCorrections must use exact original phrases from the essay.
- vocabularySuggestions must replace exact weak or repetitive wording from the essay.

Required JSON shape:
{
  "taskType": "${config.publicTaskType}",
  "scores": {
    "${config.primaryCriterionKey}": 0,
    "coherence": 0,
    "lexical": 0,
    "grammar": 0,
    "overall": 0
  },
  "strengths": [],
  "weaknesses": [],
  "criterionFeedback": {
    "${config.primaryCriterionKey}": {
      "band": 0,
      "analysis": "",
      "evidence": []
    },
    "coherence": {
      "band": 0,
      "analysis": "",
      "evidence": []
    },
    "lexical": {
      "band": 0,
      "analysis": "",
      "evidence": []
    },
    "grammar": {
      "band": 0,
      "analysis": "",
      "evidence": []
    }
  },
  "grammarCorrections": [
    {
      "original": "",
      "correct": "",
      "reason": ""
    }
  ],
  "vocabularySuggestions": [
    {
      "original": "",
      "alternatives": ["", "", ""]
    }
  ],
  "estimatedExaminerComment": ""
}

Task question:
${question || "No question provided."}

Essay:
${essay}
`.trim();
};

const buildJsonRepairPrompt = ({
    essay,
    taskType,
    question,
    language,
    previousResponse
}) => {
    const basePrompt = buildPrompt({
        essay,
        taskType,
        question,
        language
    });

    return `
${basePrompt}

Your previous reply was invalid JSON or did not match the required schema.
Repair the response and return ONLY valid JSON that matches the required shape exactly.
If the previous reply is unusable, re-evaluate the essay from scratch.

Previous invalid reply:
${previousResponse || "[empty response]"}
`.trim();
};

const extractResponseText = (response) => {
    const textParts = [];

    if (typeof response?.output_text === "string" && response.output_text.trim()) {
        textParts.push(response.output_text.trim());
    }

    for (const block of response?.output || []) {
        for (const content of block?.content || []) {
            if (typeof content?.text === "string" && content.text.trim()) {
                textParts.push(content.text.trim());
            }
        }
    }

    return textParts.find(Boolean) || "";
};

const tryParseJson = (text = "") => {
    const clean = normalizeText(text);
    if (!clean) return null;

    const withoutFence = clean
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const candidates = [withoutFence];
    const firstBrace = withoutFence.indexOf("{");
    const lastBrace = withoutFence.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            // Continue trying additional slices.
        }
    }

    return null;
};

const ensureRequiredScores = (scores, taskType) => {
    const config = getTaskConfig(taskType);
    if (!config) return null;

    const required = {
        taskAchievement:
            taskType === "task1" ? normalizeCriterionBand(scores.taskAchievement) : null,
        taskResponse:
            taskType === "task2" ? normalizeCriterionBand(scores.taskResponse) : null,
        coherence: normalizeCriterionBand(scores.coherence),
        lexical: normalizeCriterionBand(scores.lexical),
        grammar: normalizeCriterionBand(scores.grammar)
    };

    const missingPrimary =
        taskType === "task1"
            ? required.taskAchievement == null
            : required.taskResponse == null;

    if (
        missingPrimary ||
        required.coherence == null ||
        required.lexical == null ||
        required.grammar == null
    ) {
        return null;
    }

    return required;
};

const normalizeAssessment = (payload, { taskType, essay }) => {
    const config = getTaskConfig(taskType);
    if (!config) {
        const error = new Error(`Unknown writing task type: ${taskType}`);
        error.status = 500;
        throw error;
    }

    const baseScores = ensureRequiredScores(
        {
            taskAchievement: payload?.scores?.taskAchievement,
            taskResponse: payload?.scores?.taskResponse,
            coherence: payload?.scores?.coherence,
            lexical: payload?.scores?.lexical,
            grammar: payload?.scores?.grammar
        },
        taskType
    );

    if (!baseScores) {
        const error = new Error("AI did not return all required IELTS criterion scores.");
        error.status = 502;
        error.exposeToClient = true;
        throw error;
    }

    const rawAverage = averageScores(baseScores);
    const overall = roundIeltsOverallBand(rawAverage);
    const grammarCorrections = normalizeGrammarCorrections(payload?.grammarCorrections);
    const vocabularySuggestions = normalizeVocabularySuggestions(
        payload?.vocabularySuggestions
    );
    const strengths = uniqueList(payload?.strengths || []);
    const weaknesses = uniqueList(payload?.weaknesses || []);
    const improvementTips = buildImprovementTips({
        weaknesses,
        grammarCorrections,
        vocabularySuggestions
    });

    const criterionFeedback = {
        taskAchievement:
            taskType === "task1"
                ? normalizeCriterionFeedbackEntry(
                      payload?.criterionFeedback?.taskAchievement,
                      baseScores.taskAchievement
                  )
                : null,
        taskResponse:
            taskType === "task2"
                ? normalizeCriterionFeedbackEntry(
                      payload?.criterionFeedback?.taskResponse,
                      baseScores.taskResponse
                  )
                : null,
        coherence: normalizeCriterionFeedbackEntry(
            payload?.criterionFeedback?.coherence,
            baseScores.coherence
        ),
        lexical: normalizeCriterionFeedbackEntry(
            payload?.criterionFeedback?.lexical,
            baseScores.lexical
        ),
        grammar: normalizeCriterionFeedbackEntry(
            payload?.criterionFeedback?.grammar,
            baseScores.grammar
        )
    };

    return {
        taskType,
        taskTypeLabel: config.publicTaskType,
        wordCount: countWords(essay),
        scores: {
            ...baseScores,
            overall
        },
        strengths,
        weaknesses,
        improvementTips,
        criterionFeedback,
        grammarCorrections,
        vocabularySuggestions,
        estimatedExaminerComment: normalizeText(payload?.estimatedExaminerComment)
    };
};

const requestWritingAssessment = async ({
    client,
    model,
    essay,
    taskType,
    question,
    language,
    retry = false,
    previousResponse = ""
}) => {
    const prompt = retry
        ? buildJsonRepairPrompt({
              essay,
              taskType,
              question,
              language,
              previousResponse
          })
        : buildPrompt({
              essay,
              taskType,
              question,
              language
          });

    logWritingDebug("prompt", {
        retry,
        model,
        taskType,
        prompt
    });

    const response = await client.responses.create({
        model,
        input: prompt,
        temperature: 0.1,
        text: {
            format: {
                type: "json_schema",
                name: `ielts_writing_assessment_${taskType}`,
                strict: true,
                schema: WRITING_RESPONSE_SCHEMAS[taskType]
            }
        }
    });

    const rawText = extractResponseText(response);
    const parsed = response?.output_parsed || tryParseJson(rawText);

    logWritingDebug("raw-response", {
        retry,
        model,
        taskType,
        rawText
    });
    logWritingDebug("parsed-json", {
        retry,
        model,
        taskType,
        parsed
    });

    return {
        parsed,
        rawText
    };
};

const gradeWritingEssay = async ({
    client,
    model,
    essay,
    taskType,
    question,
    language
}) => {
    let previousResponse = "";
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const retry = attempt === 1;

        const assessmentAttempt = await requestWritingAssessment({
            client,
            model,
            essay,
            taskType,
            question,
            language,
            retry,
            previousResponse
        });

        previousResponse = assessmentAttempt.rawText;

        if (!assessmentAttempt.parsed) {
            lastError = new Error(
                "AI returned invalid JSON for the writing assessment."
            );
            continue;
        }

        try {
            const normalized = normalizeAssessment(assessmentAttempt.parsed, {
                taskType,
                essay
            });

            logWritingDebug("final-scores", {
                taskType,
                model,
                scores: normalized.scores
            });

            return normalized;
        } catch (error) {
            lastError = error;
        }
    }

    const error =
        lastError ||
        new Error("AI returned an invalid writing assessment twice.");

    error.status = error.status || 502;
    error.exposeToClient = true;
    if (!error.message) {
        error.message =
            "AI returned invalid JSON twice. The writing result was not saved.";
    }

    throw error;
};

const normalizeScoresFromSource = (source = {}, taskType = "") => {
    const scores = source?.scores || {};
    const legacy = source?.result || {};

    return {
        taskAchievement: normalizeCriterionBand(
            scores.taskAchievement ??
                (taskType === "task1"
                    ? scores.taskResponse ?? source?.taskResponseScore
                    : null)
        ),
        taskResponse: normalizeCriterionBand(
            scores.taskResponse ??
                (taskType === "task2" ? source?.taskResponseScore : null)
        ),
        coherence: normalizeCriterionBand(
            scores.coherence ??
                scores.coherenceCohesion ??
                source?.coherenceScore ??
                source?.coherenceCohesionScore
        ),
        lexical: normalizeCriterionBand(
            scores.lexical ??
                scores.lexicalResource ??
                source?.lexicalScore ??
                source?.lexicalResourceScore
        ),
        grammar: normalizeCriterionBand(
            scores.grammar ??
                scores.grammarRangeAccuracy ??
                source?.grammarScore ??
                source?.grammarRangeAccuracyScore
        ),
        overall: normalizeCriterionBand(
            scores.overall ??
                source?.overallScore ??
                legacy?.band_score ??
                legacy?.estimated_band
        )
    };
};

const normalizeStoredWritingResult = (doc) => {
    const source = doc?.toObject ? doc.toObject() : doc || {};
    const legacy = source.result || {};
    const taskType = normalizeText(source.taskType);
    const essay = normalizeText(source.essay || source.essayText);
    const question = normalizeText(source.question || source.prompt);
    const scores = normalizeScoresFromSource(source, taskType);
    const rawCriterionFeedback = source.criterionFeedback || {};
    const strengths = uniqueList(source.strengths || source?.feedback?.strengths || []);
    const weaknesses = uniqueList(
        source.weaknesses || source?.feedback?.weaknesses || legacy?.weaknesses || []
    );
    const grammarCorrections = normalizeGrammarCorrections(source.grammarCorrections);
    const vocabularySuggestions = normalizeVocabularySuggestions(
        source.vocabularySuggestions
    );
    const improvementTips = uniqueList(
        source.improvementTips ||
            source?.feedback?.improvementTips ||
            legacy?.improvement_tips ||
            buildImprovementTips({
                weaknesses,
                grammarCorrections,
                vocabularySuggestions
            })
    );

    const criterionFeedback = {
        taskAchievement:
            taskType === "task1" || rawCriterionFeedback.taskAchievement
                ? normalizeCriterionFeedbackEntry(
                      rawCriterionFeedback.taskAchievement ??
                          rawCriterionFeedback.taskResponse,
                      scores.taskAchievement
                  )
                : null,
        taskResponse:
            taskType === "task2" || rawCriterionFeedback.taskResponse
                ? normalizeCriterionFeedbackEntry(
                      rawCriterionFeedback.taskResponse,
                      scores.taskResponse
                  )
                : null,
        coherence: normalizeCriterionFeedbackEntry(
            rawCriterionFeedback.coherence ??
                rawCriterionFeedback.coherenceCohesion ??
                normalizeList(legacy?.coherence_feedback).join(" "),
            scores.coherence
        ),
        lexical: normalizeCriterionFeedbackEntry(
            rawCriterionFeedback.lexical ??
                rawCriterionFeedback.lexicalResource ??
                normalizeList(legacy?.vocabulary_feedback).join(" "),
            scores.lexical
        ),
        grammar: normalizeCriterionFeedbackEntry(
            rawCriterionFeedback.grammar ??
                rawCriterionFeedback.grammarRangeAccuracy ??
                normalizeList(legacy?.grammar_feedback).join(" "),
            scores.grammar
        )
    };

    const estimatedExaminerComment =
        normalizeText(source.estimatedExaminerComment) ||
        normalizeText(legacy?.final_summary);

    return {
        ...source,
        taskType,
        taskTypeLabel: getPublicTaskType(taskType),
        testName: normalizeText(source.testName) || "Writing Test",
        question,
        essay,
        wordCount:
            Number.isFinite(Number(source.wordCount)) && Number(source.wordCount) >= 0
                ? Number(source.wordCount)
                : countWords(essay),
        scores,
        strengths,
        weaknesses,
        improvementTips,
        criterionFeedback,
        grammarCorrections,
        vocabularySuggestions,
        estimatedExaminerComment,
        feedback: {
            strengths,
            weaknesses,
            improvementTips
        },
        result: {
            band_score: scores.overall,
            estimated_band: scores.overall,
            final_summary:
                estimatedExaminerComment ||
                buildTaskSummary({
                    taskType,
                    scores,
                    strengths,
                    weaknesses,
                    improvementTips,
                    criterionFeedback
                })
        }
    };
};

const createStoredWritingResultPayload = ({
    userId,
    writingId = null,
    attemptKey = "",
    testName = "",
    taskType,
    question = "",
    essay = "",
    assessment
}) => ({
    userId,
    writingId,
    attemptKey: normalizeText(attemptKey),
    testName: normalizeText(testName) || "Writing Test",
    taskType,
    question: normalizeText(question),
    prompt: normalizeText(question),
    essay: normalizeText(essay),
    essayText: normalizeText(essay),
    wordCount: assessment.wordCount,
    scores: assessment.scores,
    strengths: uniqueList(assessment.strengths),
    weaknesses: uniqueList(assessment.weaknesses),
    improvementTips: uniqueList(assessment.improvementTips),
    criterionFeedback: assessment.criterionFeedback,
    grammarCorrections: normalizeGrammarCorrections(assessment.grammarCorrections),
    vocabularySuggestions: normalizeVocabularySuggestions(
        assessment.vocabularySuggestions
    ),
    estimatedExaminerComment: normalizeText(assessment.estimatedExaminerComment),
    result: buildLegacyResultPayload(assessment)
});

const buildMergedCriterionFeedback = ({
    left,
    right,
    band,
    includeTaskLabels = true
}) => {
    const leftAnalysis = normalizeText(left?.analysis);
    const rightAnalysis = normalizeText(right?.analysis);
    const analysis = uniqueList([
        leftAnalysis && includeTaskLabels ? `Task 1: ${leftAnalysis}` : leftAnalysis,
        rightAnalysis && includeTaskLabels ? `Task 2: ${rightAnalysis}` : rightAnalysis
    ]).join(" ");

    const evidence = uniqueList([
        ...(left?.evidence || []).map((item) =>
            includeTaskLabels ? `Task 1: ${item}` : item
        ),
        ...(right?.evidence || []).map((item) =>
            includeTaskLabels ? `Task 2: ${item}` : item
        )
    ]).slice(0, 8);

    return {
        band: normalizeCriterionBand(band),
        analysis,
        evidence
    };
};

const buildOverallAssessmentFromTasks = (task1Doc, task2Doc) => {
    const task1 = normalizeStoredWritingResult(task1Doc);
    const task2 = normalizeStoredWritingResult(task2Doc);

    if (
        task1?.scores?.overall == null ||
        task2?.scores?.overall == null ||
        task1?.scores?.taskAchievement == null ||
        task2?.scores?.taskResponse == null
    ) {
        return null;
    }

    const weightedCriterion = (criterion) => {
        const left = Number(task1?.scores?.[criterion]);
        const right = Number(task2?.scores?.[criterion]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        return roundToHalfBand((left + 2 * right) / 3);
    };

    const assessment = {
        taskType: "overall",
        taskTypeLabel: "Overall",
        wordCount: (task1.wordCount || 0) + (task2.wordCount || 0),
        scores: {
            taskAchievement: task1.scores.taskAchievement,
            taskResponse: task2.scores.taskResponse,
            coherence: weightedCriterion("coherence"),
            lexical: weightedCriterion("lexical"),
            grammar: weightedCriterion("grammar"),
            overall: roundIeltsOverallBand(
                (Number(task1.scores.overall) + 2 * Number(task2.scores.overall)) / 3
            )
        },
        strengths: uniqueList([
            ...(task1.strengths || []),
            ...(task2.strengths || [])
        ]).slice(0, 6),
        weaknesses: uniqueList([
            ...(task1.weaknesses || []),
            ...(task2.weaknesses || [])
        ]).slice(0, 6),
        improvementTips: uniqueList([
            ...(task1.improvementTips || []),
            ...(task2.improvementTips || [])
        ]).slice(0, 6),
        criterionFeedback: {
            taskAchievement: task1.criterionFeedback?.taskAchievement || null,
            taskResponse: task2.criterionFeedback?.taskResponse || null,
            coherence: buildMergedCriterionFeedback({
                left: task1.criterionFeedback?.coherence,
                right: task2.criterionFeedback?.coherence,
                band: weightedCriterion("coherence")
            }),
            lexical: buildMergedCriterionFeedback({
                left: task1.criterionFeedback?.lexical,
                right: task2.criterionFeedback?.lexical,
                band: weightedCriterion("lexical")
            }),
            grammar: buildMergedCriterionFeedback({
                left: task1.criterionFeedback?.grammar,
                right: task2.criterionFeedback?.grammar,
                band: weightedCriterion("grammar")
            })
        },
        grammarCorrections: normalizeGrammarCorrections([
            ...(task1.grammarCorrections || []),
            ...(task2.grammarCorrections || [])
        ]).slice(0, 8),
        vocabularySuggestions: normalizeVocabularySuggestions([
            ...(task1.vocabularySuggestions || []),
            ...(task2.vocabularySuggestions || [])
        ]).slice(0, 8),
        estimatedExaminerComment: uniqueList([
            task1.estimatedExaminerComment,
            task2.estimatedExaminerComment
        ]).join(" ")
    };

    return assessment;
};

module.exports = {
    MIN_WORDS_BY_TASK,
    WRITING_RESPONSE_SCHEMAS,
    buildLegacyResultPayload,
    buildOverallAssessmentFromTasks,
    buildPrompt,
    buildJsonRepairPrompt,
    buildWritingResponseSchema,
    countWords,
    createStoredWritingResultPayload,
    getPublicTaskType,
    getTaskConfig,
    gradeWritingEssay,
    logWritingDebug,
    normalizeAssessment,
    normalizeStoredWritingResult,
    requestWritingAssessment,
    roundIeltsOverallBand
};
