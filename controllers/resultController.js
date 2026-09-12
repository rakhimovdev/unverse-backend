const Result = require("../models/Result");
const { saveSpeakingResult } = require("../services/resultService");

const MODULE_QUERY_MAP = {
    reading: "Reading",
    listening: "Listening",
    writing: "Writing",
    speaking: "Speaking"
};

const normalizeModuleType = (value) => {
    const moduleKey = String(value || "")
        .trim()
        .toLowerCase();

    return MODULE_QUERY_MAP[moduleKey] || "";
};

const buildListQuery = (req, includeUser = false) => {
    const query = {};
    const moduleType = normalizeModuleType(
        req.query.module || req.query.moduleType
    );

    if (!includeUser) {
        query.userId = req.user.id;
    } else {
        const userId = String(req.query.userId || "").trim();

        if (userId) query.userId = userId;
    }

    if (moduleType) query.moduleType = moduleType;

    return Result.find(query)
        .sort({ createdAt: -1 })
        .populate("userId", "fullname name lastname email username role")
        .lean();
};

const getResults = async (req, res) => {
    try {
        const results = await buildListQuery(req, false);
        return res.json(results);
    } catch (err) {
        console.error("Get results error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
};

const getResultById = async (req, res) => {
    try {
        const filter = { _id: req.params.id };

        if (req.user.role !== "admin") {
            filter.userId = req.user.id;
        }

        const result = await Result.findOne(filter)
            .populate("userId", "fullname name lastname email username role")
            .lean();

        if (!result) {
            return res.status(404).json({ message: "Natija topilmadi" });
        }

        return res.json(result);
    } catch (err) {
        console.error("Get result detail error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
};

const getResultComparison = async (req, res) => {
    try {
        const resolving = await Result.findOne({
            _id: req.params.id,
            userId: req.user.id,
            moduleType: { $in: ["Reading", "Listening"] },
            mode: "resolving"
        }).lean();

        if (!resolving || !resolving.solvingAttemptId) {
            return res.status(404).json({ message: "Resolving result topilmadi" });
        }

        const solving = await Result.findOne({
            _id: resolving.solvingAttemptId,
            userId: req.user.id,
            moduleType: resolving.moduleType,
            testId: resolving.testId,
            mode: "solving"
        }).lean();

        if (!solving) {
            return res.status(404).json({ message: "Solving result topilmadi" });
        }

        const resultData = (result) =>
            result.moduleType === "Reading" ? result.reading : result.listening;
        const solvingData = resultData(solving) || {};
        const resolvingData = resultData(resolving) || {};
        const solvingItems = [
            ...(solvingData.correctAnswers || []),
            ...(solvingData.wrongAnswers || [])
        ].sort((a, b) => a.questionNumber - b.questionNumber);
        const resolvingItems = [
            ...(resolvingData.correctAnswers || []),
            ...(resolvingData.wrongAnswers || [])
        ].sort((a, b) => a.questionNumber - b.questionNumber);
        const questions = Array.from(
            { length: Math.max(solvingItems.length, resolvingItems.length) },
            (_, index) => {
                const before = solvingItems[index] || {};
                const after = resolvingItems[index] || {};
                const beforeCorrect = (solvingData.correctAnswers || []).some(
                    (item) => item.questionNumber === before.questionNumber
                );
                const afterCorrect = (resolvingData.correctAnswers || []).some(
                    (item) => item.questionNumber === after.questionNumber
                );
                let status = "Still Wrong";
                if (beforeCorrect && afterCorrect) status = "Correct in both";
                else if (!beforeCorrect && afterCorrect) status = "Improved";
                else if (beforeCorrect && !afterCorrect) status = "Changed to Wrong";
                return {
                    questionNumber: after.questionNumber || before.questionNumber || index + 1,
                    solvingAnswer: before.userAnswer || "",
                    resolvingAnswer: after.userAnswer || "",
                    correctAnswer: after.correctAnswer || before.correctAnswer || "",
                    status
                };
            }
        );

        const solvingScore = Number(solvingData.rawScore) || 0;
        const resolvingScore = Number(resolvingData.rawScore) || 0;
        return res.json({
            solving,
            resolving,
            questions,
            gain: {
                questions: resolvingScore - solvingScore,
                band:
                    (Number(resolving.overallBand) || 0) -
                    (Number(solving.overallBand) || 0),
                time: (Number(resolving.timeSpent) || 0) - (Number(solving.timeSpent) || 0)
            },
            insight:
                resolvingScore - solvingScore >= 4
                    ? "Your score improved considerably when there was no time pressure. This may indicate that time management is affecting your exam performance."
                    : "Your results are similar in both modes. Your main challenge may not be time pressure."
        });
    } catch (err) {
        console.error("Get result comparison error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
};

const getAdminResults = async (req, res) => {
    try {
        const results = await buildListQuery(req, true);
        return res.json(results);
    } catch (err) {
        console.error("Admin results error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
};

const createSpeakingResult = async (req, res) => {
    try {
        const { testId, testName, attemptKey, speaking } = req.body || {};

        if (!speaking || typeof speaking !== "object") {
            return res.status(400).json({ message: "speaking payload kerak" });
        }

        const result = await saveSpeakingResult({
            userId: req.user.id,
            testId: testId || null,
            testName,
            attemptKey,
            speaking
        });

        return res.status(201).json({
            message: "Speaking result saved successfully.",
            result
        });
    } catch (err) {
        console.error("Create speaking result error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
};

module.exports = {
    getResults,
    getResultById,
    getResultComparison,
    getAdminResults,
    createSpeakingResult
};
