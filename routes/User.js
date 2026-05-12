const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const User = require("../models/User");
const Test = require("../models/Test");
const Score = require("../models/Score");
const authMiddleware = require("../middleware/auth");
const { signAuthToken } = require("../utils/jwt");
const { serializeUser } = require("../utils/userSerializer");
const {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    isValidEmail,
    isValidPassword,
    isValidUsername,
    normalizeEmail,
    normalizeUsername,
    normalizeWhitespace
} = require("../utils/authValidation");

dotenv.config();

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

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
        cb(null, uploadDir);
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
        const normalizedEmail = normalizeEmail(email);
        const normalizedUsername = normalizeUsername(username);
        const normalizedName = normalizeWhitespace(name);
        const normalizedLastname = normalizeWhitespace(lastname);

        if (!normalizedName || !normalizedLastname || !normalizedUsername || !password) {
            return res.status(400).json({ message: "All required fields must be filled in." });
        }

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ message: "Please provide a valid email address." });
        }

        if (!isValidUsername(normalizedUsername)) {
            return res.status(400).json({
                message: "Username must be 3-24 characters and use letters, numbers, dots, underscores, or hyphens."
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`
            });
        }

        const existing = await User.findOne({
            $or: [{ username: normalizedUsername }, { email: normalizedEmail }]
        });
        if (existing) {
            const field = existing.username === normalizedUsername ? "Username" : "Email";
            return res.status(400).json({ message: `${field} is already in use.` });
        }

        const hashedPassword = await bcrypt.hash(String(password), 12);

        if (role === "mooc") {
            return res.status(403).json({ message: "Mooc accountni faqat admin qo'sha oladi!" });
        }

        const normalizedRole = role === "admin" ? "admin" : "teacher";

        const user = new User({
            fullname: [normalizedName, normalizedLastname].filter(Boolean).join(" ").trim(),
            email: normalizedEmail,
            name: normalizedName,
            lastname: normalizedLastname,
            username: normalizedUsername,
            password: hashedPassword,
            role: normalizedRole,
            isVerified: true
        });

        await user.save();

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ message: "JWT_SECRET sozlanmagan" });
        }

        res.status(201).json({
            message: " Teacher ro‘yxatdan o‘tdi",
            token: signAuthToken(user),
            user: serializeUser(user),
        });
    } catch (error) {
        console.error("Register error:", error);
        if (error?.code === 11000) {
            const dupField = Object.keys(error.keyPattern || {})[0] || "Field";
            return res.status(400).json({ message: `${dupField} allaqachon mavjud!` });
        }
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// =====================
// Login
// =====================
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const normalizedUsername = normalizeUsername(username);

        if (!normalizedUsername || !password) {
            return res.status(400).json({ message: "Username and password are required." });
        }

        const user = await User.findOne({ username: normalizedUsername }).select("+password");
        if (!user) {
            return res.status(404).json({ message: " User topilmadi yoki login xato!" });
        }

        if (user.isVerified === false) {
            return res.status(403).json({ message: " Emailni avval tasdiqlang!" });
        }

        const passwordMatch = await bcrypt.compare(String(password), user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: " Parol noto‘g‘ri!" });
        }

        res.json({
            message: " Login muvaffaqiyatli",
            token: signAuthToken(user),
            user: serializeUser(user),
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
            const students = await User.find({ role: "student", teacher: req.user.id }).select("_id");
            const studentIds = students.map((s) => s._id);

            if (studentIds.length === 0) {
                return res.json([]);
            }

            const results = await Score.find({ student: { $in: studentIds } })
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
