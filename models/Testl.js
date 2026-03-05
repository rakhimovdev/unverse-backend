const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true },
    value: { type: String, trim: true },
    type: { type: String, enum: ["text", "select", "yn", "multi"], default: "text" },
    options: { type: [String], default: [] },
    top: { type: Number, default: 0 },
    left: { type: Number, default: 0 },
    width: { type: Number, default: 120 },
  },
  { _id: false }
);

const PartSchema = new mongoose.Schema(
  {
    partNumber: { type: Number, required: true },
    transcript: { type: String, default: "", trim: true },
    testText: { type: String, default: "" },
    questions: { type: [QuestionSchema], default: [] },
    imagePath: { type: String, default: null },
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null },
    audioPath: { type: String, default: null },
    audioFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    audioUrl: { type: String, default: null },
    audioPublicId: { type: String, default: null },
  },
  { _id: false }
);

const ListeningSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    transcript: { type: String, default: "", trim: true },
    testText: { type: String, default: "" },
    questions: { type: [QuestionSchema], default: [] },
    parts: { type: [PartSchema], default: [] },

    // 🔹 Path sifatida saqlanadi
    audioPath: { type: String, default: null },
    imagePath: { type: String, default: null },
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null },
    audioFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    audioUrl: { type: String, default: null },
    audioPublicId: { type: String, default: null },

    student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    audience: {
      type: String,
      enum: ["regular", "mooc"],
      default: "regular"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Listening", ListeningSchema);
