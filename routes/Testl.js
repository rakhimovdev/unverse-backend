const express = require("express");
const multer = require("multer");
const path = require("path");
const Listening = require("../models/Testl");
const router = express.Router();

// 🔹 Fayllar uploads papkaga saqlanadi
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/"); // uploads papka yaratib qo‘yilgan bo‘lishi kerak
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

/**
 * 🔹 Full Listening test upload
 */
router.post(
    "/full",
    upload.fields([
        { name: "audio", maxCount: 1 },
        { name: "image", maxCount: 1 },
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

            const newTest = new Listening({
                title: req.body.title,
                audioPath: req.files?.audio ? `/uploads/${req.files.audio[0].filename}` : null,
                imagePath: req.files?.image ? `/uploads/${req.files.image[0].filename}` : null,
                questions,
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

        const baseUrl = process.env.BASE_URL || "https://unverse-backend.onrender.com";

        res.json({
            _id: listening._id,
            title: listening.title,
            transcript: listening.transcript,
            questions: listening.questions,
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
        const tests = await Listening.find().select("_id title");
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
