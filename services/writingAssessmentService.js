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

const STOP_WORDS = new Set([
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "into",
    "onto",
    "about",
    "there",
    "their",
    "they",
    "them",
    "then",
    "than",
    "have",
    "has",
    "had",
    "were",
    "was",
    "will",
    "would",
    "could",
    "should",
    "because",
    "while",
    "where",
    "which",
    "what",
    "when",
    "your",
    "essay",
    "task",
    "question",
    "write",
    "words",
    "word",
    "about",
    "into",
    "through",
    "over",
    "under",
    "between",
    "among",
    "after",
    "before",
    "also",
    "very",
    "more",
    "most",
    "such",
    "many",
    "much",
    "some",
    "only",
    "just",
    "been",
    "being",
    "does",
    "did",
    "each",
    "other",
    "than",
    "students",
    "student"
]);

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

const extractWords = (text = "") =>
    String(text)
        .toLowerCase()
        .match(/[a-z]+(?:['’-][a-z]+)*/g) || [];

const splitParagraphs = (text = "") =>
    String(text)
        .split(/\r?\n\s*\r?\n/)
        .map((part) => part.trim())
        .filter(Boolean);

const splitSentences = (text = "") =>
    String(text)
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

const extractPromptKeywords = (question = "") =>
    uniqueList(
        extractWords(question).filter(
            (word) => word.length > 3 && !STOP_WORDS.has(word)
        )
    );

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

const buildQualityFlags = ({ essay, question, taskType, wordCount }) => {
    const minWords = MIN_WORDS_BY_TASK[taskType] || 0;
    const shortfall = Math.max(0, minWords - wordCount);
    const shortfallRatio = minWords ? shortfall / minWords : 0;
    const text = normalizeText(essay);
    const lowerEssay = text.toLowerCase();
    const paragraphs = splitParagraphs(text);
    const sentences = splitSentences(text);
    const words = extractWords(text);
    const contentWords = words.filter(
        (word) => word.length > 2 && !STOP_WORDS.has(word)
    );
    const promptKeywords = extractPromptKeywords(question);

    const wordFrequency = new Map();
    for (const word of contentWords) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }

    const uniqueWordRatio = contentWords.length
        ? new Set(contentWords).size / contentWords.length
        : 1;
    const repeatedWords = [...wordFrequency.values()].filter((count) => count >= 4).length;
    const dominantWordShare = contentWords.length
        ? Math.max(...wordFrequency.values(), 0) / contentWords.length
        : 0;

    const promptKeywordMatches = promptKeywords.filter((keyword) =>
        lowerEssay.includes(keyword)
    ).length;
    const promptCoverage = promptKeywords.length
        ? promptKeywordMatches / promptKeywords.length
        : 1;

    const missingEndingPunctuation = sentences.filter(
        (sentence) => !/[.!?]["')\]]?$/.test(sentence)
    ).length;
    const lowercaseSentenceStarts = sentences.filter((sentence) =>
        /^[a-z]/.test(sentence)
    ).length;
    const repeatedConsecutiveWords =
        (lowerEssay.match(/\b([a-z]+)\s+\1\b/g) || []).length;
    const lowercaseStandaloneI = (text.match(/\bi\b/g) || []).length;
    const missingPunctuationRatio = sentences.length
        ? missingEndingPunctuation / sentences.length
        : 0;
    const lowercaseStartRatio = sentences.length
        ? lowercaseSentenceStarts / sentences.length
        : 0;

    const requiredParagraphs = taskType === "task2" ? 3 : 2;
    const poorParagraphing = paragraphs.length < requiredParagraphs;

    return {
        minWords,
        shortfallRatio,
        underLength: wordCount < minWords,
        veryShort: wordCount < minWords * 0.8,
        severelyShort: wordCount < minWords * 0.65,
        repeatedGrammarErrors:
            repeatedConsecutiveWords >= 2 ||
            lowercaseStandaloneI >= 3 ||
            (missingPunctuationRatio >= 0.4 && sentences.length >= 3) ||
            (lowercaseStartRatio >= 0.4 && sentences.length >= 3),
        unclearTaskResponse:
            (promptKeywords.length >= 4 && promptCoverage < 0.2) ||
            wordCount < minWords * 0.6,
        poorlyOrganized:
            poorParagraphing ||
            (paragraphs.length === 1 && sentences.length >= requiredParagraphs + 1),
        basicOrRepetitiveVocabulary:
            (contentWords.length >= 40 && uniqueWordRatio < 0.45) ||
            dominantWordShare > 0.1 ||
            repeatedWords >= 4,
        promptCoverage,
        paragraphCount: paragraphs.length,
        uniqueWordRatio
    };
};

const applyScoreGuards = (scores, flags) => {
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

    if (flags.underLength) {
        const penalty =
            flags.severelyShort ? 2 : flags.veryShort ? 1.5 : flags.shortfallRatio >= 0.1 ? 1 : 0.5;

        next.taskResponse = Math.max(0, next.taskResponse - penalty);
        next.taskResponse = Math.min(next.taskResponse, flags.severelyShort ? 5.5 : 6);

        if (flags.veryShort) {
            next.coherenceCohesion = Math.min(next.coherenceCohesion, 6);
            next.lexicalResource = Math.min(next.lexicalResource, 6.5);
        }

        if (flags.severelyShort) {
            next.coherenceCohesion = Math.min(next.coherenceCohesion, 5.5);
            next.lexicalResource = Math.min(next.lexicalResource, 6);
            next.grammarRangeAccuracy = Math.min(next.grammarRangeAccuracy, 6);
        }
    }

    if (flags.repeatedGrammarErrors) {
        next.grammarRangeAccuracy = Math.min(next.grammarRangeAccuracy, 6.5);
    }

    if (flags.unclearTaskResponse) {
        next.taskResponse = Math.min(next.taskResponse, 6);
    }

    if (flags.poorlyOrganized) {
        next.coherenceCohesion = Math.min(next.coherenceCohesion, 6);
    }

    if (flags.basicOrRepetitiveVocabulary) {
        next.lexicalResource = Math.min(next.lexicalResource, 6.5);
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

    return `
You are a strict IELTS Writing examiner.
Return JSON only. Do not include markdown, code fences, or extra text.
Write all feedback strings in ${feedbackLanguage}.

Evaluate the essay using the official IELTS Writing criteria only:
1. Task Response / Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Scoring rules you must follow:
- Score each criterion from 0 to 9.
- The essay is ${taskType}. Minimum word count is ${minWords}.
- If the essay is under the minimum word count, lower the score, especially Task Response / Task Achievement.
- Do not give high scores to essays that are too short.
- If grammar has many repeated errors, Grammar must not exceed 6.5.
- If the essay does not clearly answer the question, Task Response must not exceed 6.
- If paragraphs are missing or ideas are poorly organized, Coherence and Cohesion must not exceed 6.
- If vocabulary is basic or repetitive, Lexical Resource must not exceed 6.5.
- Keep feedback concise, specific, and evidence-based.
- Set scores.overall to the average of the four criterion scores before IELTS rounding.

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
    const flags = buildQualityFlags({
        essay,
        question,
        taskType,
        wordCount
    });
    const guardedScores = applyScoreGuards(baseScores, flags);

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
