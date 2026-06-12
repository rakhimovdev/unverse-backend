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
    getAdminResults,
    createSpeakingResult
};
