const router = require("express").Router();
const Test = require("../models/Test");
const sanitizeHtml = require("sanitize-html");
const auth = require("../middleware/auth");
const requireRoles = require("../middleware/requireRoles");
const { getOptionalAuthPayload } = require("../utils/jwt");

const isValidMode = m => ["full", "part"].includes(m);

const getRoleFromReq = (req) => getOptionalAuthPayload(req)?.role || null;

const normalizeAudience = (value) => (value === "mooc" ? "mooc" : "regular");

const getAudienceFilter = (role) => {
    if (role === "admin" || role === "teacher") return {};
    if (role === "mooc") return { audience: "mooc" };
    return { audience: { $ne: "mooc" } };
};

const canAccessAudience = (role, audience) => {
    if (role === "admin" || role === "teacher") return true;
    const normalized = normalizeAudience(audience);
    if (role === "mooc") return normalized === "mooc";
    return normalized !== "mooc";
};

/* =====================
   POST /test/upload
===================== */
router.post("/upload", auth, requireRoles("teacher", "admin"), async (req, res) => {
    try {
        const { name, mode, passages, audience } = req.body;
        const normalizedAudience = normalizeAudience(audience);

        if (!name || !Array.isArray(passages) || passages.length !== 3) {
            return res.status(400).json({
                error: "Test nomi va aynan 3 ta passage majburiy"
            });
        }

        const formattedPassages = passages.map((p, i) => {
            const cleanHTML = sanitizeHtml(p.readingText || "", {
                allowedTags: ["span", "div", "br", "p", "b", "strong"],
                allowedAttributes: {
                    span: ["class"],
                    div: ["class"]
                },
                allowedClasses: {
                    span: ["highlight-bold", "highlight-large"]
                }
            });

            return {
                passageNumber: i + 1,
                readingText:
                    mode === "part" && i !== 0 ? "" : cleanHTML,
                testText: p.testText || "",
                questions: Array.isArray(p.questions)
                    ? p.questions.map(q => ({
                        value: (q.value || "").trim(),
                        type: q.type || "text"
                    }))
                    : []
            };
        });

        const test = new Test({
            name: name.trim(),
            mode: isValidMode(mode) ? mode : "full",
            passages: formattedPassages,
            audience: normalizedAudience
        });

        await test.save();
        return res.status(201).json(test);
    } catch (err) {
        console.error("UPLOAD TEST ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
});

/* =====================
   GET /test/last
===================== */
router.get("/last", async (req, res) => {
    try {
        const { mode } = req.query;
        const role = getRoleFromReq(req);
        const filter = { ...getAudienceFilter(role) };
        if (isValidMode(mode)) filter.mode = mode;

        const test = await Test.findOne(filter).sort({ createdAt: -1 });
        if (!test) {
            return res.status(404).json({ message: "Test topilmadi" });
        }
        return res.json(test);
    } catch (err) {
        console.error("GET /test/last error:", err);
        return res.status(500).json({ error: err.message });
    }
});

/* =====================
   GET /test/all
===================== */
router.get("/all", async (req, res) => {
    try {
        const { mode, summary, page, limit } = req.query;
        const role = getRoleFromReq(req);
        const filter = { ...getAudienceFilter(role) };
        if (isValidMode(mode)) filter.mode = mode;

        let query = Test.find(filter).sort({ createdAt: -1 });

        const wantSummary =
            summary === "1" || summary === "true" || summary === true;

        if (wantSummary) {
            query = query.select("name createdAt mode");
        }

        const limitNum = Number(limit || 0);
        const pageNum = Math.max(Number(page || 1), 1);
        if (Number.isFinite(limitNum) && limitNum > 0) {
            const skip = (pageNum - 1) * limitNum;
            query = query.skip(skip).limit(limitNum);
        }

        const tests = await query.lean();
        return res.json(tests);
    } catch (err) {
        console.error("GET /test/all error:", err);
        return res.status(500).json({ error: err.message });
    }
});

/* =====================
   GET /test/:id
===================== */
router.get("/:id", async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) {
            return res.status(404).json({ message: "Test topilmadi" });
        }
        const role = getRoleFromReq(req);
        if (!canAccessAudience(role, test.audience)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }
        return res.json(test);
    } catch (err) {
        console.error("GET /test/:id error:", err);
        return res.status(500).json({ error: err.message });
    }
});

/* =====================
   DELETE /test/:id
===================== */
router.delete("/:id", auth, requireRoles("teacher", "admin"), async (req, res) => {
    try {
        const deleted = await Test.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Test topilmadi" });
        }
        return res.json({ message: "Test o‘chirildi" });
    } catch (err) {
        console.error("DELETE /test/:id error:", err);
        return res.status(500).json({ error: err.message });
    }
});



module.exports = router;
