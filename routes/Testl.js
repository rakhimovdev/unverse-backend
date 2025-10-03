const express = require("express");
const multer = require("multer");
const Listening = require("../models/Testl");
const router = express.Router();

const storage = multer.memoryStorage();
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
                audio: req.files?.audio ? req.files.audio[0].buffer : null,
                contentType: req.files?.audio ? req.files.audio[0].mimetype : null,
                image: req.files?.image ? req.files.image[0].buffer : null,
                imageType: req.files?.image ? req.files.image[0].mimetype : null,
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
            return res.status(404).json({ message: "Test topilmadi!" });
        }

        const baseUrl = process.env.BASE_URL || "http://localhost:5000";

        const imageUrl = listening.image
            ? `${baseUrl}/testl/image/${listening._id}`
            : null;

        const audioUrl = listening.audio
            ? `${baseUrl}/testl/audio/${listening._id}`
            : null;

        res.json({
            _id: listening._id,
            title: listening.title,
            questions: listening.questions,
            imageUrl,
            audioUrl,
        });
    } catch (err) {
        console.error("Info olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
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
 * 🔹 Audio olish
 */
router.get("/audio/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id);
        if (!listening || !listening.audio) {
            return res.status(404).json({ message: "Audio topilmadi!" });
        }

        res.set("Content-Type", listening.contentType || "audio/mpeg");
        res.send(listening.audio);
    } catch (err) {
        console.error("Audio olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Rasm olish
 */
router.get("/image/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id);
        if (!listening || !listening.image) {
            return res.status(404).json({ message: "Rasm topilmadi!" });
        }

        res.set("Content-Type", listening.imageType || "image/png");
        res.send(listening.image);
    } catch (err) {
        console.error("Image olishda xato:", err);
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
