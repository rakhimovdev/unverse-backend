const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User");
const TimeSlot = require("../models/TimeSlot");
const { signAuthToken } = require("../utils/jwt");
const { serializeUser } = require("../utils/userSerializer");
const { checkAndExpirePro } = require("../utils/proPlan");
const { buildUniqueUsername } = require("../utils/username");
const {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    isValidEmail,
    isValidOtpCode,
    isValidPassword,
    normalizeEmail,
    normalizeWhitespace
} = require("../utils/authValidation");
const {
    OTP_RESEND_COOLDOWN_SECONDS,
    buildOtpState,
    getOtpRetryAfterSeconds,
    hashOtpCode
} = require("./otpService");
const { sendOtpEmail } = require("./emailService");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const STAFF_ROLES = new Set(["teacher", "admin"]);

const createAuthError = (status, message, details) => {
    const error = new Error(message);
    error.status = status;
    if (details) error.details = details;
    return error;
};

const splitFullname = (fullname) => {
    const normalized = normalizeWhitespace(fullname);
    const [name = "", ...rest] = normalized.split(" ");

    return {
        fullname: normalized,
        name,
        lastname: rest.join(" ")
    };
};

const getOtpExpiresInSeconds = (expiresAt) => {
    if (!expiresAt) return 0;
    return Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
    );
};

const buildOtpResponse = (user, message, retryAfter = OTP_RESEND_COOLDOWN_SECONDS) => ({
    message,
    email: user.email,
    expiresAt: user.otpExpires,
    expiresInSeconds: getOtpExpiresInSeconds(user.otpExpires),
    cooldownSeconds: retryAfter
});

const ensureOtpCooldownElapsed = (user) => {
    const retryAfter = getOtpRetryAfterSeconds(user?.otpLastSentAt);

    if (retryAfter > 0) {
        throw createAuthError(
            429,
            `Please wait ${retryAfter} seconds before requesting another code.`,
            { retryAfter }
        );
    }
};

const applyOtpToUser = (user) => {
    const nextOtp = buildOtpState();
    user.otpCode = nextOtp.hashedCode;
    user.otpExpires = nextOtp.expiresAt;
    user.otpLastSentAt = nextOtp.sentAt;
    return nextOtp.plainCode;
};

const buildSession = (user) => ({
    token: signAuthToken(user),
    user: serializeUser(user)
});

const validateStudentRegistrationInput = (payload = {}) => {
    const fullname = normalizeWhitespace(payload.fullname);
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    const studentType = String(payload.studentType || "outsider").trim().toLowerCase();

    if (fullname.length < 3) {
        throw createAuthError(400, "Full name must be at least 3 characters.");
    }

    if (!isValidEmail(email)) {
        throw createAuthError(400, "Please provide a valid email address.");
    }

    if (!isValidPassword(password)) {
        throw createAuthError(
            400,
            `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`
        );
    }

    if (!["outsider", "insider"].includes(studentType)) {
        throw createAuthError(400, "Student type must be either outsider or insider.");
    }

    return { fullname, email, password, studentType };
};

const resolveStudentPlacement = async (payload = {}) => {
    const isOutsider = String(payload.studentType || "outsider").toLowerCase() === "outsider";

    if (isOutsider) {
        return {
            studentType: "outsider",
            teacher: null,
            timeSlot: null,
            timeSlots: []
        };
    }

    const { teacherId, timeSlotId, timeSlotIds, timeGroup, time } = payload;

    if (
        !teacherId ||
        !(timeSlotId || (Array.isArray(timeSlotIds) && timeSlotIds.length) || (timeGroup && time))
    ) {
        throw createAuthError(400, "Please choose a teacher and a time slot.");
    }

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" }).select("_id");
    if (!teacher) {
        throw createAuthError(400, "Selected teacher could not be found.");
    }

    let selectedSlots = [];

    if (Array.isArray(timeSlotIds) && timeSlotIds.length) {
        selectedSlots = await TimeSlot.find({ _id: { $in: timeSlotIds } }).select("_id teacher");
    } else if (timeSlotId) {
        const singleSlot = await TimeSlot.findById(timeSlotId).select("_id teacher");
        if (singleSlot) selectedSlots = [singleSlot];
    } else if (timeGroup && time) {
        const dayList =
            timeGroup === "juft"
                ? ["Seshanba", "Payshanba", "Shanba"]
                : timeGroup === "toq"
                    ? ["Dushanba", "Chorshanba", "Juma"]
                    : [];

        selectedSlots = await TimeSlot.find({
            teacher: teacher._id,
            day: { $in: dayList },
            time: String(time).trim()
        }).select("_id teacher");
    }

    if (!selectedSlots.length) {
        throw createAuthError(400, "Selected time slot could not be found.");
    }

    if (selectedSlots.some((slot) => String(slot.teacher) !== String(teacher._id))) {
        throw createAuthError(400, "Selected time slot does not belong to the selected teacher.");
    }

    return {
        studentType: "insider",
        teacher: teacher._id,
        timeSlot: selectedSlots[0]?._id || null,
        timeSlots: selectedSlots.map((slot) => slot._id)
    };
};

