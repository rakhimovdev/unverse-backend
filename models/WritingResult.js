const mongoose = require("mongoose");

const ScoreSchema = new mongoose.Schema(
    {
        taskResponse: { type: Number, default: null },
        coherenceCohesion: { type: Number, default: null },
        lexicalResource: { type: Number, default: null },
        grammarRangeAccuracy: { type: Number, default: null },
        overall: { type: Number, default: null }
    },
    { _id: false }
);

const FeedbackSchema = new mongoose.Schema(
    {
        strengths: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        improvementTips: { type: [String], default: [] }
    },
    { _id: false }
);

const CriterionFeedbackSchema = new mongoose.Schema(
    {
        taskResponse: { type: String, default: "" },
        coherenceCohesion: { type: String, default: "" },
        lexicalResource: { type: String, default: "" },
        grammarRangeAccuracy: { type: String, default: "" }
    },
    { _id: false }
);

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
        testName: {
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
        essay: {
            type: String,
            default: ""
        },
        prompt: {
            type: String,
            default: ""
        },
        question: {
            type: String,
            default: ""
        },
        wordCount: {
            type: Number,
            default: 0,
            min: 0
        },

        taskType: {
            type: String,
            enum: ["task1", "task2", "overall"],
            required: true
        },
        scores: {
            type: ScoreSchema,
            default: () => ({})
        },
        feedback: {
            type: FeedbackSchema,
            default: () => ({})
        },
        criterionFeedback: {
            type: CriterionFeedbackSchema,
            default: () => ({})
        },

        result: {
            band_score: {
                type: Number,
                default: null
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
