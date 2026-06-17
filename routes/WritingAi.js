const express = require("express");
const OpenAI = require("openai");

const auth = require("../middleware/auth");
const User = require("../models/User");
const WritingResult = require("../models/WritingResult");
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

const buildAttemptFilter = ({ userId, writingId, attemptKey }) => {
    const filter = { userId };

    if (normalizeText(attemptKey)) {
        filter.attemptKey = normalizeText(attemptKey);
    } else if (writingId) {
        filter.writingId = writingId;
    }

    return filter;
};

router.post("/ai-check", auth, async (req, res) => {
    try {
        if (!OPENAI_API_KEY || !client) {
            return res.status(500).json({
                message: "OPENAI_API_KEY sozlanmagan"
            });
        }

        const {
            essayText,
            taskType,
            question,
            prompt,
            testName,
            writingId,
            attemptKey,
            language
        } = req.body || {};

        const cleanEssay = normalizeText(essayText);
        if (!cleanEssay) {
            return res.status(400).json({
                message: "essayText kerak"
            });
        }

        if (!["task1", "task2"].includes(taskType)) {
            return res.status(400).json({
                message: "taskType task1 yoki task2 bo'lishi kerak"
            });
        }

        const user = req.userDoc || (await User.findById(req.user.id));
        if (!user) {
            return res.status(404).json({
                message: "User topilmadi"
            });
        }

        const access = await checkWritingAccess({
            user,
            writingId,
            taskType
        });

        if (!access.allowed) {
            if (user.isModified()) {
                await user.save();
            }

            return res.status(access.status || 403).json({
                message: access.message
            });
        }

        const cleanQuestion = normalizeText(question || prompt);
        const assessment = await gradeWritingEssay({
            client,
            model: OPENAI_MODEL,
            essay: cleanEssay,
            taskType,
            question: cleanQuestion,
            language
        });

        if (access.shouldConsume) {
            consumeWritingCheck(user);
        }

        const savedDoc = await WritingResult.create(
            createStoredWritingResultPayload({
                userId: req.user.id,
                writingId: writingId || null,
                attemptKey,
                testName: normalizeText(testName) || "Writing Test",
                taskType,
                question: cleanQuestion,
                essay: cleanEssay,
                assessment
            })
        );

        const filter = buildAttemptFilter({
            userId: req.user.id,
            writingId: writingId || null,
            attemptKey
        });

        const [task1Doc, task2Doc] = await Promise.all([
            WritingResult.findOne({ ...filter, taskType: "task1" }).sort({
                createdAt: -1
            }),
            WritingResult.findOne({ ...filter, taskType: "task2" }).sort({
                createdAt: -1
            })
        ]);

        let overall = null;
        if (task1Doc && task2Doc) {
            overall = buildOverallAssessmentFromTasks(task1Doc, task2Doc);
        }

        await (user.isModified() ? user.save() : Promise.resolve());

        return res.json({
            success: true,
            result: normalizeStoredWritingResult(savedDoc),
            overall
        });
    } catch (err) {
        console.error("AI writing check error:", err);

        const status = err.status || 500;
        return res.status(status).json({
            message:
                err.exposeToClient || status < 500
                    ? err.message
                    : "Writing AI check failed. Please try again."
        });
    }
});

router.get("/ai-results", auth, async (req, res) => {
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

        return res.json(results.map((item) => normalizeStoredWritingResult(item)));
    } catch (err) {
        console.error("AI writing results error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

module.exports = router;
