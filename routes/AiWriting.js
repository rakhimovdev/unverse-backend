const express = require("express");
const OpenAI = require("openai");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Writing = require("../models/writing");
const WritingResult = require("../models/WritingResult");
const { syncWritingResult } = require("../services/resultService");
const {
    checkWritingAccess,
    consumeWritingCheck
} = require("../utils/aiWritingLimit");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const jsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        band_score: { type: "number", minimum: 0, maximum: 9 },
        grammar_feedback: {
            type: "array",
            items: { type: "string" }
        },
        vocabulary_feedback: {
            type: "array",
            items: { type: "string" }
        },
        coherence_feedback: {
            type: "array",
            items: { type: "string" }
        },
        weaknesses: {
            type: "array",
            items: { type: "string" }
        },
        improvement_tips: {
            type: "array",
            items: { type: "string" }
        },
        final_summary: { type: "string" }
    },
    required: [
        "band_score",
        "grammar_feedback",
        "vocabulary_feedback",
        "coherence_feedback",
        "weaknesses",
        "improvement_tips",
        "final_summary"
    ]
};

const roundToHalfBand = (value) => {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Math.round(Number(value) * 2) / 2;
};

const calculateOverallBand = (task1Band, task2Band) => {
    const t1 = Number(task1Band);
    const t2 = Number(task2Band);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;

    const weighted = (t1 + 2 * t2) / 3;
    return roundToHalfBand(weighted);
};

const buildPrompt = ({ essay, task, prompt, language }) => {
    const lang = (language || "uz").toLowerCase();
    const langLabel = lang === "en" ? "English" : "Uzbek";

    return `
You are an IELTS Writing examiner.
Respond in ${langLabel}.
Return ONLY valid JSON.
Provide concise but specific feedback for grammar, vocabulary, coherence/cohesion, main weaknesses, improvement tips, and a short final summary.

Task: ${task || ""}
Question: ${prompt || ""}

Essay:
${essay}
`;
};

const normalizeList = (value) =>
    Array.isArray(value)
        ? value
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
        : [];

const normalizeAiResult = (value = {}) => ({
    band_score:
        value?.band_score == null || Number.isNaN(Number(value.band_score))
            ? null
            : Number(value.band_score),
    grammar_feedback: normalizeList(value?.grammar_feedback),
    vocabulary_feedback: normalizeList(value?.vocabulary_feedback),
    coherence_feedback: normalizeList(value?.coherence_feedback),
    weaknesses: normalizeList(value?.weaknesses),
    improvement_tips: normalizeList(value?.improvement_tips),
    final_summary:
        typeof value?.final_summary === "string" ? value.final_summary.trim() : ""
});

const buildOverallSummary = (task1, task2, overallBand) => {
    const segments = [];
    const task1Summary = task1?.result?.final_summary;
    const task2Summary = task2?.result?.final_summary;
    const weaknesses = [
        ...(task1?.result?.weaknesses || []),
        ...(task2?.result?.weaknesses || [])
    ].filter(Boolean);
    const tips = [
        ...(task1?.result?.improvement_tips || []),
        ...(task2?.result?.improvement_tips || [])
    ].filter(Boolean);

    if (overallBand != null) {
        segments.push(`Overall writing band: ${overallBand}.`);
    }
    if (task1Summary) {
        segments.push(`Task 1: ${task1Summary}`);
    }
    if (task2Summary) {
        segments.push(`Task 2: ${task2Summary}`);
    }
    if (weaknesses.length) {
        segments.push(`Main weaknesses: ${weaknesses.slice(0, 4).join("; ")}.`);
    }
    if (tips.length) {
        segments.push(`Priority improvements: ${tips.slice(0, 4).join("; ")}.`);
    }

    return segments.join(" ").trim();
};

router.post("/writing/grade", auth, async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                message: "OPENAI_API_KEY sozlanmagan"
            });
        }

        const { essay, task, prompt, language, writingId, attemptKey } = req.body || {};

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

        const user = req.userDoc || (await User.findById(req.user.id));
        if (!user) {
            return res.status(404).json({
                message: "User topilmadi"
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

            return res.status(access.status || 403).json({ message: access.message });
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

        result = normalizeAiResult(result);

        if (result.band_score == null) {
            return res.status(500).json({
                message: "AI band score qaytarmadi"
            });
        }

        if (access.shouldConsume) {
            consumeWritingCheck(user);
        }

        await Promise.all([
            user.isModified() ? user.save() : Promise.resolve(),
            WritingResult.create({
                userId: req.user.id,
                writingId: writingId || null,
                attemptKey: attemptKey || "",
                essayText: essay.trim(),
                prompt: typeof prompt === "string" ? prompt.trim() : "",
                taskType: task,
                result
            })
        ]);

        let overall = null;
        const filter = { userId: req.user.id };
        if (attemptKey) {
            filter.attemptKey = attemptKey;
        } else if (writingId) {
            filter.writingId = writingId;
        }

        const [task1Result, task2Result] = await Promise.all([
            WritingResult.findOne({ ...filter, taskType: "task1" })
                .sort({ createdAt: -1 })
                .lean(),
            WritingResult.findOne({ ...filter, taskType: "task2" })
                .sort({ createdAt: -1 })
                .lean()
        ]);

        if (task1Result?.result?.band_score != null && task2Result?.result?.band_score != null) {
            const overallBand = calculateOverallBand(
                task1Result.result.band_score,
                task2Result.result.band_score
            );

            if (overallBand != null) {
                const finalSummary = buildOverallSummary(
                    task1Result,
                    task2Result,
                    overallBand
                );

                if (writingId) {
                    overall = await WritingResult.findOneAndUpdate(
                        {
                            userId: req.user.id,
                            writingId,
                            attemptKey: attemptKey || "",
                            taskType: "overall"
                        },
                        {
                            $set: {
                                essayText: "",
                                prompt: "",
                                result: {
                                    band_score: overallBand,
                                    grammar_feedback: [],
                                    vocabulary_feedback: [],
                                    coherence_feedback: [],
                                    weaknesses: [
                                        ...(task1Result?.result?.weaknesses || []),
                                        ...(task2Result?.result?.weaknesses || [])
                                    ].slice(0, 6),
                                    improvement_tips: [
                                        ...(task1Result?.result?.improvement_tips || []),
                                        ...(task2Result?.result?.improvement_tips || [])
                                    ].slice(0, 6),
                                    final_summary: finalSummary
                                }
                            }
                        },
                        { upsert: true, new: true }
                    );
                } else {
                    overall = {
                        band_score: overallBand,
                        final_summary: finalSummary
                    };
                }

                const writingTest = writingId
                    ? await Writing.findById(writingId).select("task1Topic topic")
                    : null;

                await syncWritingResult({
                    userId: req.user.id,
                    testId: writingId || null,
                    testName:
                        writingTest?.task1Topic ||
                        writingTest?.topic ||
                        "Writing Test",
                    attemptKey
                });
            }
        }

        return res.json({
            success: true,
            result,
            overall
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
