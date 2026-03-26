require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const UserModel = require("./models/User");

// Routers
const Student = require("./routes/Student");
const UserRouter = require("./routes/User");
const Test = require("./routes/Test");
const Score = require("./routes/Score");
const Testl = require("./routes/Testl");
const ScoreL = require("./routes/Scorel");
const Writing = require("./routes/writing");
const ScoreW = require("./routes/ScoreW");
const Admin = require("./routes/Admin");
const AiWriting = require("./routes/AiWriting");
const WritingAi = require("./routes/WritingAi");

// 1. Avval CORS
const allowedOrigins = [
    "https://unversels.vercel.app",
    "https://unverse-frontend.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
];
const isDev = process.env.NODE_ENV !== "production";

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true); // Postman kabi holatlar uchun
        if (isDev) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.log("❌ Not allowed origin:", origin);
        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// 2. Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Static files (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 4. Mongo ulanish
const url = "mongodb+srv://rahimovdev1:universe@cluster0.gwybjlk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(url)
    .then(async () => {
        console.log("✅ MongoDBga ulandi");

        try {
            const result = await UserModel.updateMany(
                {
                    role: "student",
                    $or: [
                        { studentType: { $exists: false } },
                        { studentType: null },
                        { studentType: "" }
                    ]
                },
                { $set: { studentType: "insider" } }
            );
            if (result?.modifiedCount) {
                console.log(`✅ ${result.modifiedCount} student insider qilib yangilandi`);
            }
        } catch (err) {
            console.error("❌ StudentType migratsiya xatosi:", err);
        }
    })
    .catch((error) => console.error("❌ MongoDB ulanishda xato:", error));

// 5. Routes
app.use("/student", Student);
app.use("/user", UserRouter);
app.use("/test", Test);
app.use("/score", Score);
app.use("/testl", Testl);   // 🔥 BU JOYNI QO‘SHDIM
app.use("/scorel", ScoreL);
app.use("/posts", Writing);
app.use("/scorew", ScoreW);   // writing route uchun
app.use("/admin", Admin);
app.use("/ai", AiWriting);
app.use("/api/writing", WritingAi);

// 6. Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portda ishlamoqda`);
});
