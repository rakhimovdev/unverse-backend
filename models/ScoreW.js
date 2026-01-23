const mongoose = require('mongoose');

const scoreWSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, required: true },
    studentLastname: { type: String, required: true },

    test: { type: mongoose.Schema.Types.ObjectId, ref: "Writing", required: true },
    testName: { type: String, required: true },

    score: { type: String, required: true },
}, { timestamps: true }); // createdAt, updatedAt avtomatik qo‘shiladi

module.exports = mongoose.models.ScoreW || mongoose.model("ScoreW", scoreWSchema);  