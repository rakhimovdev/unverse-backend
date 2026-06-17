const mongoose = require("mongoose");

const ReviewItemSchema = new mongoose.Schema(
    {
        questionNumber: { type: Number, default: 0 },
        groupNumber: { type: Number, default: 0 },
        label: { type: String, default: "" },
        prompt: { type: String, default: "" },
        questionType: { type: String, default: "" },
        userAnswer: { type: String, default: "" },
        correctAnswer: { type: String, default: "" },
        explanation: { type: String, default: "" }
    },
    { _id: false }
);

const ScoreBreakdownSchema = new mongoose.Schema(
    {
        label: { type: String, default: "" },
        correct: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },
    { _id: false }
);

const ReadingResultSchema = new mongoose.Schema(
    {
        passageScores: { type: [ScoreBreakdownSchema], default: [] },
        rawScore: { type: Number, default: 0 },
        rawTotal: { type: Number, default: 40 },
        academicBand: { type: Number, default: null },
        generalBand: { type: Number, default: null },
        correctAnswers: { type: [ReviewItemSchema], default: [] },
        wrongAnswers: { type: [ReviewItemSchema], default: [] }
    },
    { _id: false }
);

const ListeningResultSchema = new mongoose.Schema(
    {
        sectionScores: { type: [ScoreBreakdownSchema], default: [] },
        rawScore: { type: Number, default: 0 },
        rawTotal: { type: Number, default: 40 },
        academicBand: { type: Number, default: null },
        generalBand: { type: Number, default: null },
        correctAnswers: { type: [ReviewItemSchema], default: [] },
        wrongAnswers: { type: [ReviewItemSchema], default: [] }
    },
    { _id: false }
);

const WritingTaskSchema = new mongoose.Schema(
    {
        bandScore: { type: Number, default: null },
        essayText: { type: String, default: "" },
        prompt: { type: String, default: "" },
        question: { type: String, default: "" },
        wordCount: { type: Number, default: 0 },
        taskResponseScore: { type: Number, default: null },
        coherenceCohesionScore: { type: Number, default: null },
        lexicalResourceScore: { type: Number, default: null },
        grammarRangeAccuracyScore: { type: Number, default: null },
        strengths: { type: [String], default: [] },
        grammarFeedback: { type: [String], default: [] },
        vocabularyFeedback: { type: [String], default: [] },
        coherenceFeedback: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        improvementTips: { type: [String], default: [] },
        criterionFeedback: {
            taskResponse: { type: String, default: "" },
            coherenceCohesion: { type: String, default: "" },
            lexicalResource: { type: String, default: "" },
            grammarRangeAccuracy: { type: String, default: "" }
        },
        finalSummary: { type: String, default: "" }
    },
    { _id: false }
);

const WritingResultSchema = new mongoose.Schema(
    {
        task1: { type: WritingTaskSchema, default: () => ({}) },
        task2: { type: WritingTaskSchema, default: () => ({}) },
        overallBand: { type: Number, default: null },
        finalSummary: { type: String, default: "" }
    },
    { _id: false }
);

const SpeakingResultSchema = new mongoose.Schema(
    {
        fluency: { type: Number, default: null },
        pronunciation: { type: Number, default: null },
        grammar: { type: Number, default: null },
        vocabulary: { type: Number, default: null },
        overallBand: { type: Number, default: null },
        detailedFeedback: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        improvementTips: { type: [String], default: [] }
    },
    { _id: false }
);

const ResultSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        attemptKey: {
            type: String,
            default: "",
            trim: true
        },
        testId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        testName: {
            type: String,
            required: true,
            trim: true
        },
        moduleType: {
            type: String,
            enum: ["Reading", "Listening", "Writing", "Speaking"],
            required: true,
            index: true
        },
        reading: {
            type: ReadingResultSchema,
            default: () => ({})
        },
        listening: {
            type: ListeningResultSchema,
            default: () => ({})
        },
        writing: {
            type: WritingResultSchema,
            default: () => ({})
        },
        speaking: {
            type: SpeakingResultSchema,
            default: () => ({})
        },
        overallBand: {
            type: Number,
            default: null
        }
    },
    { timestamps: true }
);

ResultSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Result || mongoose.model("Result", ResultSchema);
