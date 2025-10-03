const express = require("express");
const app = express();
const Student = require("./routes/Student");
const User = require("./routes/User")
const Test = require("./routes/Test");
const mongoose = require("mongoose");
const cors = require("cors");
const Score = require("./routes/Score");
const Testl = require("./routes/Testl");
const ScoreL = require("./routes/Scorel")


app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Use extended: true for parsing URL-encoded bodies with complex objects

const allowedOrigins = [
    // "https://unversels.vercel.app",
    "http://localhost:3000"
];

app.use(cors({
    origin: function (origin, callback) {
        // Agar origin yo‘q bo‘lsa (masalan, Postman), ruxsat beramiz
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

const url = "mongodb+srv://rahimovdev1:universe@cluster0.gwybjlk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
mongoose.connect(url)
    .then(() => {
        console.log("MongoDBga ulandi");
    })
    .catch((error) => {
        console.error("mongoDBga ulanishda xatolik");
    });

app.use("/student", Student);
app.use("/user", User);
app.use("/test", Test);
app.use("/score", Score);
app.use("/testl", Testl);
app.use('/scorel', ScoreL)


const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server Port ${PORT}da ishlamoqda`);
});
