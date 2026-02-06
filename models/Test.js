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
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Test", TestSchema);
