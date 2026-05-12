const express = require("express");
const OpenAI = require("openai");
const auth = require("../middleware/auth");
const WritingResult = require("../models/WritingResult");
const {
    SINGLE_AI_CHECK_LIMIT,
    checkSingleAiAccess
} = require("../utils/aiWritingLimit");

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY
    ? new OpenAI({ apiKey: OPENAI_API_KEY })
    : null;

const RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        estimated_band: { type: "number", minimum: 0, maximum: 9 },
        grammar_feedback: { type: "string" },
        vocabulary_feedback: { type: "string" },
        coherence_feedback: { type: "string" },
        improvement_tips: { type: "string" }
    },
    required: [
        "estimated_band",
        "grammar_feedback",
        "vocabulary_feedback",
        "coherence_feedback",
        "improvement_tips"
    ]
};

const buildPrompt = ({ essayText, taskType }) => {
    return `
You are an IELTS Writing examiner.

Evaluate the essay and return ONLY valid JSON.

Task type: ${taskType}

Essay:
${essayText.trim()}
`;
};

router.post("/ai-check", auth, async (req, res) => {
    try {
        // API KEY CHECK
        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                message: "OPENAI_API_KEY sozlanmagan"
            });
        }

        const { essayText, taskType } = req.body || {};

        // VALIDATION
        if (!essayText || typeof essayText !== "string" || !essayText.trim()) {
            return res.status(400).json({
                message: "essayText kerak"
            });
        }

        if (!["task1", "task2"].includes(taskType)) {
            return res.status(400).json({
                message: "taskType task1 yoki task2 bo'lishi kerak"
            });
        }

        const access = await checkSingleAiAccess({
            userId: req.user.id,
            taskType,
            limit: SINGLE_AI_CHECK_LIMIT
        });

        if (!access.allowed) {
            return res.status(429).json({ message: access.message });
        }

        const prompt = buildPrompt({ essayText, taskType });

        // OPENAI CALL
        const aiResponse = await client.responses.create({
            model: OPENAI_MODEL,
            input: prompt,
            temperature: 0.2,
            text: {
                format: {
                    type: "json_schema",
                    name: "ielts_writing_result",
                    strict: true,
                    schema: RESPONSE_SCHEMA
                }
            }
        });

        // 🔥 ENG MUHIM JOY
        const result = aiResponse.output_parsed;

        if (!result) {
            console.error("AI response:", aiResponse);
            return res.status(500).json({
                message: "AI javobi parse bo'lmadi"
            });
        }

        // Normalize to satisfy WritingResult schema + UI expectations
        if (result.estimated_band != null && result.band_score == null) {
            result.band_score = result.estimated_band;
        }

        // SAVE TO DB
        await WritingResult.create({
            userId: req.user.id,
            essayText: essayText.trim(),
            taskType,
            result
        });

        return res.json({
            success: true,
            result
        });

    } catch (err) {
        console.error("AI writing check error:", err);

        if (err?.status) {
            return res.status(err.status).json({
                message: "OpenAI API xatosi",
                details: err.message || "Unknown error"
            });
        }

        return res.status(500).json({
            message: "Server xatosi"
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

        for (const r of results) {
            if (r.result) {
                if (r.result.estimated_band == null && r.result.band_score != null) {
                    r.result.estimated_band = r.result.band_score;
                }
                if (r.result.band_score == null && r.result.estimated_band != null) {
                    r.result.band_score = r.result.estimated_band;
                }
            }
        }

        return res.json(results);

    } catch (err) {
        console.error("AI writing results error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

module.exports = router;
