const mongoose = require("mongoose");

const SlotCheckSchema = new mongoose.Schema(
    {
        timeSlot: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TimeSlot",
            required: true
        },
        date: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

SlotCheckSchema.index({ timeSlot: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("SlotCheck", SlotCheckSchema);
