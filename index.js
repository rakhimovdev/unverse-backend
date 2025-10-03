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

app.use(cors({
    origin: "http://localhost:3000", // yoki frontend domeni
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // DELETE ni qo‘sh
    allowedHeaders: ["Content-Type", "Authorization"]
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