const buildAuthProfile = async (payload = {}, existingUser = null) => {
    const email = normalizeEmail(payload.email);
    const { fullname, name, lastname } = splitFullname(payload.fullname);
    const placement = await resolveStudentPlacement(payload);

    const usernameSeed =
        payload.username ||
        email.split("@")[0] ||
        [name, lastname].filter(Boolean).join("");

    return {
        fullname,
        name,
        lastname,
        email,
        username: existingUser?.username || (await buildUniqueUsername(usernameSeed)),
        role: existingUser?.role || "student",
        avatar: existingUser?.avatar || "",
        studentType: placement.studentType,
        teacher: placement.teacher,
        timeSlot: placement.timeSlot,
        timeSlots: placement.timeSlots
    };
};

const ensureNotStaffAccount = (user) => {
    if (user && STAFF_ROLES.has(user.role)) {
        throw createAuthError(
            403,
            "This email belongs to a staff account. Please use the staff login portal."
        );
    }
};

const registerUser = async (payload = {}) => {
    const { fullname, email, password, studentType } =
        validateStudentRegistrationInput(payload);

    const existingUser = await User.findOne({ email }).select(
        "+password +otpCode +otpExpires +otpLastSentAt"
    );

    ensureNotStaffAccount(existingUser);

    if (existingUser?.googleId && !existingUser?.password) {
        throw createAuthError(
            409,
            "This email is already registered with Google. Please continue with Google."
        );
    }

    if (existingUser && existingUser.isVerified !== false) {
        throw createAuthError(409, "An account with this email already exists.");
    }

    const user = existingUser || new User();
    const profile = await buildAuthProfile(
        {
            ...payload,
            fullname,
            email,
            studentType
        },
        existingUser
    );

    Object.assign(user, profile, {
        password: await bcrypt.hash(password, 12),
        googleId: existingUser?.googleId || "",
        isVerified: false
    });

    const retryAfter = getOtpRetryAfterSeconds(existingUser?.otpLastSentAt);
    const hasActiveOtp =
        Boolean(existingUser?.otpCode) &&
        Boolean(existingUser?.otpExpires) &&
        new Date(existingUser.otpExpires).getTime() > Date.now();

    if (retryAfter > 0 && hasActiveOtp) {
        await user.save();

        return buildOtpResponse(
            user,
            `A verification code has already been sent to ${user.email}. Use the current code or resend when the timer reaches zero.`,
            retryAfter
        );
    }

    const otpCode = applyOtpToUser(user);
    await user.save();
    await sendOtpEmail({ to: user.email, fullname: user.fullname, otpCode });

    return buildOtpResponse(user, "Verification code sent to your email.");
};

const sendOtp = async ({ email }) => {
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
        throw createAuthError(400, "Please provide a valid email address.");
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
        "+otpCode +otpExpires +otpLastSentAt"
    );

    if (!user) {
        throw createAuthError(404, "User not found.");
    }

    if (user.isVerified) {
        throw createAuthError(400, "This account is already verified.");
    }

    ensureOtpCooldownElapsed(user);

    const otpCode = applyOtpToUser(user);
    await user.save();
    await sendOtpEmail({ to: user.email, fullname: user.fullname, otpCode });

    return buildOtpResponse(user, "Verification code sent successfully.");
};

