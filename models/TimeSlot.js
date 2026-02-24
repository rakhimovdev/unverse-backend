const mongoose = require("mongoose");

const TimeSlotSchema = new mongoose.Schema(
    {
        day: { type: String, required: true, trim: true },
        time: { type: String, required: true, trim: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true }
);

TimeSlotSchema.index(
    { teacher: 1, day: 1, time: 1 },
    { unique: true, partialFilterExpression: { teacher: { $exists: true } } }
);

module.exports = mongoose.model("TimeSlot", TimeSlotSchema);
