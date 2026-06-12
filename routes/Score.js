const express = require("express");
const router = express.Router();
const Score = require("../models/Score");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Test = require("../models/Test");
const { serializeUser } = require("../utils/userSerializer");
const { saveReadingResult } = require("../services/resultService");
const {
    READING_ACADEMIC_TABLE,
    READING_GENERAL_TABLE,
    getBandScore
} = require("../utils/ieltsBands");

// Score qo‘shish yoki yangilash
router.post("/add", auth, async (req, res) => {
    try {
        const { testId, score, attemptKey, readingDetails } = req.body;

        if (!testId || score === undefined) {
            return res.status(400).json({ message: "testId va score kerak!" });
        }

        const test = await Test.findById(testId);
        if (!test) {
            return res.status(404).json({ message: "Test topilmadi!" });
        }

        const user = await User.findById(req.user.id);
        if (!user || !["student", "mooc"].includes(user.role)) {
            return res
                .status(403)
                .json({ message: "Faqat student score qo‘shishi mumkin!" });
        }

        let existing = await Score.findOne({ student: req.user.id, test: testId });
        const wasExisting = Boolean(existing);
        if (existing) {
            existing.score = score;
            await existing.save();
        } else {
            const newScore = new Score({
                student: req.user.id,
                test: test._id,
                score,
                studentName: user.name,
                studentLastname: user.lastname,
                studentEmail: user.email,
                testName: test.name,
            });

            await newScore.save();
            existing = newScore;
        }

        const maybeAcademicBand = Number(readingDetails?.academicBand);
        const maybeGeneralBand = Number(readingDetails?.generalBand);
        const academicBand = Number.isFinite(maybeAcademicBand)
            ? maybeAcademicBand
            : getBandScore(score, READING_ACADEMIC_TABLE);
        const generalBand = Number.isFinite(maybeGeneralBand)
            ? maybeGeneralBand
            : getBandScore(score, READING_GENERAL_TABLE);

        await saveReadingResult({
            userId: req.user.id,
            testId: test._id,
            testName: test.name,
            attemptKey,
            reading: {
                passageScores: readingDetails?.passageScores || [],
                rawScore: Number(readingDetails?.rawScore ?? score) || 0,
                rawTotal: Number(readingDetails?.rawTotal) || 40,
                academicBand,
                generalBand,
                correctAnswers: readingDetails?.correctAnswers || [],
                wrongAnswers: readingDetails?.wrongAnswers || []
            }
        });

        res.json({
            message: wasExisting ? "Score yangilandi ✅" : "Score saqlandi ✅",
            score: existing
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// 1. Foydalanuvchining o‘zini olish
router.get("/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User topilmadi!" });
        }
        res.json(serializeUser(user));
    } catch (err) {
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// 2. Teacher barcha student natijalari
router.get("/all", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== "teacher") {
            return res.status(403).json({ message: "Siz teacher emassiz!" });
        }

        const students = await User.find({ role: "student", teacher: user._id }).select("_id");
        const studentIds = students.map((s) => s._id);

        if (studentIds.length === 0) {
            return res.json([]);
        }

        const scores = await Score.find({ student: { $in: studentIds } })
            .populate("student", "name lastname email timeSlot timeSlots")
            .populate("test", "name");

        res.json(scores);
    } catch (err) {
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// 3. Student o‘z natijalari
router.get("/my", auth, async (req, res) => {
    try {
        const scores = await Score.find({ student: req.user.id }).populate(
            "student",
            "fullname email"
        );
        res.json(scores);
    } catch (err) {
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// Score o‘chirish
router.delete("/delete/:id", auth, async (req, res) => {
    try {
        const score = await Score.findById(req.params.id);
        if (!score) {
            return res.status(404).json({ message: "Score topilmadi!" });
        }

        const user = await User.findById(req.user.id);

        if (["student", "mooc"].includes(user.role) && score.student.toString() !== req.user.id) {
            return res.status(403).json({
                message: "Siz faqat o‘zingizning natijangizni o‘chira olasiz!",
            });
        }

        await score.deleteOne();
        res.json({ message: "Score o‘chirildi ✅" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
