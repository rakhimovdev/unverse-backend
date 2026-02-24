const router = require('express').Router();
const bcrypt = require('bcryptjs'); // bcrypt emas, bcryptjs ishlatgan yaxshi
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const TimeSlot = require('../models/TimeSlot');
const Test = require('../models/Testl');
const Score = require('../models/Score');

// =====================
// Auth Middleware
// =====================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ message: '❌ Token topilmadi' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
        return res.status(401).json({ message: '❌ Noto‘g‘ri token formati' });

    const token = parts[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
        req.user = decoded; // { id, username, role }
        next();
    } catch (err) {
        return res.status(401).json({ message: '❌ Noto‘g‘ri yoki eskirgan token' });
    }
}

// =====================
// Student: Teacher list (public)
// =====================
router.get('/teachers', async (req, res) => {
    try {
        const teachers = await User.find({ role: "teacher" })
            .select("name lastname username email")
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
            username,
            password,
            teacherId,
            timeSlotId,
            timeSlotIds,
            timeGroup,
            time
        } = req.body;

        if (!teacherId || !(timeSlotId || timeSlotIds || (timeGroup && time))) {
            return res.status(400).json({ message: '❌ Teacher va vaqtni tanlash kerak' });
        }

        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser)
            return res.status(400).json({ message: '❌ Username yoki email allaqachon mavjud' });

        const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
        if (!teacher) {
            return res.status(400).json({ message: '❌ Teacher topilmadi' });
        }

        let selectedSlots = [];

        if (Array.isArray(timeSlotIds) && timeSlotIds.length) {
            selectedSlots = await TimeSlot.find({ _id: { $in: timeSlotIds } });
        } else if (timeSlotId) {
            const single = await TimeSlot.findById(timeSlotId);
            if (single) selectedSlots = [single];
        } else if (timeGroup && time) {
            const dayList =
                timeGroup === "juft"
                    ? ["Seshanba", "Payshanba", "Shanba"]
                    : timeGroup === "toq"
                        ? ["Dushanba", "Chorshanba", "Juma"]
                        : [];
            selectedSlots = await TimeSlot.find({
                teacher: teacher._id,
                day: { $in: dayList },
                time: String(time).trim()
            });
        }

        if (!selectedSlots.length) {
            return res.status(400).json({ message: '❌ Tanlangan vaqt topilmadi' });
        }

        if (selectedSlots.some((slot) => String(slot.teacher) !== String(teacher._id))) {
            return res.status(400).json({ message: '❌ Bu vaqt tanlangan teacherga tegishli emas' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            email,
            name,
            lastname,
            username,
            password: hashedPassword,
            role: "student",
            teacher: teacher._id,
            timeSlot: selectedSlots[0]?._id || null,
            timeSlots: selectedSlots.map((s) => s._id)
        });

        await user.save();

        res.status(201).json({
            message: "✅ Ro‘yxatdan o‘tish muvaffaqiyatli",
            user: { id: user._id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// =====================
// Student: Login
// =====================

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: '❌ User not found' });

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ message: '❌ Parol noto‘g‘ri' });

        // ✅ 30 kunlik token
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || "supersecretkey"
        );


        res.json({
            message: '✅ Login successful',
            token,
            user: { id: user._id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// =====================
// Student: Eng so‘nggi test
// =====================
router.get('/tests/last', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'student')
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
        if (req.user.role !== 'student')
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
        if (req.user.role !== 'student')
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
