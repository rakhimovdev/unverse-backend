const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
    {
        timeSlot: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TimeSlot",
            required: true
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        date: {
            type: String,
            required: true,
            default: () => new Date().toISOString().slice(0, 10)
        },
        status: {
            type: String,
            enum: ["keldi", "kelmadi", "sababli", ""],
            default: ""
        },
        payment: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

AttendanceSchema.index({ timeSlot: 1, student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
