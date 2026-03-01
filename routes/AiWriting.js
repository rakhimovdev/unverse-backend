const express = require("express");
const OpenAI = require("openai");
const router = express.Router();

const auth = require("../middleware/auth");
const WritingResult = require("../models/WritingResult");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const ALLOWED_ROLES = new Set(["admin", "mooc", "mock_user"]);

const jsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        band_score: { type: "number", minimum: 0, maximum: 9 },
        grammar_feedback: {
            type: "array",
            items: { type: "string" }
        },
        improvement_tips: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["band_score", "grammar_feedback", "improvement_tips"]
};

const buildPrompt = ({ essay, task, prompt, language }) => {
    const lang = (language || "uz").toLowerCase();
    const langLabel = lang === "en" ? "English" : "Uzbek";

    return `
You are an IELTS Writing examiner.
Respond in ${langLabel}.
Return ONLY valid JSON.

Task: ${task || ""}
Question: ${prompt || ""}

Essay:
${essay}
`;
};

router.post("/writing/grade", auth, async (req, res) => {
    try {
        if (!ALLOWED_ROLES.has(req.user?.role)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                message: "OPENAI_API_KEY sozlanmagan"
            });
        }

        const { essay, task, prompt, language } = req.body || {};

        if (!essay || typeof essay !== "string" || !essay.trim()) {
            return res.status(400).json({
                message: "Essay matni kerak"
            });
        }

        if (!["task1", "task2"].includes(task)) {
            return res.status(400).json({
                message: "task task1 yoki task2 bo'lishi kerak"
            });
        }

        const input = buildPrompt({
            essay: essay.trim(),
            task,
            prompt,
            language
        });

        const response = await client.responses.create({
            model: OPENAI_MODEL,
            input,
            temperature: 0.2,
            text: {
                format: {
                    type: "json_schema",
                    name: "ielts_writing_assessment",
                    strict: true,
                    schema: jsonSchema
                }
            }
        });

        // 🔥 ENG MUHIM JOY
        let result = response.output_parsed;

        // fallback (🔥 MUHIM)
        if (!result) {
            try {
                const text =
                    response?.output?.[0]?.content?.[0]?.text ||
                    response?.output_text;

                if (text) {
                    result = JSON.parse(text);
                }
            } catch (e) {
                console.log("JSON parse error:", e);
            }
        }

        if (!result) {
            return res.status(500).json({
                message: "AI javobi parse bo'lmadi"
            });
        }

        await WritingResult.create({
            userId: req.user.id,
            essayText: essay.trim(),
            taskType: task,
            result
        });

        return res.json({
            success: true,
            result
        });

    } catch (err) {
        console.error("AI writing grade error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

router.get("/writing/results", auth, async (req, res) => {
    try {
        if (!ALLOWED_ROLES.has(req.user?.role)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        const filter = {};

        if (req.user.role !== "admin") {
            filter.userId = req.user.id;
        }

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

        return res.json({
            success: true,
            result: results
        });
    } catch (err) {
        console.error("AI writing results error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

module.exports = router;
