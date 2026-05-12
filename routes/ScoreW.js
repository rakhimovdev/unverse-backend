const express = require("express");
const router = express.Router();

const ScoreW = require("../models/ScoreW");
const Writing = require("../models/writing");
const Response = require("../models/Response");
const User = require("../models/User");

const auth = require("../middleware/auth");


// ===============================
// 📝 STUDENT: Writing response saqlash
// ===============================
router.post("/response", auth, async (req, res) => {
    try {
        const { writingId, topic, answer, task1Answer, task2Answer } = req.body;
        const userId = req.user.id;
        const hasCombinedAnswers =
            task1Answer !== undefined || task2Answer !== undefined;

        if (!writingId) {
            return res.status(400).json({ message: "writingId kerak!" });
        }

        if (hasCombinedAnswers) {
            if (!task1Answer || !task2Answer) {
                return res
                    .status(400)
                    .json({ message: "Task 1 va Task 2 javoblari kerak!" });
            }
        } else if (!answer) {
            return res.status(400).json({ message: "answer kerak!" });
        }

        const user = await User.findById(userId);
        if (!user || !["student", "mooc"].includes(user.role)) {
            return res.status(403).json({ message: "Faqat student javob yubora oladi!" });
        }

        const writing = await Writing.findById(writingId);
        if (!writing) {
            return res.status(404).json({ message: "Writing topilmadi!" });
        }

        const task1Topic = writing.task1Topic || writing.topic || "";
        const task2Topic = writing.task2Topic || "";

        const newResponse = new Response(
            hasCombinedAnswers
                ? {
                    writingId,
                    task1Topic,
                    task2Topic,
                    task1Answer,
                    task2Answer,
                    userId,
                    userName: user.name,
                    userLastname: user.lastname
                }
                : {
                    writingId,
                    topic: topic || task1Topic,
                    userId,
                    userName: user.name,
                    userLastname: user.lastname,
                    answer
                }
        );

        await newResponse.save();

        res.status(201).json({
            message: "Response saved ✅",
            data: newResponse
        });
    } catch (error) {
        console.error("SAVE RESPONSE ERROR:", error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});


// ===============================
// 🧮 TEACHER: Score qo‘shish
// ===============================
router.post("/add", auth, async (req, res) => {
    try {
        const { writingId, score, studentId } = req.body;

        if (!writingId || score === undefined || !studentId) {
            return res
                .status(400)
                .json({ message: "writingId, studentId va score kerak!" });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.role !== "teacher") {
            return res.status(403).json({ message: "Faqat teacher score qo‘shishi mumkin!" });
        }

        const writing = await Writing.findById(writingId);
        if (!writing) {
            return res.status(404).json({ message: "Writing topilmadi!" });
        }

        const student = await User.findById(studentId);
        if (!student || student.role !== "student") {
            return res.status(404).json({ message: "Student topilmadi!" });
        }
        if (String(student.teacher) !== String(user._id)) {
            return res.status(403).json({ message: "Bu student sizga tegishli emas!" });
        }

        let existing = await ScoreW.findOne({ student: studentId, test: writingId });
        if (existing) {
            existing.score = score;
            existing.testName = writing.task1Topic || writing.topic || "Writing Test";
            existing.studentName = student.name;
            existing.studentLastname = student.lastname;
            await existing.save();
            return res.json({
                message: "Score yangilandi ✅",
                score: existing
            });
        }

        const newScore = new ScoreW({
            student: studentId,
            studentName: student.name,
            studentLastname: student.lastname,
            test: writing._id,
            testName: writing.task1Topic || writing.topic || "Writing Test",
            score
        });

        await newScore.save();

        res.json({
            message: "Score qo‘shildi ✅",
            score: newScore
        });
    } catch (error) {
        console.error("SCORE ERROR:", error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});


// ===============================
// 📊 TEACHER: Barcha score’lar
// ===============================
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

        const scores = await ScoreW.find({ student: { $in: studentIds } })
            .populate("student", "name lastname")
            .populate("test", "task1Topic task2Topic topic");

        res.json(scores);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// ===============================
// 📊 STUDENT: My writing scores
// ===============================
router.get("/my", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !["student", "mooc"].includes(user.role)) {
            return res.status(403).json({ message: "Faqat student ko‘ra oladi!" });
        }

        const scores = await ScoreW.find({ student: req.user.id }).sort({
            createdAt: -1
        });
        res.json(scores);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// ===============================
// 📚 TEACHER: Writing responses list
// ===============================
router.get("/responses", auth, async (req, res) => {
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

        const responses = await Response.find({ userId: { $in: studentIds } })
            .sort({ createdAt: -1 })
            .populate(
                "writingId",
                "task1Topic task2Topic task1Image task1Text task2Text image topic task taskText"
            )
            .populate("userId", "name lastname timeSlot timeSlots");

        const responseStudentIds = responses
            .map((r) => r.userId?._id || r.userId)
            .filter(Boolean);
        const writingIds = responses
            .map((r) => r.writingId?._id || r.writingId)
            .filter(Boolean);

        const scores = await ScoreW.find({
            student: { $in: responseStudentIds },
            test: { $in: writingIds }
        });

        const scoreMap = new Map(
            scores.map((s) => [`${s.student}:${s.test}`, s])
        );

        const payload = responses.map((r) => {
            const studentKey = r.userId?._id || r.userId;
            const key = `${studentKey}:${r.writingId?._id || r.writingId}`;
            const score = scoreMap.get(key);
            return {
                ...r.toObject(),
                score: score ? score.score : ""
            };
        });

        res.json(payload);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// ===============================
// 🧾 TEACHER: Single response
// ===============================
router.get("/responses/:id", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== "teacher") {
            return res.status(403).json({ message: "Siz teacher emassiz!" });
        }

        const response = await Response.findById(req.params.id).populate(
            "writingId",
            "task1Topic task2Topic task1Image task1Text task2Text image topic task taskText"
        );

        if (!response) {
            return res.status(404).json({ message: "Response topilmadi!" });
        }

        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

// ===============================
// 🗑️ TEACHER: Delete response
// ===============================
router.delete("/responses/:id", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== "teacher") {
            return res.status(403).json({ message: "Siz teacher emassiz!" });
        }

        const deleted = await Response.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Response topilmadi!" });
        }

        res.json({ message: "✅ Response o‘chirildi" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
