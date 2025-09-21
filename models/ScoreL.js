const mongoose = require("mongoose");

const scoreLSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, required: true },
    studentLastname: { type: String, required: true },

    test: { type: mongoose.Schema.Types.ObjectId, ref: "Listening", required: true },
    testName: { type: String, required: true },

    score: { type: Number, required: true },
}, { timestamps: true }); // createdAt, updatedAt avtomatik qo‘shiladi

module.exports = mongoose.models.ScoreL || mongoose.model("ScoreL", scoreLSchema);
