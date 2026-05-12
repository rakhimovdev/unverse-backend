const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,24}$/;
const OTP_REGEX = /^\d{6}$/;

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

const normalizeWhitespace = (value) =>
    String(value || "").trim().replace(/\s+/g, " ");

const normalizeEmail = (value) => normalizeWhitespace(value).toLowerCase();

const normalizeUsername = (value) => normalizeWhitespace(value);

const isValidEmail = (value) => EMAIL_REGEX.test(normalizeEmail(value));

const isValidUsername = (value) => USERNAME_REGEX.test(normalizeUsername(value));

const isValidPassword = (value) => {
    const password = String(value || "");
    return (
        password.length >= PASSWORD_MIN_LENGTH &&
        password.length <= PASSWORD_MAX_LENGTH
    );
};

const isValidOtpCode = (value) => OTP_REGEX.test(String(value || "").trim());

module.exports = {
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    normalizeWhitespace,
    normalizeEmail,
    normalizeUsername,
    isValidEmail,
    isValidUsername,
    isValidPassword,
    isValidOtpCode
};
