const express = require("express");
const router = express.Router();
const ScoreL = require("../models/ScoreL");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Listening = require("../models/Testl"); // Listening model
const { saveListeningResult } = require("../services/resultService");
const { LISTENING_BAND_TABLE, getBandScore } = require("../utils/ieltsBands");

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
        const { listeningId, score, attemptKey, listeningDetails } = req.body;

        if (!listeningId || score === undefined) {
            return res.status(400).json({ message: "listeningId va score kerak!" });
        }

        const listening = await Listening.findById(listeningId);
        if (!listening) {
            return res.status(404).json({ message: "Listening test topilmadi!" });
        }

        const user = await User.findById(req.user.id);
        if (!user || !["student", "mooc"].includes(user.role)) {
            return res.status(403).json({ message: "Faqat student score qo‘shishi mumkin!" });
        }

        const { studentName, studentLastname } = normalizeStudentNames(user);

        // Agar avval score bo‘lsa, yangilaymiz
        let existing = await ScoreL.findOne({ student: req.user.id, test: listeningId });
        const wasExisting = Boolean(existing);
        if (existing) {
            existing.score = score;
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
                score,
            });

            await newScore.save();
            existing = newScore;
        }

        const maybeBandScore = Number(listeningDetails?.academicBand);
        const maybeGeneralBand = Number(listeningDetails?.generalBand);
        const bandScore = Number.isFinite(maybeBandScore)
            ? maybeBandScore
            : getBandScore(score, LISTENING_BAND_TABLE);

        await saveListeningResult({
            userId: req.user.id,
            testId: listening._id,
            testName: listening.title,
            attemptKey,
            listening: {
                sectionScores: listeningDetails?.sectionScores || [],
                rawScore: Number(listeningDetails?.rawScore ?? score) || 0,
                rawTotal: Number(listeningDetails?.rawTotal) || 40,
                academicBand: bandScore,
                generalBand: Number.isFinite(maybeGeneralBand) ? maybeGeneralBand : bandScore,
                correctAnswers: listeningDetails?.correctAnswers || [],
                wrongAnswers: listeningDetails?.wrongAnswers || []
            }
        });

        res.status(201).json({
            message: wasExisting ? "Score yangilandi ✅" : "Score saqlandi ✅",
            score: existing
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
