const express = require("express");
const router = express.Router();
const ScoreL = require("../models/ScoreL");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Listening = require("../models/Testl"); // Listening model

// Score qo‘shish (student faqat o‘zi uchun)
router.post("/add", auth, async (req, res) => {
    try {
        const { listeningId, score } = req.body;

        if (!listeningId || score === undefined) {
            return res.status(400).json({ message: "listeningId va score kerak!" });
        }

        const listening = await Listening.findById(listeningId);
        if (!listening) {
            return res.status(404).json({ message: "Listening test topilmadi!" });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.role !== "student") {
            return res.status(403).json({ message: "Faqat student score qo‘shishi mumkin!" });
        }

        // Agar avval score bo‘lsa, yangilaymiz
        let existing = await ScoreL.findOne({ student: req.user.id, test: listeningId });
        if (existing) {
            existing.score = score;
            await existing.save();
            return res.json({ message: "Score yangilandi ✅", score: existing });
        }

        const newScore = new ScoreL({
            student: req.user.id,
            studentName: user.name,
            studentLastname: user.lastname,
            test: listening._id,
            testName: listening.title,
            score,
        });

        await newScore.save();

        res.status(201).json({ message: "Score saqlandi ✅", score: newScore });
    } catch (err) {
        console.error("Score saqlashda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// Student o‘z natijalari
router.get("/my", auth, async (req, res) => {
    try {
        const scores = await ScoreL.find({ student: req.user.id });
        res.json(scores);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// Teacher barcha student natijalari
router.get("/all", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== "teacher") {
            return res.status(403).json({ message: "Siz teacher emassiz!" });
        }

        const scores = await ScoreL.find();
        res.json(scores);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// Score o‘chirish
router.delete("/delete/:id", auth, async (req, res) => {
    try {
        const score = await ScoreL.findById(req.params.id);
        if (!score) {
            return res.status(404).json({ message: "Score topilmadi!" });
        }

        const user = await User.findById(req.user.id);
        if (user.role === "student" && score.student.toString() !== req.user.id) {
            return res.status(403).json({
                message: "Siz faqat o‘zingizning natijangizni o‘chira olasiz!",
            });
        }

        await score.deleteOne();
        res.json({ message: "Score o‘chirildi ✅" });
    } catch (err) {
        console.error("Score o‘chirishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
