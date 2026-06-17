const Result = require("../models/Result");
const WritingResult = require("../models/WritingResult");
const {
    buildOverallAssessmentFromTasks,
    normalizeStoredWritingResult
} = require("./writingAssessmentService");
const {
    averageBands,
    roundToHalfBand
} = require("../utils/ieltsBands");

const toFiniteNumber = (value, fallback = null) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const normalizeText = (value, fallback = "") =>
    typeof value === "string" ? value.trim() : fallback;

const normalizeList = (value) =>
    Array.isArray(value)
        ? value
              .map((item) => normalizeText(item))
              .filter(Boolean)
        : [];

const normalizeBreakdown = (items = [], prefix = "Section") =>
    (Array.isArray(items) ? items : []).map((item, index) => ({
        label: normalizeText(item?.label) || `${prefix} ${index + 1}`,
        correct: toFiniteNumber(item?.correct, 0) || 0,
        total: toFiniteNumber(item?.total, 0) || 0
    }));

const buildExplanation = (correctAnswer, moduleLabel) => {
    const safeAnswer = normalizeText(correctAnswer);
    if (!safeAnswer) {
        return `Review the official ${moduleLabel.toLowerCase()} key for this item.`;
    }
    return `Correct answer: ${safeAnswer}. Compare it with your response and review the related ${moduleLabel.toLowerCase()} content.`;
};

const normalizeReviewItem = (item, index, labelPrefix) => ({
    questionNumber: toFiniteNumber(item?.questionNumber, index + 1) || index + 1,
    groupNumber: toFiniteNumber(item?.groupNumber, 0) || 0,
    label:
        normalizeText(item?.label) ||
        `${labelPrefix} ${toFiniteNumber(item?.questionNumber, index + 1) || index + 1}`,
    prompt: normalizeText(item?.prompt),
    questionType: normalizeText(item?.questionType),
    userAnswer: normalizeText(item?.userAnswer),
    correctAnswer: normalizeText(item?.correctAnswer),
    explanation:
        normalizeText(item?.explanation) ||
        buildExplanation(item?.correctAnswer, labelPrefix)
});

const buildTaskPayload = (taskDoc) => {
    const task = normalizeStoredWritingResult(taskDoc);
    const result = task?.result || {};

    return {
        bandScore:
            toFiniteNumber(task?.scores?.overall, null) ??
            toFiniteNumber(result.band_score, null),
        essayText: normalizeText(task?.essay),
        prompt: normalizeText(task?.question || task?.prompt),
        question: normalizeText(task?.question || task?.prompt),
        wordCount: toFiniteNumber(task?.wordCount, 0) || 0,
        taskResponseScore: toFiniteNumber(task?.scores?.taskResponse, null),
        coherenceCohesionScore: toFiniteNumber(
            task?.scores?.coherenceCohesion,
            null
        ),
        lexicalResourceScore: toFiniteNumber(task?.scores?.lexicalResource, null),
        grammarRangeAccuracyScore: toFiniteNumber(
            task?.scores?.grammarRangeAccuracy,
            null
        ),
        strengths: normalizeList(task?.feedback?.strengths),
        grammarFeedback: normalizeList(result.grammar_feedback),
        vocabularyFeedback: normalizeList(result.vocabulary_feedback),
        coherenceFeedback: normalizeList(result.coherence_feedback),
        weaknesses: normalizeList(task?.feedback?.weaknesses || result.weaknesses),
        improvementTips: normalizeList(
            task?.feedback?.improvementTips || result.improvement_tips
        ),
        criterionFeedback: {
            taskResponse: normalizeText(task?.criterionFeedback?.taskResponse),
            coherenceCohesion: normalizeText(
                task?.criterionFeedback?.coherenceCohesion
            ),
            lexicalResource: normalizeText(task?.criterionFeedback?.lexicalResource),
            grammarRangeAccuracy: normalizeText(
                task?.criterionFeedback?.grammarRangeAccuracy
            )
        },
        finalSummary: normalizeText(result.final_summary)
    };
};

