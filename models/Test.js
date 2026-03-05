const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
    // Backward-compatible legacy fields
    value: {
        type: String,
        required: false,
        default: "",
        trim: true
    },

    // New structured fields
    question: {
        type: String,
        required: false,
        default: "",
        trim: true
    },
    options: {
        type: [String],
        default: []
    },
    answer: {
        type: [String],
        default: []
    },

    type: {
        type: String,
        enum: ["single", "multi", "truefalse", "fill", "matching", "heading", "text", "select"],
        default: "fill",
    },
});

const PassageSchema = new mongoose.Schema({
    passageNumber: { type: Number, required: true }, // 1,2,3
    readingText: { type: String, default: "" },
    testText: { type: String, default: "" },
    questions: { type: [QuestionSchema], default: [] },
});

const TestSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        passages: {
            type: [PassageSchema],
            required: true, // 3 passage majburiy
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

        duration: {
            type: Number, // daqiqalarda
            default: 60
        },

        audience: {
            type: String,
            enum: ["regular", "mooc"],
            default: "regular"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Test", TestSchema);
