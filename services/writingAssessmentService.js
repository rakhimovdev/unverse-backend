const {
    roundToHalfBand
} = require("../utils/ieltsBands");

const MIN_WORDS_BY_TASK = {
    task1: 150,
    task2: 250
};

const WRITING_RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        taskType: {
            type: "string",
            enum: ["task1", "task2"]
        },
        wordCount: {
            type: "integer",
            minimum: 0
        },
        scores: {
            type: "object",
            additionalProperties: false,
            properties: {
                taskResponse: { type: "number", minimum: 0, maximum: 9 },
                coherenceCohesion: { type: "number", minimum: 0, maximum: 9 },
                lexicalResource: { type: "number", minimum: 0, maximum: 9 },
                grammarRangeAccuracy: { type: "number", minimum: 0, maximum: 9 },
                overall: { type: "number", minimum: 0, maximum: 9 }
            },
            required: [
                "taskResponse",
                "coherenceCohesion",
                "lexicalResource",
                "grammarRangeAccuracy",
                "overall"
            ]
        },
        feedback: {
            type: "object",
            additionalProperties: false,
            properties: {
                strengths: {
                    type: "array",
                    items: { type: "string" }
                },
                weaknesses: {
                    type: "array",
                    items: { type: "string" }
                },
                improvementTips: {
                    type: "array",
                    items: { type: "string" }
                }
            },
            required: ["strengths", "weaknesses", "improvementTips"]
        },
        criterionFeedback: {
            type: "object",
            additionalProperties: false,
            properties: {
                taskResponse: { type: "string" },
                coherenceCohesion: { type: "string" },
                lexicalResource: { type: "string" },
                grammarRangeAccuracy: { type: "string" }
            },
            required: [
                "taskResponse",
                "coherenceCohesion",
                "lexicalResource",
                "grammarRangeAccuracy"
            ]
        }
    },
    required: [
        "taskType",
        "wordCount",
        "scores",
        "feedback",
        "criterionFeedback"
    ]
};

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
    return roundToHalfBand(safe);
};

const roundIeltsOverallBand = (value) => {
    const safe = clampBand(value);
    if (safe == null) return null;

    const whole = Math.floor(safe);
    const fraction = safe - whole;

    if (fraction < 0.25) return whole;
    if (fraction < 0.75) return whole + 0.5;
    return Math.min(9, whole + 1);
};

const countWords = (text = "") => {
    const matches = String(text)
        .trim()
        .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);

    return matches ? matches.length : 0;
};

const averageScores = (scores = {}) => {
    const values = [
        scores.taskResponse,
        scores.coherenceCohesion,
        scores.lexicalResource,
        scores.grammarRangeAccuracy
    ]
        .map(Number)
        .filter(Number.isFinite);

    if (values.length !== 4) return null;

    return values.reduce((sum, value) => sum + value, 0) / 4;
};

const applyScoreGuards = (scores) => {
    const next = {
        taskResponse: normalizeCriterionBand(scores.taskResponse),
        coherenceCohesion: normalizeCriterionBand(scores.coherenceCohesion),
        lexicalResource: normalizeCriterionBand(scores.lexicalResource),
        grammarRangeAccuracy: normalizeCriterionBand(scores.grammarRangeAccuracy)
    };

    if (
        Object.values(next).some((value) => value == null)
    ) {
        return null;
    }

    return {
        taskResponse: normalizeCriterionBand(next.taskResponse),
        coherenceCohesion: normalizeCriterionBand(next.coherenceCohesion),
        lexicalResource: normalizeCriterionBand(next.lexicalResource),
        grammarRangeAccuracy: normalizeCriterionBand(next.grammarRangeAccuracy)
    };
};

const buildTaskSummary = (assessment) => {
    const strengths = uniqueList(assessment.feedback?.strengths || []);
    const weaknesses = uniqueList(assessment.feedback?.weaknesses || []);
    const tips = uniqueList(assessment.feedback?.improvementTips || []);
    const taskResponseFeedback = normalizeText(
        assessment.criterionFeedback?.taskResponse
    );

    const parts = [
        `Estimated band ${assessment.scores?.overall ?? "—"} for ${assessment.taskType}.`
    ];

    if (strengths.length) {
        parts.push(`Strengths: ${strengths.slice(0, 2).join("; ")}.`);
    }

    if (weaknesses.length) {
        parts.push(`Weaknesses: ${weaknesses.slice(0, 2).join("; ")}.`);
    }

    if (taskResponseFeedback) {
        parts.push(taskResponseFeedback);
    }

    if (tips.length) {
        parts.push(`Next step: ${tips[0]}.`);
    }

    return parts.join(" ").trim();
};

