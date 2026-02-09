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
        if (!user || user.role !== "student") {
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
        const { writingId, score } = req.body;

        if (!writingId || score === undefined) {
            return res.status(400).json({ message: "writingId va score kerak!" });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.role !== "teacher") {
            return res.status(403).json({ message: "Faqat teacher score qo‘shishi mumkin!" });
        }

        const writing = await Writing.findById(writingId);
        if (!writing) {
            return res.status(404).json({ message: "Writing topilmadi!" });
        }

        const newScore = new ScoreW({
            student: req.body.studentId,
            test: writing._id,
            testName: writing.task1Topic || writing.topic || "Writing Test",
            score,
            teacher: user._id
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

        const scores = await ScoreW.find()
            .populate("student", "name lastname")
            .populate("test", "task1Topic task2Topic topic");

        res.json(scores);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
