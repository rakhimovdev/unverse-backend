const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    lastname: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    timeSlot: { type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot", default: null },
    timeSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot" }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
