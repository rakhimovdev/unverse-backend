const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Listening = require("../models/Testl");
const jwt = require("jsonwebtoken");
const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

const getRoleFromReq = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded?.role || null;
    } catch (err) {
        return null;
    }
};

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

// 🔹 Fayllar uploads papkaga saqlanadi
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

const PART_IMAGE_FIELDS = Array.from({ length: 4 }, (_, index) => ({
    name: `imagePart${index}`,
    maxCount: 1,
}));
const PART_AUDIO_FIELDS = Array.from({ length: 4 }, (_, index) => ({
    name: `audioPart${index}`,
    maxCount: 1,
}));

/**
 * 🔹 Full Listening test upload
 */
router.post(
    "/full",
    upload.fields([
        { name: "audio", maxCount: 1 },
        { name: "image", maxCount: 1 },
        ...PART_IMAGE_FIELDS,
        ...PART_AUDIO_FIELDS,
    ]),
    async (req, res) => {
        try {
            let questions = [];
            if (req.body.questions) {
                try {
                    questions = JSON.parse(req.body.questions);
                } catch (err) {
                    console.error("JSON parse error:", err);
                    questions = [];
                }
            }

            let partsPayload = [];
            if (req.body.parts) {
                try {
                    const parsed = JSON.parse(req.body.parts);
                    if (Array.isArray(parsed)) {
                        partsPayload = parsed;
                    }
                } catch (err) {
                    console.error("Parts JSON parse error:", err);
                    partsPayload = [];
                }
            }

            const parts = partsPayload.map((part, index) => {
                const imageField = `imagePart${index}`;
                const audioField = `audioPart${index}`;
                return {
                    partNumber: index + 1,
                    transcript: part?.transcript || "",
                    testText: part?.testText || "",
                    questions: Array.isArray(part?.questions) ? part.questions : [],
                    imagePath: req.files?.[imageField]
                        ? `/uploads/${req.files[imageField][0].filename}`
                        : null,
                    audioPath: req.files?.[audioField]
                        ? `/uploads/${req.files[audioField][0].filename}`
                        : null,
                };
            });

            const newTest = new Listening({
                title: req.body.title,
                transcript: parts[0]?.transcript || req.body.transcript || "",
                testText: parts[0]?.testText || req.body.testText || "",
                audioPath: req.files?.audio ? `/uploads/${req.files.audio[0].filename}` : null,
                imagePath: req.files?.image ? `/uploads/${req.files.image[0].filename}` : null,
                questions: parts[0]?.questions?.length ? parts[0].questions : questions,
                parts,
                audience: normalizeAudience(req.body.audience),
            });

            await newTest.save();
            res.json({ message: "✅ Listening test saqlandi", id: newTest._id });
        } catch (err) {
            console.error("Full uploadda xato:", err);
            res.status(500).json({ message: "Full uploadda xato", error: err.message });
        }
    }
);

/**
 * 🔹 Info olish (bitta test)
 */
router.get("/info/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id);
        if (!listening) {
            return res.status(404).json({ message: "Test topilmadi" });
        }
        const role = getRoleFromReq(req);
        if (!canAccessAudience(role, listening.audience)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        const baseUrl = process.env.BASE_URL || "https://unverse-backend.onrender.com";
        const fallbackAudio = listening.audioPath ? `${baseUrl}${listening.audioPath}` : null;

        const parts = (listening.parts || []).map((part) => ({
            partNumber: part.partNumber,
            transcript: part.transcript,
            testText: part.testText,
            questions: part.questions,
            imageUrl: part.imagePath ? `${baseUrl}${part.imagePath}` : null,
            audioUrl: part.audioPath ? `${baseUrl}${part.audioPath}` : fallbackAudio,
        }));

        res.json({
            _id: listening._id,
            title: listening.title,
            transcript: listening.transcript,
            testText: listening.testText,
            questions: listening.questions,
            parts,
            audioUrl: listening.audioPath ? `${baseUrl}${listening.audioPath}` : null,
            imageUrl: listening.imagePath ? `${baseUrl}${listening.imagePath}` : null,
        });
    } catch (err) {
        console.error("Test olishda xato:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

/**
 * 🔹 Barcha testlarni olish (id + title)
 */
router.get("/all", async (req, res) => {
    try {
        const role = getRoleFromReq(req);
        const tests = await Listening.find(getAudienceFilter(role)).select("_id title");
        res.json(tests);
    } catch (err) {
        console.error("All olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Testni o‘chirish
 */
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Listening.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Test topilmadi!" });
        }
        res.json({ message: "✅ Test o‘chirildi" });
    } catch (err) {
        console.error("Delete qilishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
