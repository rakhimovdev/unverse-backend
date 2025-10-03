const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
    {
        question: { type: String, trim: true },
        value: { type: String, trim: true },
        type: { type: String, enum: ["text", "select", "yn"], default: "text" },
        options: { type: [String], default: [] },

        // 🔹 joylashuv ma'lumotlari
        top: { type: Number, default: 0 },
        left: { type: Number, default: 0 },
        width: { type: Number, default: 120 },
    },
    { _id: false }
);


const ListeningSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },

        // 🔹 Audio
        audio: { type: Buffer },
        contentType: { type: String },

        // 🔹 Rasm
        image: { type: Buffer },
        imageType: { type: String },

        transcript: { type: String, default: "", trim: true },
        questions: { type: [QuestionSchema], default: [] },
        student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Listening", ListeningSchema);
