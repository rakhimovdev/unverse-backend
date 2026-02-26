const mongoose = require("mongoose");

const WritingResultSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        essayText: {
            type: String,
            required: true
        },

        taskType: {
            type: String,
            enum: ["task1", "task2"],
            required: true
        },

        result: {
            band_score: {
                type: Number,
                required: true
            },

            grammar_feedback: {
                type: [String], // 🔥 ARRAY
                required: true
            },

            improvement_tips: {
                type: [String], // 🔥 ARRAY
                required: true
            }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WritingResult", WritingResultSchema);