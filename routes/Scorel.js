const express = require("express");
const router = express.Router();
const ScoreL = require("../models/ScoreL");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Listening = require("../models/Testl"); // Listening model
const { saveListeningResult } = require("../services/resultService");
const { scoreObjectiveTest } = require("../services/objectiveScoringService");
const Result = require("../models/Result");
const Homework = require("../models/Homework");
const { findStudentHomeworkAssignment } = require("../utils/homeworkAttempt");

const normalizeStudentNames = (user) => {
    const safe = (value) => (typeof value === "string" ? value.trim() : "");
    const name = safe(user?.name);
    const lastname = safe(user?.lastname);
    const username = safe(user?.username);
    const email = safe(user?.email);
    const emailPrefix = email.includes("@") ? email.split("@")[0] : "";

    return {
        studentName: name || username || emailPrefix || "Unknown",
        studentLastname: lastname || "Student",
    };
};

// Score qo‘shish (student faqat o‘zi uchun)
router.post("/add", auth, async (req, res) => {
    try {
        const {
            listeningId,
            homeworkId,
            attemptKey,
            mode = "solving",
            solvingAttemptId,
            startedAt,
            completedAt,
            timeSpent,
            answers
        } = req.body;

        if (!listeningId) {
            return res.status(400).json({ message: "listeningId kerak!" });
        }

        const listening = await Listening.findById(listeningId);
        if (!listening) {
            return res.status(404).json({ message: "Listening test topilmadi!" });
        }
        const graded = scoreObjectiveTest({
            test: listening,
            answers,
            moduleType: "Listening"
        });

        if (!["solving", "resolving"].includes(mode)) {
            return res.status(400).json({ message: "Noto‘g‘ri attempt mode" });
        }

        const user = await User.findById(req.user.id);
        if (!user || !["student", "mooc"].includes(user.role)) {
            return res.status(403).json({ message: "Faqat student score qo‘shishi mumkin!" });
        }

        const homeworkAssignment = await findStudentHomeworkAssignment({
            User,
            Homework,
            studentId: req.user.id,
            homeworkId,
            testId: listening._id,
            moduleType: "Listening"
        });
        if (homeworkId && !homeworkAssignment) {
            return res.status(403).json({ message: "Bu Listening test ushbu homework assignmentga tegishli emas." });
        }

        let parentAttempt = null;
        if (mode === "resolving") {
            if (!solvingAttemptId) {
                return res.status(400).json({ message: "Solving attempt kerak" });
            }
            parentAttempt = await Result.findOne({
                _id: solvingAttemptId,
                userId: req.user.id,
                testId: listening._id,
                moduleType: "Listening",
                mode: "solving",
                ...(homeworkId ? { homeworkId: homeworkAssignment._id } : {}),
                completedAt: { $ne: null }
            });
            if (!parentAttempt) {
                return res.status(403).json({ message: "Avval Solving attemptni yakunlang" });
            }
        }

        const { studentName, studentLastname } = normalizeStudentNames(user);

        // Agar avval score bo‘lsa, yangilaymiz
        let existing = await ScoreL.findOne({ student: req.user.id, test: listeningId });
        const wasExisting = Boolean(existing);
        if (existing) {
            existing.score = graded.totalCorrect;
            existing.studentName = studentName;
            existing.studentLastname = studentLastname;
            await existing.save();
        } else {
            const newScore = new ScoreL({
                student: req.user.id,
                studentName,
                studentLastname,
                test: listening._id,
                testName: listening.title,
                score: graded.totalCorrect,
            });

            await newScore.save();
            existing = newScore;
        }

        await saveListeningResult({
            userId: req.user.id,
            testId: listening._id,
            homeworkId: homeworkAssignment?._id || null,
            testName: listening.title,
            attemptKey,
            mode,
            solvingAttemptId: parentAttempt?._id || null,
            answers,
            startedAt,
            completedAt,
            timeSpent,
            listening: {
                sectionScores: graded.groupScores,
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
            moduleType: "Listening",
            attemptKey,
            homeworkId: homeworkAssignment?._id || null
        }).lean();

        res.status(201).json({
            message: wasExisting ? "Score yangilandi ✅" : "Score saqlandi ✅",
            score: existing,
            result
        });
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

        const students = await User.find({ role: "student", teacher: user._id }).select("_id");
        const studentIds = students.map((s) => s._id);

        if (studentIds.length === 0) {
            return res.json([]);
        }

        const scores = await ScoreL.find({ student: { $in: studentIds } })
            .populate("student", "name lastname email timeSlot timeSlots");
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
        if (["student", "mooc"].includes(user.role) && score.student.toString() !== req.user.id) {
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
