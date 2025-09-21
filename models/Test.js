const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
    value: {
        type: String,
        required: false, // bo‘sh qolishi ham mumkin
    },
    type: {
        type: String,
        enum: ["text", "select"], // faqat shu turlarni qabul qiladi
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
            ref: "User", // agar User modeliga bog‘lasangiz
            required: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Test", TestSchema);
