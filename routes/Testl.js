const express = require("express");
const multer = require("multer");
const Listening = require("../models/Testl"); // 🔹 Listening modeli
const router = express.Router();

// Multer: faylni xotirada (buffer) saqlash
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * 🔹 Yangi Listening test qo‘shish
 * Request turi: multipart/form-data
 * Maydonlar:
 *  - audio (file) ✅
 *  - title (string) ✅
 *  - transcript (string, optional)
 *  - questions (JSON string)
 *  - studentId (ObjectId, optional)
 */
router.post("/upload", upload.single("audio"), async (req, res) => {
    try {
        console.log("Kelgan file:", req.file);
        console.log("Kelgan body:", req.body);

        const { title, transcript, questions, studentId } = req.body;

        if (!title || !req.file) {
            return res.status(400).json({ message: "title va audio kerak!" });
        }

        // ✅ questions JSON formatda kelishini tekshiramiz
        let parsedQuestions = [];
        if (questions) {
            try {
                parsedQuestions = JSON.parse(questions);
            } catch (e) {
                return res.status(400).json({ message: "questions noto‘g‘ri formatda!" });
            }
        }

        // ✅ Yangi listening obyekt yaratamiz
        const newListening = new Listening({
            title,
            audio: req.file.buffer,           // 🔹 buffer sifatida DB ga saqlanadi
            contentType: req.file.mimetype,   // 🔹 MIME type (mp3, wav va h.k.)
            transcript: transcript || "",
            questions: parsedQuestions,
            student: studentId || null,
        });

        await newListening.save();

        res.status(201).json({
            message: "Listening test muvaffaqiyatli saqlandi ✅",
            listening: {
                _id: newListening._id,
                title: newListening.title,
                transcript: newListening.transcript,
                questions: newListening.questions,
                audioUrl: `http://localhost:5000/testl/audio/${newListening._id}`, // 🔹 audio URL
            },
        });
    } catch (err) {
        console.error("Upload xatosi:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Barcha listening testlarni olish (faqat id va title)
 */
router.get("/all", async (req, res) => {
    try {
        const audios = await Listening.find().select("_id title");
        res.json(audios);
    } catch (err) {
        console.error("All olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Listening test info olish (audio bo‘lmaydi)
 */
router.get("/info/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id).select("-audio");
        if (!listening) {
            return res.status(404).json({ message: "Listening topilmadi!" });
        }

        res.json({
            _id: listening._id,
            title: listening.title,
            transcript: listening.transcript,
            questions: listening.questions || [],
            audioUrl: `http://localhost:5000/testl/audio/${listening._id}`,
        });
    } catch (err) {
        console.error("Info olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 To‘liq testni olish (info + audioUrl)
 */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const listening = await Listening.findById(id).select("-audio");

        if (!listening) {
            return res.status(404).json({ message: "Test topilmadi!" });
        }

        res.json({
            _id: listening._id,
            title: listening.title,
            transcript: listening.transcript,
            questions: listening.questions,
            audioUrl: `http://localhost:5000/testl/audio/${listening._id}`,
        });
    } catch (err) {
        console.error("Test olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Faqat audio faylni olish (stream qilish uchun)
 */
router.get("/audio/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id);

        if (!listening || !listening.audio) {
            return res.status(404).json({ message: "Audio topilmadi!" });
        }

        res.set("Content-Type", listening.contentType || "audio/mpeg");
        res.send(listening.audio); // 🔹 Buffer qaytariladi
    } catch (err) {
        console.error("Audio olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Listening testni o‘chirish
 */
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "Noto‘g‘ri ID format!" });
        }

        const deleted = await Listening.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ message: "Listening topilmadi!" });
        }

        res.json({ message: "Listening muvaffaqiyatli o‘chirildi ✅" });
    } catch (err) {
        console.error("O‘chirishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
