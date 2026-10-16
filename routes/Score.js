const express = require("express");
const router = express.Router();
const Score = require("../models/Score");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Test = require("../models/Test");
const { serializeUser } = require("../utils/userSerializer");
const { saveReadingResult } = require("../services/resultService");
const { scoreObjectiveTest } = require("../services/objectiveScoringService");
const Result = require("../models/Result");

// Score qo‘shish yoki yangilash
router.post("/add", auth, async (req, res) => {
    try {
        const {
            testId,
            attemptKey,
            mode = "solving",
            solvingAttemptId,
            startedAt,
            completedAt,
            timeSpent,
            answers
        } = req.body;

        if (!testId) {
            return res.status(400).json({ message: "testId kerak!" });
        }

        const test = await Test.findById(testId);
        if (!test) {
            return res.status(404).json({ message: "Test topilmadi!" });
        }
        const graded = scoreObjectiveTest({
            test,
            answers,
            moduleType: "Reading"
        });

        if (!["solving", "resolving"].includes(mode)) {
            return res.status(400).json({ message: "Noto‘g‘ri attempt mode" });
        }

        let parentAttempt = null;
        if (mode === "resolving") {
            if (!solvingAttemptId) {
                return res.status(400).json({ message: "Solving attempt kerak" });
            }
            parentAttempt = await Result.findOne({
                _id: solvingAttemptId,
                userId: req.user.id,
                testId: test._id,
                moduleType: "Reading",
                mode: "solving",
                completedAt: { $ne: null }
            });
            if (!parentAttempt) {
                return res.status(403).json({ message: "Avval Solving attemptni yakunlang" });
            }
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
            existing.score = graded.totalCorrect;
            await existing.save();
        } else {
            const newScore = new Score({
                student: req.user.id,
                test: test._id,
                score: graded.totalCorrect,
                studentName: user.name,
                studentLastname: user.lastname,
                studentEmail: user.email,
                testName: test.name,
            });

            await newScore.save();
            existing = newScore;
        }

        await saveReadingResult({
            userId: req.user.id,
            testId: test._id,
            testName: test.name,
            attemptKey,
            mode,
            solvingAttemptId: parentAttempt?._id || null,
            answers,
            startedAt,
            completedAt,
            timeSpent,
            reading: {
                passageScores: graded.groupScores,
                rawScore: graded.totalCorrect,
                rawTotal: graded.totalQuestions,
                academicBand: graded.academicBand,
                generalBand: graded.generalBand,
                correctAnswers: graded.correctAnswers,
                wrongAnswers: graded.wrongAnswers
            }
        });

        const result = await Result.findOne({
            userId: req.user.id,
            moduleType: "Reading",
            attemptKey
        }).lean();

        res.json({
            message: wasExisting ? "Score yangilandi ✅" : "Score saqlandi ✅",
            score: existing,
            result
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
