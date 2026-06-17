const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const TimeSlot = require("../models/TimeSlot");
const Attendance = require("../models/Attendance");
const SlotCheck = require("../models/SlotCheck");
const Score = require("../models/Score");
const ScoreL = require("../models/ScoreL");
const ScoreW = require("../models/ScoreW");
const Result = require("../models/Result");
const WritingResult = require("../models/WritingResult");
const { getAdminResults } = require("../controllers/resultController");
const { normalizeStoredWritingResult } = require("../services/writingAssessmentService");
const { serializeUser } = require("../utils/userSerializer");
const {
    applyProDuration,
    checkAndExpirePro,
    stopPro
} = require("../utils/proPlan");

const getTodayKey = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

function adminOnly(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Faqat admin ruxsat!" });
    }
    next();
}

const safeCount = async (Model, filter = {}) => {
    try {
        return await Model.countDocuments(filter);
    } catch (err) {
        return 0;
    }
};

router.get("/results", auth, adminOnly, getAdminResults);

// =====================
// Admin: Search user by email
// =====================
router.get("/users/search", auth, adminOnly, async (req, res) => {
    try {
        const email = String(req.query.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ message: "Email kerak" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
        }

        await checkAndExpirePro(user);

        return res.json({
            user: serializeUser(user)
        });
    } catch (err) {
        console.error("Admin search user error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Upgrade user to PRO
// =====================
router.post("/users/:id/upgrade-pro", auth, adminOnly, async (req, res) => {
    try {
        const { duration } = req.body || {};
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
        }

        const expiresAt = applyProDuration(user, duration);
        if (!expiresAt) {
            return res.status(400).json({ message: "Noto'g'ri PRO duration" });
        }

        await user.save();

        return res.json({
            message: "User upgraded to PRO successfully.",
            user: serializeUser(user)
        });
    } catch (err) {
        console.error("Admin upgrade PRO error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Stop PRO
// =====================
router.post("/users/:id/stop-pro", auth, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
        }

        stopPro(user);
        await user.save();

        return res.json({
            message: "PRO subscription stopped successfully.",
            user: serializeUser(user)
        });
    } catch (err) {
        console.error("Admin stop PRO error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Analytics
// =====================
router.get("/analytics", auth, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );
        const startOfWeekWindow = new Date(startOfToday);
        startOfWeekWindow.setDate(startOfWeekWindow.getDate() - 6);

        const [totalUsers, activeUsersToday, activeUsersThisWeek, proUsers, readingResults, listeningResults, writingResults, unifiedResults, totalAIWritingChecks] =
            await Promise.all([
                safeCount(User),
                safeCount(User, { lastActiveAt: { $gte: startOfToday } }),
                safeCount(User, { lastActiveAt: { $gte: startOfWeekWindow } }),
                safeCount(User, {
                    $and: [
                        { $or: [{ plan: "pro" }, { isPro: true }] },
                        {
                            $or: [
                                { proExpiresAt: null },
                                { proExpiresAt: { $gt: now } }
                            ]
                        }
                    ]
                }),
                safeCount(Score),
                safeCount(ScoreL),
                safeCount(ScoreW),
                safeCount(Result),
                safeCount(WritingResult, { taskType: { $ne: "overall" } })
            ]);

        const totalTestsTaken =
            unifiedResults || readingResults + listeningResults + writingResults;
        const freeUsers = Math.max(0, totalUsers - proUsers);

        return res.json({
            totalUsers,
            activeUsersToday,
            activeUsersThisWeek,
            proUsers,
            freeUsers,
            totalTestsTaken,
            totalStoredResults: unifiedResults,
            totalAIWritingChecks
        });
    } catch (err) {
        console.error("Admin analytics error:", err);
        return res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Teacher list
// =====================
router.get("/teachers", auth, adminOnly, async (req, res) => {
    try {
        const teachers = await User.find({ role: "teacher" })
            .select("-password")
            .sort({ createdAt: -1 });
        res.json(teachers);
    } catch (err) {
        console.error("Admin teacher list error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Delete teacher
// =====================
router.delete("/teachers/:id", auth, adminOnly, async (req, res) => {
    try {
        const teacher = await User.findOne({ _id: req.params.id, role: "teacher" });
        if (!teacher) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        await User.updateMany({ teacher: teacher._id }, { $set: { teacher: null } });
        await teacher.deleteOne();

        res.json({ message: "Teacher o'chirildi ✅" });
    } catch (err) {
        console.error("Admin delete teacher error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Update teacher password
// =====================
router.put("/teachers/:id/password", auth, adminOnly, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Parol kamida 6 ta belgi bo'lsin" });
        }

        const teacher = await User.findOne({ _id: req.params.id, role: "teacher" });
        if (!teacher) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        const hashed = await bcrypt.hash(password, 10);
        teacher.password = hashed;
        await teacher.save();

        res.json({ message: "Parol yangilandi ✅" });
    } catch (err) {
        console.error("Admin update teacher password error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: MOOC students list
// =====================
router.get("/mooc-students", auth, adminOnly, async (req, res) => {
    try {
        const students = await User.find({ role: "mooc" })
            .select("-password")
            .sort({ createdAt: -1 });
        res.json(students);
    } catch (err) {
        console.error("Admin MOOC list error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Create MOOC student
// =====================
router.post("/mooc-students", auth, adminOnly, async (req, res) => {
    try {
        const { email, name, lastname, username, password } = req.body;

        if (!email || !name || !lastname || !username || !password) {
            return res.status(400).json({ message: "Barcha maydonlarni to'ldiring" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Parol kamida 6 ta belgi bo'lsin" });
        }

        const existing = await User.findOne({
            $or: [{ username }, { email }]
        });
        if (existing) {
            return res.status(400).json({ message: "Username yoki email allaqachon mavjud" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({
            fullname: [name, lastname].filter(Boolean).join(" ").trim(),
            email,
            name,
            lastname,
            username,
            password: hashed,
            role: "mooc",
            isVerified: true
        });

        await user.save();

        res.status(201).json({
            message: "MOOC student qo'shildi ✅",
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        console.error("Admin create MOOC error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Delete MOOC student
// =====================
router.delete("/mooc-students/:id", auth, adminOnly, async (req, res) => {
    try {
        const student = await User.findOne({ _id: req.params.id, role: "mooc" });
        if (!student) {
            return res.status(404).json({ message: "MOOC student topilmadi" });
        }

        await student.deleteOne();
        res.json({ message: "MOOC student o'chirildi ✅" });
    } catch (err) {
        console.error("Admin delete MOOC error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: MOOC student scores
// =====================
router.get("/mooc-students/:id/scores", auth, adminOnly, async (req, res) => {
    try {
        const student = await User.findById(req.params.id).select("role name lastname email");
        if (!student || !["mooc", "mock_user"].includes(student.role)) {
            return res.status(404).json({ message: "MOOC student topilmadi" });
        }

        const [reading, listening, writingAi, writingScores] = await Promise.all([
            Score.find({ student: student._id })
                .sort({ createdAt: -1 })
                .populate("test", "name"),
            ScoreL.find({ student: student._id })
                .sort({ createdAt: -1 })
                .populate("test", "title"),
            WritingResult.find({ userId: student._id })
                .sort({ createdAt: -1 })
                .lean(),
            ScoreW.find({ student: student._id }).sort({ createdAt: -1 })
        ]);

        res.json({
            student,
            reading,
            listening,
            writingAi: writingAi.map((item) => normalizeStoredWritingResult(item)),
            writingScores
        });
    } catch (err) {
        console.error("Admin MOOC scores error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Time slots list
// =====================
router.get("/timeslots", auth, adminOnly, async (req, res) => {
    try {
        const dateKey = req.query.date || getTodayKey();
        const slots = await TimeSlot.find()
            .populate("teacher", "name lastname username email")
            .sort({ day: 1, time: 1 });
        const checks = await SlotCheck.find({
            date: dateKey,
            timeSlot: { $in: slots.map((s) => s._id) }
        });
        const checkSet = new Set(checks.map((c) => String(c.timeSlot)));
        const payload = slots.map((s) => ({
            ...s.toObject(),
            checked: checkSet.has(String(s._id))
        }));
        res.json(payload);
    } catch (err) {
        console.error("Admin time slot list error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Create time slot
// =====================
router.post("/timeslots", auth, adminOnly, async (req, res) => {
    try {
        const { day, time, teacherId, days, group } = req.body;

        let dayList = [];
        if (group === "juft") {
            dayList = ["Seshanba", "Payshanba", "Shanba"];
        } else if (group === "toq") {
            dayList = ["Dushanba", "Chorshanba", "Juma"];
        } else if (Array.isArray(days)) {
            dayList = days.map((d) => String(d).trim()).filter(Boolean);
        } else if (day) {
            dayList = [String(day).trim()];
        }

        if (!dayList.length || !time || !teacherId) {
            return res.status(400).json({ message: "Teacher, kun va vaqt kerak" });
        }

        const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
        if (!teacher) {
            return res.status(400).json({ message: "Teacher topilmadi" });
        }

        const created = [];
        const skipped = [];

        for (const selectedDay of dayList) {
            try {
                const slot = new TimeSlot({
                    day: selectedDay,
                    time: String(time).trim(),
                    teacher: teacher._id
                });
                await slot.save();
                created.push(slot);
            } catch (err) {
                if (err.code === 11000) {
                    skipped.push(selectedDay);
                } else {
                    throw err;
                }
            }
        }

        res.status(201).json({ created, skipped });
    } catch (err) {
        console.error("Admin create time slot error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Delete time slot
// =====================
router.delete("/timeslots/:id", auth, adminOnly, async (req, res) => {
    try {
        const slot = await TimeSlot.findById(req.params.id);
        if (!slot) {
            return res.status(404).json({ message: "Vaqt topilmadi" });
        }

        await User.updateMany({ timeSlot: slot._id }, { $set: { timeSlot: null } });
        await slot.deleteOne();

        res.json({ message: "Vaqt o'chirildi ✅" });
    } catch (err) {
        console.error("Admin delete time slot error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Students by time slot
// =====================
router.get("/timeslots/:id/students", auth, adminOnly, async (req, res) => {
    try {
        const dateKey = req.query.date || getTodayKey();
        const slot = await TimeSlot.findById(req.params.id).populate(
            "teacher",
            "name lastname username email"
        );
        if (!slot) {
            return res.status(404).json({ message: "Vaqt topilmadi" });
        }

        const students = await User.find({
            role: "student",
            $or: [{ timeSlot: slot._id }, { timeSlots: slot._id }]
        })
            .select("name lastname username email timeSlots")
            .sort({ name: 1, lastname: 1 });

        const attendance = await Attendance.find({
            timeSlot: slot._id,
            student: { $in: students.map((s) => s._id) },
            date: dateKey
        });

        const attMap = new Map(
            attendance.map((a) => [String(a.student), a])
        );

        const payload = students.map((s) => {
            const att = attMap.get(String(s._id));
            return {
                ...s.toObject(),
                attendance: att
                    ? { status: att.status || "", payment: att.payment || 0 }
                    : { status: "", payment: 0 }
            };
        });

        res.json({ slot, date: dateKey, students: payload });
    } catch (err) {
        console.error("Admin time slot students error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Update attendance for a student in time slot
// =====================
router.put("/timeslots/:slotId/students/:studentId", auth, adminOnly, async (req, res) => {
    try {
        const { status, payment, date } = req.body;
        const dateKey = date || getTodayKey();

        const slot = await TimeSlot.findById(req.params.slotId);
        if (!slot) {
            return res.status(404).json({ message: "Vaqt topilmadi" });
        }

        const student = await User.findById(req.params.studentId);
        if (!student || student.role !== "student") {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const belongs =
            String(student.timeSlot) === String(slot._id) ||
            (Array.isArray(student.timeSlots) &&
                student.timeSlots.some((s) => String(s) === String(slot._id)));

        if (!belongs) {
            return res.status(400).json({ message: "Bu student ushbu vaqtda emas" });
        }

        if (status !== undefined) {
            const allowed = ["keldi", "kelmadi", "sababli", ""];
            if (!allowed.includes(status)) {
                return res.status(400).json({ message: "Status noto‘g‘ri" });
            }
        }

        let parsedPayment = undefined;
        if (payment !== undefined) {
            parsedPayment = Number(payment);
            if (Number.isNaN(parsedPayment) || parsedPayment < 0) {
                return res.status(400).json({ message: "To'lov noto‘g‘ri" });
            }
        }

        const update = {};
        if (status !== undefined) update.status = status;
        if (parsedPayment !== undefined) update.payment = parsedPayment;

        const record = await Attendance.findOneAndUpdate(
            { timeSlot: slot._id, student: student._id, date: dateKey },
            { $set: update },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({ message: "Saqlandi ✅", attendance: record });
    } catch (err) {
        console.error("Admin update attendance error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Mark time slot checked for a date
// =====================
router.post("/timeslots/:id/check", auth, adminOnly, async (req, res) => {
    try {
        const dateKey = req.body?.date || getTodayKey();
        const slot = await TimeSlot.findById(req.params.id);
        if (!slot) {
            return res.status(404).json({ message: "Vaqt topilmadi" });
        }

        await SlotCheck.findOneAndUpdate(
            { timeSlot: slot._id, date: dateKey },
            { $set: { timeSlot: slot._id, date: dateKey } },
            { upsert: true, new: true }
        );

        res.json({ message: "Tekshirildi ✅", date: dateKey });
    } catch (err) {
        console.error("Admin slot check error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

// =====================
// Admin: Student attendance history
// =====================
router.get("/students/:id/attendance", auth, adminOnly, async (req, res) => {
    try {
        const { slotIds } = req.query;
        let ids = [];

        if (slotIds) {
            ids = String(slotIds)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        }

        if (!ids.length) {
            const student = await User.findById(req.params.id).select("timeSlots");
            ids = student?.timeSlots?.map((s) => String(s)) || [];
        }

        if (!ids.length) {
            return res.json([]);
        }

        const records = await Attendance.find({
            student: req.params.id,
            timeSlot: { $in: ids }
        })
            .populate("timeSlot", "day time")
            .sort({ date: 1 });

        res.json(records);
    } catch (err) {
        console.error("Admin student attendance error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

module.exports = router;
