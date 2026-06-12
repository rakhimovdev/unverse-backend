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
        attemptKey: {
            type: String,
            default: "",
            trim: true
        },

        essayText: {
            type: String,
            required: function () {
                return this.taskType !== "overall";
            },
            default: ""
        },
        prompt: {
            type: String,
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
                type: [String],
                default: []
            },

            vocabulary_feedback: {
                type: [String],
                default: []
            },

            coherence_feedback: {
                type: [String],
                default: []
            },

            weaknesses: {
                type: [String],
                default: []
            },

            improvement_tips: {
                type: [String],
                default: []
            },

            final_summary: {
                type: String,
                default: ""
            }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WritingResult", WritingResultSchema);
