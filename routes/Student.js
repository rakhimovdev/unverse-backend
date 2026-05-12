const router = require('express').Router();

const User = require('../models/User');
const TimeSlot = require('../models/TimeSlot');
const Test = require('../models/Testl');
const Score = require('../models/Score');
const authMiddleware = require("../middleware/auth");
const { registerUser, loginUser } = require("../services/authService");

// =====================
// Student: Teacher list (public)
// =====================
router.get('/teachers', async (req, res) => {
    try {
        const teachers = await User.find({ role: "teacher" })
            .select("fullname name lastname username email")
            .sort({ name: 1, lastname: 1 });
        res.json(teachers);
    } catch (err) {
        console.error("Teacher list error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Student: Time slot list (public)
// =====================
router.get('/timeslots', async (req, res) => {
    try {
        const { teacherId, group } = req.query;
        const filter = teacherId ? { teacher: teacherId } : {};

        let dayFilter = {};
        if (group === "juft") {
            dayFilter = { day: { $in: ["Seshanba", "Payshanba", "Shanba"] } };
        } else if (group === "toq") {
            dayFilter = { day: { $in: ["Dushanba", "Chorshanba", "Juma"] } };
        }

        const slots = await TimeSlot.find({ ...filter, ...dayFilter }).sort({ day: 1, time: 1 });

        if (group) {
            const timeMap = new Map();
            slots.forEach((slot) => {
                const key = String(slot.time);
                const entry = timeMap.get(key) || { time: slot.time, slotIds: [] };
                entry.slotIds.push(slot._id);
                timeMap.set(key, entry);
            });
            return res.json(Array.from(timeMap.values()));
        }

        res.json(slots);
    } catch (err) {
        console.error("Time slot list error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Student: Register
// =====================
router.post('/register', async (req, res) => {
    try {
        const {
            email,
            name,
            lastname,
            password,
            teacherId,
            timeSlotId,
            timeSlotIds,
            timeGroup,
            time,
            studentType
        } = req.body;

        const result = await registerUser({
            email,
            fullname: [name, lastname].filter(Boolean).join(" ").trim(),
            password,
            teacherId,
            timeSlotId,
            timeSlotIds,
            timeGroup,
            time,
            studentType
        });
        res.status(201).json(result);
    } catch (error) {
        console.error("Register error:", error);
        res.status(error.status || 500).json({
            message: error.message || 'Internal Server Error'
        });
    }
});

// =====================
// Student: Login
// =====================

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await loginUser({ identifier: username, password });
        res.json(result);
    } catch (error) {
        console.error("Login error:", error);
        res.status(error.status || 500).json({
            message: error.message || 'Internal Server Error'
        });
    }
});


// =====================
// Student: Eng so‘nggi test
// =====================
router.get('/tests/last', authMiddleware, async (req, res) => {
    try {
        if (!["student", "mooc"].includes(req.user.role))
            return res.status(403).json({ message: '🚫 Ruxsat yo‘q!' });

        const test = await Test.findOne().sort({ createdAt: -1 });
        if (!test) return res.status(404).json({ message: '❌ Test topilmadi' });

        res.json(test);
    } catch (err) {
        console.error("Test olishda xato:", err);
        res.status(500).json({ error: "Server xatosi" });
    }
});

// =====================
// Student: Testni topshirish
// =====================
router.post('/tests/:id/submit', authMiddleware, async (req, res) => {
    try {
        if (!["student", "mooc"].includes(req.user.role))
            return res.status(403).json({ message: '🚫 Ruxsat yo‘q!' });

        const { answers } = req.body;
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: '❌ Test topilmadi' });

        let score = 0;
        test.questions.forEach((q, i) => {
            if (answers[i] && answers[i] === q.correctAnswer) score++;
        });

        const newScore = new Score({ student: req.user.id, test: test._id, score });
        await newScore.save();

        res.json({ message: "✅ Natija saqlandi", score });
    } catch (err) {
        console.error("Submitda xato:", err);
        res.status(500).json({ error: "Server xatosi" });
    }
});

// =====================
// Student: Natijalarni olish
// =====================
router.get('/results', authMiddleware, async (req, res) => {
    try {
        if (!["student", "mooc"].includes(req.user.role))
            return res.status(403).json({ message: '🚫 Ruxsat yo‘q!' });

        const results = await Score.find({ student: req.user.id })
            .populate('test', 'testText createdAt')
            .populate('student', 'username email');

        if (!results.length)
            return res.json({ message: "❌ Sizda hali natijalar yo‘q" });

        res.json(results.map(r => ({
            student: r.student,
            test: r.test ? r.test.testText : "Test topilmadi",
            date: r.test?.createdAt,
            score: r.score
        })));
    } catch (err) {
        console.error("Result olishda xato:", err);
        res.status(500).json({ error: "Server xatosi" });
    }
});

module.exports = router;