const verifyOtp = async ({ email, otpCode }) => {
    const normalizedEmail = normalizeEmail(email);
    const code = String(otpCode || "").trim();

    if (!isValidEmail(normalizedEmail)) {
        throw createAuthError(400, "Please provide a valid email address.");
    }

    if (!isValidOtpCode(code)) {
        throw createAuthError(400, "A valid 6-digit OTP code is required.");
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
        "+otpCode +otpExpires +otpLastSentAt"
    );

    if (!user) {
        throw createAuthError(404, "User not found.");
    }

    if (user.isVerified) {
        return {
            message: "Account already verified.",
            ...buildSession(user)
        };
    }

    if (!user.otpCode || !user.otpExpires) {
        throw createAuthError(400, "No active OTP found. Please request a new code.");
    }

    if (new Date(user.otpExpires).getTime() < Date.now()) {
        throw createAuthError(
            400,
            "OTP code has expired. Please request a new one.",
            { expired: true }
        );
    }

    if (hashOtpCode(code) !== user.otpCode) {
        throw createAuthError(400, "Invalid verification code.");
    }

    user.isVerified = true;
    user.otpCode = "";
    user.otpExpires = null;
    user.otpLastSentAt = null;
    await user.save();

    return {
        message: "Email verified successfully.",
        ...buildSession(user)
    };
};

const loginUser = async ({ email, identifier, password }) => {
    const rawIdentifier = normalizeWhitespace(identifier || email);
    const normalizedEmail = normalizeEmail(rawIdentifier);
    const rawPassword = String(password || "");

    if (!rawIdentifier || !rawPassword) {
        throw createAuthError(400, "Email and password are required.");
    }

    const user = await User.findOne({
        $or: [{ email: normalizedEmail }, { username: rawIdentifier }]
    }).select("+password");

    if (!user) {
        throw createAuthError(401, "Invalid email/username or password.");
    }

    if (user.googleId && !user.password) {
        throw createAuthError(
            400,
            "This account uses Google sign-in. Please continue with Google."
        );
    }

    if (user.isVerified === false) {
        throw createAuthError(
            403,
            "Please verify your email before logging in.",
            {
                requiresVerification: true,
                email: user.email
            }
        );
    }

    const matches = await bcrypt.compare(rawPassword, user.password);
    if (!matches) {
        throw createAuthError(401, "Invalid email/username or password.");
    }

    return {
        message: "Login successful.",
        ...buildSession(user)
    };
};

const loginWithGoogle = async ({ credential }) => {
    if (!GOOGLE_CLIENT_ID || !googleClient) {
        throw createAuthError(500, "Google OAuth is not configured on the server.");
    }

    if (!credential) {
        throw createAuthError(400, "Google credential is required.");
    }

    const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload?.sub || !payload?.email_verified) {
        throw createAuthError(401, "Unable to verify Google account.");
    }

    const email = normalizeEmail(payload.email);
    const fullname = payload.name || email.split("@")[0];
    const { name, lastname } = splitFullname(fullname);

    let user = await User.findOne({
        $or: [{ googleId: payload.sub }, { email }]
    }).select("+password +otpCode +otpExpires +otpLastSentAt");

    ensureNotStaffAccount(user);

    if (user) {
        if (!user.username) {
            user.username = await buildUniqueUsername(email.split("@")[0]);
        }

        user.googleId = payload.sub;
        user.fullname = user.fullname || fullname;
        user.name = user.name || name;
        user.lastname = user.lastname || lastname;
        user.avatar = payload.picture || user.avatar || "";
        user.isVerified = true;

        if (!user.studentType && user.role === "student") {
            user.studentType = "outsider";
        }
    } else {
        user = new User({
            fullname,
            name,
            lastname,
            email,
            username: await buildUniqueUsername(email.split("@")[0]),
            password: "",
            googleId: payload.sub,
            avatar: payload.picture || "",
            role: "student",
            studentType: "outsider",
            isVerified: true
        });
    }

    user.otpCode = "";
    user.otpExpires = null;
    user.otpLastSentAt = null;
    await user.save();

    return {
        message: "Google login successful.",
        ...buildSession(user)
    };
};

const getCurrentUser = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw createAuthError(404, "User not found.");
    }

    await checkAndExpirePro(user);

    return {
        user: serializeUser(user)
    };
};

module.exports = {
    createAuthError,
    registerUser,
    sendOtp,
    verifyOtp,
    loginUser,
    loginWithGoogle,
    getCurrentUser
};
