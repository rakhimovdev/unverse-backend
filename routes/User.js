const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const dotenv = require("dotenv");

const User = require("../models/User");
const Test = require("../models/Test");
const Score = require("../models/Score");

dotenv.config();

// =====================
// Auth Middleware
// =====================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: " Token topilmadi!" });
    }

    const token = authHeader.split(" ")[1]; // "Bearer <token>"
    if (!token) {
        return res.status(401).json({ message: " Token noto‘g‘ri formatda!" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
        next();
    } catch (err) {
        return res.status(401).json({ message: " Token yaroqsiz yoki muddati tugagan!" });
    }
}

// =====================
// Role Middleware
// =====================
function roleMiddleware(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: " Token topilmadi!" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: " Ruxsat yo‘q!" });
        }
        next();
    };
}

// =====================
// Multer (File Upload)
// =====================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    },
});

const upload = multer({ storage });

// =====================
// Register (Teacher)
// =====================
router.post("/register", async (req, res) => {
    try {
        const { email, name, lastname, username, password, role } = req.body;

        // Validate fields
        if (!email || !name || !lastname || !username || !password) {
            return res.status(400).json({ message: "Invalid request" });
        }

        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ message: " Username allaqachon mavjud!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            email,
            name,
            lastname,
            username,
            password: hashedPassword,
            role: role || "teacher",
        });

        await user.save();

        // Token yaratish
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES || "1h" } // default 1 soat
        );

        res.status(201).json({
            message: " Teacher ro‘yxatdan o‘tdi",
            token,
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// =====================
// Login
// =====================
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate fields
        if (!username || !password) {
            return res.status(400).json({ message: "Invalid request" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: " User topilmadi yoki login xato!" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: " Parol noto‘g‘ri!" });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES || "1h" }
        );

        res.json({
            message: " Login muvaffaqiyatli",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// =====================
// Test yaratish (Teacher only)
// =====================
router.post(
    "/tests",
    authMiddleware,
    roleMiddleware("teacher"),
    upload.single("image"),
    async (req, res) => {
        try {
            const { testText, questions } = req.body;

            // JSON string bo‘lsa parse qilish
            let parsedQuestions = questions;
            if (typeof questions === "string") {
                parsedQuestions = JSON.parse(questions);
            }

            const test = new Test({
                testText,
                questions: parsedQuestions,
                image: req.file ? req.file.filename : null
            });

            await test.save();
            res.status(201).json(test);
        } catch (err) {
            console.error("Test yaratishda xato:", err);
            res.status(500).json({ error: err.message });
        }
    }
);

// =====================
// Oxirgi testni olish
// =====================
router.get("/tests/last", authMiddleware, async (req, res) => {
    try {
        const test = await Test.findOne().sort({ createdAt: -1 });
        if (!test) return res.status(404).json({ message: "❌ Test topilmadi" });
        res.json(test);
    } catch (err) {
        console.error("Oxirgi testni olishda xato:", err);
        res.status(500).json({ error: err.message });
    }
});

// =====================
// Teacher: barcha student natijalari
// =====================
router.get(
    "/students/results",
    authMiddleware,
    roleMiddleware("teacher"),
    async (req, res) => {
        try {
            const results = await Score.find()
                .populate("student", "username email")
                .populate("test", "testText");

            const formatted = results.map(r => ({
                student: {
                    id: r.student?._id,
                    username: r.student?.username,
                    email: r.student?.email
                },
                test: r.test ? r.test.testText : "❌ Test topilmadi",
                score: r.score
            }));

            res.json(formatted);
        } catch (err) {
            console.error("Natijalarni olishda xato:", err);
            res.status(500).json({ error: "Server xatosi" });
        }
    }
);

module.exports = router;