const buildLegacyResultPayload = (assessment) => ({
    band_score: assessment?.scores?.overall ?? null,
    grammar_feedback: assessment?.criterionFeedback?.grammarRangeAccuracy
        ? [assessment.criterionFeedback.grammarRangeAccuracy]
        : [],
    vocabulary_feedback: assessment?.criterionFeedback?.lexicalResource
        ? [assessment.criterionFeedback.lexicalResource]
        : [],
    coherence_feedback: assessment?.criterionFeedback?.coherenceCohesion
        ? [assessment.criterionFeedback.coherenceCohesion]
        : [],
    weaknesses: uniqueList(assessment?.feedback?.weaknesses || []),
    improvement_tips: uniqueList(assessment?.feedback?.improvementTips || []),
    final_summary: buildTaskSummary(assessment)
});

const buildPrompt = ({ essay, taskType, question, language, retry = false }) => {
    const lang = String(language || "en").trim().toLowerCase();
    const feedbackLanguage = lang === "uz" ? "Uzbek" : "English";
    const minWords = MIN_WORDS_BY_TASK[taskType] || 0;
    const criterionLabel = taskType === "task1" ? "Task Achievement" : "Task Response";
    const essayWordCount = countWords(essay);

    return `
You are an official IELTS Writing examiner.
Return JSON only. Do not include markdown, code fences, or extra text.
Write all feedback strings in ${feedbackLanguage}.

Evaluate the essay strictly according to the official IELTS Writing Band Descriptors for:
1. ${criterionLabel}
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Scoring rules you must follow:
- Score each criterion from 0 to 9.
- The essay is ${taskType}. Minimum word count is ${minWords}. The essay contains ${essayWordCount} words.
- Use only evidence from the essay and the question.
- Do not guess scores.
- Do not automatically default any criterion to Band 6 or 6.5.
- Do not deduct twice for the same problem.
- Vocabulary issues affect Lexical Resource only.
- Grammar issues affect Grammatical Range and Accuracy only.
- If the essay is under the minimum word count, reflect that mainly in ${criterionLabel}.
- Keep feedback concise, specific, and evidence-based.
- In each criterionFeedback field, mention concrete reasons drawn from the essay.
- Set scores.overall to the average of the four criterion scores before IELTS rounding.

Before returning the final scores, perform this verification silently:
1. Assign preliminary band scores.
2. Re-read the essay using the official IELTS descriptors.
3. Check whether every score and every deduction has sufficient evidence in the essay.
4. If evidence is insufficient, revise the score.
- Do not reveal these verification steps in the output.
- Only after verification return the final JSON.

JSON shape:
{
  "taskType": "task1 or task2",
  "wordCount": 0,
  "scores": {
    "taskResponse": 0,
    "coherenceCohesion": 0,
    "lexicalResource": 0,
    "grammarRangeAccuracy": 0,
    "overall": 0
  },
  "feedback": {
    "strengths": [],
    "weaknesses": [],
    "improvementTips": []
  },
  "criterionFeedback": {
    "taskResponse": "",
    "coherenceCohesion": "",
    "lexicalResource": "",
    "grammarRangeAccuracy": ""
  }
}

Task type: ${taskType}
Question:
${question || "No question provided."}

Essay:
${essay}

${retry ? "Your previous reply was invalid JSON. Return valid JSON only." : ""}
`;
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

    try {
        return JSON.parse(withoutFence);
    } catch (error) {
        return null;
    }
};

const normalizeAssessment = (payload, { taskType, essay, question }) => {
    const baseScores = {
        taskResponse: payload?.scores?.taskResponse,
        coherenceCohesion: payload?.scores?.coherenceCohesion,
        lexicalResource: payload?.scores?.lexicalResource,
        grammarRangeAccuracy: payload?.scores?.grammarRangeAccuracy
    };

    const wordCount = countWords(essay);
    const guardedScores = applyScoreGuards(baseScores);

    if (!guardedScores) {
        const error = new Error("AI did not return all four IELTS criterion scores.");
        error.status = 502;
        throw error;
    }

    const rawAverage = averageScores(guardedScores);
    const overall = roundIeltsOverallBand(rawAverage);

    return {
        taskType,
        wordCount,
        scores: {
            ...guardedScores,
            overall
        },
        feedback: {
            strengths: uniqueList(payload?.feedback?.strengths || []),
            weaknesses: uniqueList(payload?.feedback?.weaknesses || []),
            improvementTips: uniqueList(payload?.feedback?.improvementTips || [])
        },
        criterionFeedback: {
            taskResponse: normalizeText(payload?.criterionFeedback?.taskResponse),
            coherenceCohesion: normalizeText(
                payload?.criterionFeedback?.coherenceCohesion
            ),
            lexicalResource: normalizeText(payload?.criterionFeedback?.lexicalResource),
            grammarRangeAccuracy: normalizeText(
                payload?.criterionFeedback?.grammarRangeAccuracy
            )
        }
    };
};

