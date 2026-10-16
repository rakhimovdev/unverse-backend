const mongoose = require("mongoose");

const HomeworkSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot", required: true, index: true },
    groupName: { type: String, trim: true, default: "" },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: "" },
    extraInfo: { type: String, default: "" },
    testType: { type: String, default: "" },
    testId: { type: String, default: "" },
    readingTestId: { type: String, default: "" },
    listeningTestId: { type: String, default: "" },
    writingTestId: { type: String, default: "" },
    sections: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    lessonDay: { type: String, trim: true, default: "" },
    lessonTime: { type: String, trim: true, default: "" },
    lessonDate: { type: String, trim: true, default: "" },
    dueDate: { type: String, trim: true, default: "" },
    dueTime: { type: String, trim: true, default: "" },
    assignedAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

HomeworkSchema.index(
  { teacher: 1, group: 1, lessonDate: 1, lessonTime: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

module.exports = mongoose.models.Homework || mongoose.model("Homework", HomeworkSchema);
