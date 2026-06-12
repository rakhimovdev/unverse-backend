const mongoose = require("mongoose");
const { syncPlanFields } = require("../utils/proPlan");

const UserSchema = new mongoose.Schema(
    {
        fullname: { type: String, trim: true, default: "" },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, default: "", select: false },
        googleId: { type: String, unique: true, sparse: true, trim: true },
        avatar: { type: String, default: "" },
        role: {
            type: String,
            enum: ["student", "teacher", "admin", "mock_user", "mooc"],
            default: "student"
        },
        isVerified: { type: Boolean, default: false },
        otpCode: { type: String, default: "", select: false },
        otpExpires: { type: Date, default: null, select: false },
        otpLastSentAt: { type: Date, default: null, select: false },
        name: { type: String, trim: true, default: "" },
        lastname: { type: String, trim: true, default: "" },
        username: { type: String, unique: true, sparse: true, trim: true },
        studentType: { type: String, enum: ["insider", "outsider"], default: null },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        timeSlot: { type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot", default: null },
        timeSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot" }],
        plan: {
            type: String,
            enum: ["free", "pro"],
            default: "free"
        },
        isPro: { type: Boolean, default: false },
        proExpiresAt: { type: Date, default: null },
        lastActiveAt: { type: Date, default: null },
        writingChecksUsedToday: { type: Number, default: 0, min: 0 },
        writingChecksResetAt: { type: Date, default: null }
    },
    { timestamps: true }
);

UserSchema.pre("validate", function syncLegacyNameFields(next) {
    const safeFullname = typeof this.fullname === "string" ? this.fullname.trim() : "";
    const safeName = typeof this.name === "string" ? this.name.trim() : "";
    const safeLastname = typeof this.lastname === "string" ? this.lastname.trim() : "";

    if (!safeFullname && (safeName || safeLastname)) {
        this.fullname = [safeName, safeLastname].filter(Boolean).join(" ").trim();
    }

    if (safeFullname && (!safeName || !safeLastname)) {
        const [first = "", ...rest] = safeFullname.split(/\s+/);
        this.name = safeName || first;
        this.lastname = safeLastname || rest.join(" ");
    }

    if (typeof this.email === "string") {
        this.email = this.email.trim().toLowerCase();
    }

    syncPlanFields(this);

    next();
});

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
