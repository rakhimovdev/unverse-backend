const mongoose = require("mongoose");

const GrammarCorrectionSchema = new mongoose.Schema(
    {
        original: { type: String, default: "", trim: true },
        correct: { type: String, default: "", trim: true },
        reason: { type: String, default: "", trim: true }
    },
    { _id: false }
);

const VocabularySuggestionSchema = new mongoose.Schema(
    {
        original: { type: String, default: "", trim: true },
        alternatives: { type: [String], default: [] }
    },
    { _id: false }
);

const LegacyResultSchema = new mongoose.Schema(
    {
        band_score: { type: Number, default: null },
        estimated_band: { type: Number, default: null },
        grammar_feedback: { type: [String], default: [] },
        vocabulary_feedback: { type: [String], default: [] },
        coherence_feedback: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        improvement_tips: { type: [String], default: [] },
        final_summary: { type: String, default: "" }
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
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        },
        strengths: {
            type: [String],
            default: []
        },
        weaknesses: {
            type: [String],
            default: []
        },
        improvementTips: {
            type: [String],
            default: []
        },
        criterionFeedback: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        },
        grammarCorrections: {
            type: [GrammarCorrectionSchema],
            default: []
        },
        vocabularySuggestions: {
            type: [VocabularySuggestionSchema],
            default: []
        },
        estimatedExaminerComment: {
            type: String,
            default: ""
        },

        // Legacy compatibility for older documents already saved in MongoDB.
        feedback: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        },
        result: {
            type: LegacyResultSchema,
            default: () => ({})
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WritingResult", WritingResultSchema);
