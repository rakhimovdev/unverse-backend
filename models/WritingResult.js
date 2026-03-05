const mongoose = require("mongoose");

const WritingResultSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        writingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Writing",
            default: null
        },

        essayText: {
            type: String,
            required: function () {
                return this.taskType !== "overall";
            },
            default: ""
        },

        taskType: {
            type: String,
            enum: ["task1", "task2", "overall"],
            required: true
        },

        result: {
            band_score: {
                type: Number,
                required: true
            },

            grammar_feedback: {
                type: [String], // 🔥 ARRAY
                required: function () {
                    return this.taskType !== "overall";
                },
                default: []
            },

            improvement_tips: {
                type: [String], // 🔥 ARRAY
                required: function () {
                    return this.taskType !== "overall";
                },
                default: []
            }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WritingResult", WritingResultSchema);
