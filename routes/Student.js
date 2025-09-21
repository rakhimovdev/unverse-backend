const router = require('express').Router();
const bcrypt = require('bcryptjs'); // bcrypt emas, bcryptjs ishlatgan yaxshi
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Test = require('../models/Test');
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
// Student: Register
// =====================
router.post('/register', async (req, res) => {
    try {
        const { email, name, lastname, username, password } = req.body;

        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser)
            return res.status(400).json({ message: '❌ Username yoki email allaqachon mavjud' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            email,
            name,
            lastname,
            username,
            password: hashedPassword,
            role: "student"
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

        // JWT token yaratish
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || "supersecretkey",
            { expiresIn: process.env.JWT_EXPIRES || "1h" }
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
