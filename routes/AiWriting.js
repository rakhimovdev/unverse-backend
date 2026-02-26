const express = require("express");
const OpenAI = require("openai");
const router = express.Router();

const auth = require("../middleware/auth");

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
        const result = response.output_parsed;

        if (!result) {
            console.log(response);
            return res.status(500).json({
                message: "AI javobi parse bo'lmadi"
            });
        }

        return res.json(result);

    } catch (err) {
        console.error("AI writing grade error:", err);
        return res.status(500).json({
            message: "Server xatosi"
        });
    }
});

module.exports = router;