const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
    value: {
        type: String,
        required: false,
    },
    type: {
        type: String,
        enum: ["text", "select"],
        default: "text",
    },
});

const ListeningSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },
        audio: {
            type: Buffer,
            required: true
        },       // 🔹 audio fayl
        contentType: {
            type: String,
            required: true
        }, // 🔹 MIME type (mp3, wav va h.k.)
        transcript: {
            type: String,
            default: ""
        }, // 🔹 script (agar kerak bo‘lsa)
        questions: {
            type: [QuestionSchema],
            default: []
        }, // 🔹 savollar
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Listening", ListeningSchema);
