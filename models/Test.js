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

const TestSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        testText: {
            type: String,
            required: true,
        },
        readingText: {
            type: String,
            default: "",
        },
        questions: {
            type: [QuestionSchema],
            default: [],
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },

        mode: {
            type: String,
            enum: ["full", "part"],
            default: "full"
        },

        // 🔥 YANGI QO‘SHILDI: duration
        // full → 30 minut
        // part → 20 minut
        duration: {
            type: Number, // daqiqalarda
            default: 60
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Test", TestSchema);
