const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);
const OTP_RESEND_COOLDOWN_SECONDS = Math.floor(OTP_RESEND_COOLDOWN_MS / 1000);

const generateOtpCode = () =>
    String(crypto.randomInt(100000, 1000000)).slice(0, OTP_LENGTH);

const hashOtpCode = (code) =>
    crypto.createHash("sha256").update(String(code)).digest("hex");

const buildOtpState = () => {
    const code = generateOtpCode();
    return {
        plainCode: code,
        hashedCode: hashOtpCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        sentAt: new Date()
    };
};

const getOtpRetryAfterSeconds = (lastSentAt) => {
    if (!lastSentAt) return 0;

    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;

    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
};

module.exports = {
    OTP_TTL_MS,
    OTP_TTL_SECONDS,
    OTP_RESEND_COOLDOWN_MS,
    OTP_RESEND_COOLDOWN_SECONDS,
    buildOtpState,
    hashOtpCode,
    getOtpRetryAfterSeconds
};