const upsertResult = async ({ userId, moduleType, attemptKey, payload }) => {
    const cleanAttemptKey = normalizeText(attemptKey);

    if (!cleanAttemptKey) {
        return Result.create(payload);
    }

    return Result.findOneAndUpdate(
        {
            userId,
            moduleType,
            attemptKey: cleanAttemptKey
        },
        { $set: payload },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
};

const saveReadingResult = async ({
    userId,
    testId = null,
    testName = "",
    attemptKey = "",
    reading = {}
}) => {
    const payload = {
        userId,
        attemptKey: normalizeText(attemptKey),
        testId,
        testName: normalizeText(testName) || "Reading Test",
        moduleType: "Reading",
        reading: {
            passageScores: normalizeBreakdown(reading.passageScores, "Passage"),
            rawScore: toFiniteNumber(reading.rawScore, 0) || 0,
            rawTotal: toFiniteNumber(reading.rawTotal, 40) || 40,
            academicBand: toFiniteNumber(reading.academicBand, null),
            generalBand: toFiniteNumber(reading.generalBand, null),
            correctAnswers: (reading.correctAnswers || []).map((item, index) =>
                normalizeReviewItem(item, index, "Reading")
            ),
            wrongAnswers: (reading.wrongAnswers || []).map((item, index) =>
                normalizeReviewItem(item, index, "Reading")
            )
        },
        listening: {},
        writing: {},
        speaking: {},
        overallBand:
            toFiniteNumber(reading.academicBand, null) ??
            toFiniteNumber(reading.generalBand, null)
    };

    return upsertResult({ userId, moduleType: "Reading", attemptKey, payload });
};

const saveListeningResult = async ({
    userId,
    testId = null,
    testName = "",
    attemptKey = "",
    listening = {}
}) => {
    const payload = {
        userId,
        attemptKey: normalizeText(attemptKey),
        testId,
        testName: normalizeText(testName) || "Listening Test",
        moduleType: "Listening",
        reading: {},
        listening: {
            sectionScores: normalizeBreakdown(listening.sectionScores, "Section"),
            rawScore: toFiniteNumber(listening.rawScore, 0) || 0,
            rawTotal: toFiniteNumber(listening.rawTotal, 40) || 40,
            academicBand: toFiniteNumber(listening.academicBand, null),
            generalBand: toFiniteNumber(listening.generalBand, null),
            correctAnswers: (listening.correctAnswers || []).map((item, index) =>
                normalizeReviewItem(item, index, "Listening")
            ),
            wrongAnswers: (listening.wrongAnswers || []).map((item, index) =>
                normalizeReviewItem(item, index, "Listening")
            )
        },
        writing: {},
        speaking: {},
        overallBand:
            toFiniteNumber(listening.academicBand, null) ??
            toFiniteNumber(listening.generalBand, null)
    };

    return upsertResult({ userId, moduleType: "Listening", attemptKey, payload });
};

const buildWritingSummary = (task1, task2) => {
    const summaries = [task1?.finalSummary, task2?.finalSummary].filter(Boolean);
    const strengthPool = [...(task1?.strengths || []), ...(task2?.strengths || [])];
    const weaknessPool = [...(task1?.weaknesses || []), ...(task2?.weaknesses || [])];
    const tipPool = [...(task1?.improvementTips || []), ...(task2?.improvementTips || [])];

    if (summaries.length) return summaries.join(" ");
    if (strengthPool.length || weaknessPool.length || tipPool.length) {
        const parts = [];
        if (strengthPool.length) {
            parts.push(`Strengths: ${strengthPool.slice(0, 3).join("; ")}.`);
        }
        if (weaknessPool.length) {
            parts.push(`Main weaknesses: ${weaknessPool.slice(0, 3).join("; ")}.`);
        }
        if (tipPool.length) {
            parts.push(`Priority tips: ${tipPool.slice(0, 3).join("; ")}.`);
        }
        return parts.join(" ");
    }

    return "AI feedback is available for both writing tasks.";
};

const syncWritingResult = async ({
    userId,
    testId = null,
    testName = "",
    attemptKey = ""
}) => {
    const cleanAttemptKey = normalizeText(attemptKey);
    const filter = { userId };

    if (cleanAttemptKey) {
        filter.attemptKey = cleanAttemptKey;
    } else if (testId) {
        filter.writingId = testId;
    } else {
        return null;
    }

    const [task1Doc, task2Doc] = await Promise.all([
        WritingResult.findOne({ ...filter, taskType: "task1" })
            .sort({ createdAt: -1 })
            .lean(),
        WritingResult.findOne({ ...filter, taskType: "task2" })
            .sort({ createdAt: -1 })
            .lean()
    ]);

    if (!task1Doc || !task2Doc) {
        return null;
    }

    const task1 = buildTaskPayload(task1Doc);
    const task2 = buildTaskPayload(task2Doc);
    const overallAssessment = buildOverallAssessmentFromTasks(task1Doc, task2Doc);
    const weightedBand =
        toFiniteNumber(overallAssessment?.scores?.overall, null) ??
        roundToHalfBand((Number(task1.bandScore) + 2 * Number(task2.bandScore)) / 3);
    const overallBand =
        weightedBand != null
            ? weightedBand
            : averageBands([task1.bandScore, task2.bandScore]);
    const finalSummary = buildWritingSummary(task1, task2);

    const payload = {
        userId,
        attemptKey: cleanAttemptKey,
        testId,
        testName: normalizeText(testName) || "Writing Test",
        moduleType: "Writing",
        reading: {},
        listening: {},
        writing: {
            task1,
            task2,
            overallBand,
            finalSummary
        },
        speaking: {},
        overallBand
    };

    return upsertResult({ userId, moduleType: "Writing", attemptKey: cleanAttemptKey, payload });
};

const saveSpeakingResult = async ({
    userId,
    testId = null,
    testName = "",
    attemptKey = "",
    speaking = {}
}) => {
    const fluency = toFiniteNumber(speaking.fluency, null);
    const pronunciation = toFiniteNumber(speaking.pronunciation, null);
    const grammar = toFiniteNumber(speaking.grammar, null);
    const vocabulary = toFiniteNumber(speaking.vocabulary, null);
    const overallBand =
        toFiniteNumber(speaking.overallBand, null) ??
        averageBands([fluency, pronunciation, grammar, vocabulary]);

    const payload = {
        userId,
        attemptKey: normalizeText(attemptKey),
        testId,
        testName: normalizeText(testName) || "Speaking Test",
        moduleType: "Speaking",
        reading: {},
        listening: {},
        writing: {},
        speaking: {
            fluency,
            pronunciation,
            grammar,
            vocabulary,
            overallBand,
            detailedFeedback: normalizeList(speaking.detailedFeedback),
            weaknesses: normalizeList(speaking.weaknesses),
            improvementTips: normalizeList(speaking.improvementTips)
        },
        overallBand
    };

    return upsertResult({ userId, moduleType: "Speaking", attemptKey, payload });
};

module.exports = {
    saveReadingResult,
    saveListeningResult,
    syncWritingResult,
    saveSpeakingResult
};