const requestWritingAssessment = async ({
    client,
    model,
    essay,
    taskType,
    question,
    language,
    retry = false
}) => {
    const response = await client.responses.create({
        model,
        input: buildPrompt({
            essay,
            taskType,
            question,
            language,
            retry
        }),
        temperature: 0.1,
        text: {
            format: {
                type: "json_schema",
                name: "ielts_writing_assessment",
                strict: true,
                schema: WRITING_RESPONSE_SCHEMA
            }
        }
    });

    const parsed = response?.output_parsed || tryParseJson(extractResponseText(response));

    return {
        parsed,
        rawText: extractResponseText(response)
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
    const firstAttempt = await requestWritingAssessment({
        client,
        model,
        essay,
        taskType,
        question,
        language
    });

    let parsed = firstAttempt.parsed;

    if (!parsed) {
        const retryAttempt = await requestWritingAssessment({
            client,
            model,
            essay,
            taskType,
            question,
            language,
            retry: true
        });
        parsed = retryAttempt.parsed;
    }

    if (!parsed) {
        const error = new Error(
            "AI returned invalid JSON twice. The writing result was not saved."
        );
        error.status = 502;
        error.exposeToClient = true;
        throw error;
    }

    return normalizeAssessment(parsed, {
        taskType,
        essay,
        question
    });
};

const normalizeStoredWritingResult = (doc) => {
    const source = doc?.toObject ? doc.toObject() : doc || {};
    const legacy = source.result || {};
    const essay = normalizeText(source.essay || source.essayText);
    const question = normalizeText(source.question || source.prompt);
    const scores = {
        taskResponse: normalizeCriterionBand(
            source?.scores?.taskResponse ?? source?.taskResponseScore
        ),
        coherenceCohesion: normalizeCriterionBand(
            source?.scores?.coherenceCohesion ?? source?.coherenceCohesionScore
        ),
        lexicalResource: normalizeCriterionBand(
            source?.scores?.lexicalResource ?? source?.lexicalResourceScore
        ),
        grammarRangeAccuracy: normalizeCriterionBand(
            source?.scores?.grammarRangeAccuracy ?? source?.grammarRangeAccuracyScore
        ),
        overall:
            clampBand(source?.scores?.overall) ??
            clampBand(legacy?.band_score ?? legacy?.estimated_band)
    };

    return {
        ...source,
        testName: normalizeText(source.testName) || "Writing Test",
        question,
        essay,
        wordCount:
            Number.isFinite(Number(source.wordCount)) && Number(source.wordCount) >= 0
                ? Number(source.wordCount)
                : countWords(essay),
        scores,
        feedback: {
            strengths: uniqueList(source?.feedback?.strengths || []),
            weaknesses: uniqueList(source?.feedback?.weaknesses || legacy?.weaknesses || []),
            improvementTips: uniqueList(
                source?.feedback?.improvementTips || legacy?.improvement_tips || []
            )
        },
        criterionFeedback: {
            taskResponse:
                normalizeText(source?.criterionFeedback?.taskResponse) ||
                normalizeText(legacy?.final_summary),
            coherenceCohesion:
                normalizeText(source?.criterionFeedback?.coherenceCohesion) ||
                normalizeList(legacy?.coherence_feedback).join(" "),
            lexicalResource:
                normalizeText(source?.criterionFeedback?.lexicalResource) ||
                normalizeList(legacy?.vocabulary_feedback).join(" "),
            grammarRangeAccuracy:
                normalizeText(source?.criterionFeedback?.grammarRangeAccuracy) ||
                normalizeList(legacy?.grammar_feedback).join(" ")
        },
        result: {
            band_score:
                clampBand(legacy?.band_score ?? legacy?.estimated_band) ??
                clampBand(source?.scores?.overall),
            estimated_band:
                clampBand(legacy?.estimated_band ?? legacy?.band_score) ??
                clampBand(source?.scores?.overall),
            grammar_feedback:
                normalizeList(legacy?.grammar_feedback).length
                    ? normalizeList(legacy?.grammar_feedback)
                    : normalizeText(source?.criterionFeedback?.grammarRangeAccuracy)
                        ? [normalizeText(source?.criterionFeedback?.grammarRangeAccuracy)]
                        : [],
            vocabulary_feedback:
                normalizeList(legacy?.vocabulary_feedback).length
                    ? normalizeList(legacy?.vocabulary_feedback)
                    : normalizeText(source?.criterionFeedback?.lexicalResource)
                        ? [normalizeText(source?.criterionFeedback?.lexicalResource)]
                        : [],
            coherence_feedback:
                normalizeList(legacy?.coherence_feedback).length
                    ? normalizeList(legacy?.coherence_feedback)
                    : normalizeText(source?.criterionFeedback?.coherenceCohesion)
                        ? [normalizeText(source?.criterionFeedback?.coherenceCohesion)]
                        : [],
            weaknesses: uniqueList(legacy?.weaknesses || source?.feedback?.weaknesses || []),
            improvement_tips: uniqueList(
                legacy?.improvement_tips || source?.feedback?.improvementTips || []
            ),
            final_summary:
                normalizeText(legacy?.final_summary) ||
                buildTaskSummary({
                    taskType: source.taskType,
                    scores,
                    feedback: source.feedback,
                    criterionFeedback: source.criterionFeedback
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
    scores: {
        taskResponse: assessment.scores.taskResponse,
        coherenceCohesion: assessment.scores.coherenceCohesion,
        lexicalResource: assessment.scores.lexicalResource,
        grammarRangeAccuracy: assessment.scores.grammarRangeAccuracy,
        overall: assessment.scores.overall
    },
    feedback: {
        strengths: uniqueList(assessment.feedback.strengths),
        weaknesses: uniqueList(assessment.feedback.weaknesses),
        improvementTips: uniqueList(assessment.feedback.improvementTips)
    },
    criterionFeedback: {
        taskResponse: normalizeText(assessment.criterionFeedback.taskResponse),
        coherenceCohesion: normalizeText(
            assessment.criterionFeedback.coherenceCohesion
        ),
        lexicalResource: normalizeText(assessment.criterionFeedback.lexicalResource),
        grammarRangeAccuracy: normalizeText(
            assessment.criterionFeedback.grammarRangeAccuracy
        )
    },
    result: buildLegacyResultPayload(assessment)
});

const buildOverallAssessmentFromTasks = (task1Doc, task2Doc) => {
    const task1 = normalizeStoredWritingResult(task1Doc);
    const task2 = normalizeStoredWritingResult(task2Doc);

    if (
        task1?.scores?.overall == null ||
        task2?.scores?.overall == null
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
        wordCount: (task1.wordCount || 0) + (task2.wordCount || 0),
        scores: {
            taskResponse: weightedCriterion("taskResponse"),
            coherenceCohesion: weightedCriterion("coherenceCohesion"),
            lexicalResource: weightedCriterion("lexicalResource"),
            grammarRangeAccuracy: weightedCriterion("grammarRangeAccuracy"),
            overall: roundIeltsOverallBand(
                (Number(task1.scores.overall) + 2 * Number(task2.scores.overall)) / 3
            )
        },
        feedback: {
            strengths: uniqueList([
                ...(task1.feedback?.strengths || []),
                ...(task2.feedback?.strengths || [])
            ]).slice(0, 6),
            weaknesses: uniqueList([
                ...(task1.feedback?.weaknesses || []),
                ...(task2.feedback?.weaknesses || [])
            ]).slice(0, 6),
            improvementTips: uniqueList([
                ...(task1.feedback?.improvementTips || []),
                ...(task2.feedback?.improvementTips || [])
            ]).slice(0, 6)
        },
        criterionFeedback: {
            taskResponse: uniqueList([
                task1.criterionFeedback?.taskResponse
                    ? `Task 1: ${task1.criterionFeedback.taskResponse}`
                    : "",
                task2.criterionFeedback?.taskResponse
                    ? `Task 2: ${task2.criterionFeedback.taskResponse}`
                    : ""
            ]).join(" "),
            coherenceCohesion: uniqueList([
                task1.criterionFeedback?.coherenceCohesion
                    ? `Task 1: ${task1.criterionFeedback.coherenceCohesion}`
                    : "",
                task2.criterionFeedback?.coherenceCohesion
                    ? `Task 2: ${task2.criterionFeedback.coherenceCohesion}`
                    : ""
            ]).join(" "),
            lexicalResource: uniqueList([
                task1.criterionFeedback?.lexicalResource
                    ? `Task 1: ${task1.criterionFeedback.lexicalResource}`
                    : "",
                task2.criterionFeedback?.lexicalResource
                    ? `Task 2: ${task2.criterionFeedback.lexicalResource}`
                    : ""
            ]).join(" "),
            grammarRangeAccuracy: uniqueList([
                task1.criterionFeedback?.grammarRangeAccuracy
                    ? `Task 1: ${task1.criterionFeedback.grammarRangeAccuracy}`
                    : "",
                task2.criterionFeedback?.grammarRangeAccuracy
                    ? `Task 2: ${task2.criterionFeedback.grammarRangeAccuracy}`
                    : ""
            ]).join(" ")
        }
    };

    return assessment;
};

module.exports = {
    MIN_WORDS_BY_TASK,
    WRITING_RESPONSE_SCHEMA,
    buildLegacyResultPayload,
    buildOverallAssessmentFromTasks,
    countWords,
    createStoredWritingResultPayload,
    gradeWritingEssay,
    normalizeStoredWritingResult,
    roundIeltsOverallBand
};
