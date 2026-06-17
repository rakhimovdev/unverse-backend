const express = require("express");
const OpenAI = require("openai");

const auth = require("../middleware/auth");
const User = require("../models/User");
const Writing = require("../models/writing");
const WritingResult = require("../models/WritingResult");
const { syncWritingResult } = require("../services/resultService");
const {
    buildOverallAssessmentFromTasks,
    createStoredWritingResultPayload,
    gradeWritingEssay,
    normalizeStoredWritingResult
} = require("../services/writingAssessmentService");
const {
    checkWritingAccess,
    consumeWritingCheck
} = require("../utils/aiWritingLimit");

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const normalizeText = (value, fallback = "") =>
    typeof value === "string" ? value.trim() : fallback;

const resolveTestName = (writingDoc) =>
    normalizeText(writingDoc?.task1Topic || writingDoc?.topic) || "Writing Test";

const resolveQuestion = ({ explicitPrompt, writingDoc, taskType }) => {
    const direct = normalizeText(explicitPrompt);
    if (direct) return direct;

    if (!writingDoc) return "";

    if (taskType === "task1") {
        return (
            normalizeText(writingDoc.task1Text) ||
            normalizeText(writingDoc.taskText) ||
            normalizeText(writingDoc.task1Topic || writingDoc.topic)
        );
    }

    return (
        normalizeText(writingDoc.task2Text) ||
        normalizeText(writingDoc.taskText) ||
        normalizeText(writingDoc.task2Topic || writingDoc.task1Topic || writingDoc.topic)
    );
};

const buildAttemptFilter = ({ userId, writingId, attemptKey }) => {
    const filter = { userId };

    if (normalizeText(attemptKey)) {
        filter.attemptKey = normalizeText(attemptKey);
        return filter;
    }

    if (writingId) {
        filter.writingId = writingId;
    }

    return filter;
};

const createOverallRecord = async ({
    userId,
    writingId = null,
    attemptKey = "",
    testName = "",
    task1Doc,
    task2Doc
}) => {
    const overallAssessment = buildOverallAssessmentFromTasks(task1Doc, task2Doc);
    if (!overallAssessment) return null;

    const task1 = normalizeStoredWritingResult(task1Doc);
    const task2 = normalizeStoredWritingResult(task2Doc);

    const overallQuestion = [task1.question, task2.question].filter(Boolean).join("\n\n");

    const payload = createStoredWritingResultPayload({
        userId,
        writingId,
        attemptKey,
        testName,
        taskType: "overall",
        question: overallQuestion,
        essay: "",
        assessment: overallAssessment
    });

    const overallDoc = await WritingResult.findOneAndUpdate(
        {
            userId,
            writingId: writingId || null,
            attemptKey: normalizeText(attemptKey),
            taskType: "overall"
        },
        { $set: payload },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return normalizeStoredWritingResult(overallDoc);
};

router.post("/writing/grade", auth, async (req, res) => {
    try {
        if (!OPENAI_API_KEY || !client) {
            return res.status(500).json({
                message: "OPENAI_API_KEY sozlanmagan"
            });
        }

        const { essay, task, prompt, language, writingId, attemptKey } = req.body || {};
        const cleanEssay = normalizeText(essay);

        if (!cleanEssay) {
            return res.status(400).json({
                message: "Essay matni kerak"
            });
        }

        if (!["task1", "task2"].includes(task)) {
            return res.status(400).json({
                message: "task task1 yoki task2 bo'lishi kerak"
            });
        }

        const [user, writingDoc] = await Promise.all([
            req.userDoc || User.findById(req.user.id),
            writingId ? Writing.findById(writingId).lean() : Promise.resolve(null)
        ]);

        if (!user) {
            return res.status(404).json({
                message: "User topilmadi"
            });
        }

        if (writingId && !writingDoc) {
            return res.status(404).json({
                message: "Writing test topilmadi"
            });
        }

        const access = await checkWritingAccess({
            user,
            writingId,
            taskType: task
        });

        if (!access.allowed) {
            if (user.isModified()) {
                await user.save();
            }

            return res.status(access.status || 403).json({
                message: access.message
            });
        }

        const question = resolveQuestion({
            explicitPrompt: prompt,
            writingDoc,
            taskType: task
        });
        const testName = resolveTestName(writingDoc);

        const assessment = await gradeWritingEssay({
            client,
            model: OPENAI_MODEL,
            essay: cleanEssay,
            taskType: task,
            question,
            language
        });

        if (access.shouldConsume) {
            consumeWritingCheck(user);
        }

        const storedPayload = createStoredWritingResultPayload({
            userId: req.user.id,
            writingId: writingId || null,
            attemptKey,
            testName,
            taskType: task,
            question,
            essay: cleanEssay,
            assessment
        });

        const taskDoc = await WritingResult.create(storedPayload);

        const attemptFilter = buildAttemptFilter({
            userId: req.user.id,
            writingId: writingId || null,
            attemptKey
        });

        const [task1Doc, task2Doc] = await Promise.all([
            WritingResult.findOne({ ...attemptFilter, taskType: "task1" })
                .sort({ createdAt: -1 }),
            WritingResult.findOne({ ...attemptFilter, taskType: "task2" })
                .sort({ createdAt: -1 })
        ]);

        let overall = null;
        if (task1Doc && task2Doc) {
            overall = await createOverallRecord({
                userId: req.user.id,
                writingId: writingId || null,
                attemptKey,
                testName,
                task1Doc,
                task2Doc
            });

            await syncWritingResult({
                userId: req.user.id,
                testId: writingId || null,
                testName,
                attemptKey
            });
        }

        await (user.isModified() ? user.save() : Promise.resolve());

        return res.json({
            success: true,
            result: normalizeStoredWritingResult(taskDoc),
            overall
        });
    } catch (err) {
        console.error("AI writing grade error:", err);

        const status = err.status || 500;
        const message =
            err.exposeToClient || status < 500
                ? err.message
                : "Writing AI check failed. Please try again.";

        return res.status(status).json({
            message
        });
    }
});

router.get("/writing/results", auth, async (req, res) => {
    try {
        const filter = {
            userId:
                req.user?.role === "admin" && req.query.userId
                    ? req.query.userId
                    : req.user.id
        };

        const results = await WritingResult.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            result: results.map((item) => normalizeStoredWritingResult(item))
        });
    } catch (err) {
        console.error("AI writing results error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

module.exports = router;
