require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const UserModel = require("./models/User");
const clickRoutes = require('./routes/click')// Routers
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
const AuthRouter = require("./routes/Auth");
const Results = require("./routes/Results");

// 1. Avval CORS
const configuredOrigins = String(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = [
    "https://unversels.vercel.app",
    "https://unverse-frontend.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...configuredOrigins
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

// 4. Required env vars
const url = process.env.MONGO_URI;

if (!url || !process.env.JWT_SECRET) {
    console.error("❌ Required environment variables are missing. Check MONGO_URI and JWT_SECRET.");
    process.exit(1);
}

const getMongoConnectionTarget = (connectionString) => {
    try {
        const parsed = new URL(connectionString);
        if (!parsed.protocol.startsWith("mongodb")) return null;
        return parsed.hostname;
    } catch {
        return null;
    }
};

const describeMongoError = (error) => {
    const code = String(error?.code || "").toUpperCase();
    const name = String(error?.name || "").toLowerCase();

    if (code === "ENOTFOUND" || name.includes("querysrv")) {
        return "DNS/SRV hostname could not be resolved. Verify the MongoDB Atlas connection string and cluster hostname.";
    }
    if (code === "18" || name.includes("authentication")) {
        return "MongoDB authentication failed. Verify the Atlas database username, password, and network access without exposing them in source code.";
    }
    if (name.includes("invalid") || name.includes("uri")) {
        return "The MongoDB connection string is invalid. Copy the driver URI from MongoDB Atlas.";
    }
    if (name.includes("timeout") || code === "ETIMEDOUT") {
        return "MongoDB connection timed out. Check Atlas network access and the current network connection.";
    }
    return "MongoDB server could not be reached. Check Atlas availability, network access, and DNS settings.";
};

const migrateUsers = async () => {
    const [studentTypeResult, verificationResult] = await Promise.all([
        UserModel.updateMany(
            {
                role: "student",
                $or: [
                    { studentType: { $exists: false } },
                    { studentType: null },
                    { studentType: "" }
                ]
            },
            { $set: { studentType: "insider" } }
        ),
        UserModel.updateMany(
            { isVerified: { $exists: false } },
            { $set: { isVerified: true } }
        )
    ]);

    if (studentTypeResult?.modifiedCount) {
        console.log(`✅ ${studentTypeResult.modifiedCount} student insider qilib yangilandi`);
    }
    if (verificationResult?.modifiedCount) {
        console.log(`✅ ${verificationResult.modifiedCount} user verified flag bilan yangilandi`);
    }
};

const startServer = async () => {
    const mongoHost = getMongoConnectionTarget(url);
    if (!mongoHost) {
        throw new Error("The MONGO_URI value is missing or has an invalid MongoDB URL format.");
    }

    try {
        await mongoose.connect(url, { serverSelectionTimeoutMS: 10000 });
        console.log("✅ MongoDBga ulandi");
    } catch (error) {
        console.error(`❌ MongoDB connection failed for ${mongoHost}.`);
        console.error(`Reason: ${describeMongoError(error)}`);
        throw error;
    }

    try {
        await migrateUsers();
    } catch (error) {
        console.error("❌ User migratsiya xatosi:", error?.message || "unknown error");
    }

    app.listen(PORT, () => {
        console.log(`🚀 Server ${PORT} portda ishlamoqda`);
    });
};

startServer().catch(() => {
    process.exitCode = 1;
});

// 5. Routes
app.use("/auth", AuthRouter);
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
app.use("/results", Results);
app.use('/api/click', clickRoutes)
// 6. Server
const PORT = process.env.PORT || 5000;
