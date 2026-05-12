const authService = require("../services/authService");

const handleAuthError = (res, error) => {
    const status = error.status || 500;
    return res.status(status).json({
        message: error.message || "Server xatosi",
        ...(error.details ? { details: error.details } : {})
    });
};

const register = async (req, res) => {
    try {
        const result = await authService.registerUser(req.body || {});
        return res.status(201).json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const login = async (req, res) => {
    try {
        const result = await authService.loginUser(req.body || {});
        return res.json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const google = async (req, res) => {
    try {
        const result = await authService.loginWithGoogle(req.body || {});
        return res.json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const sendOtp = async (req, res) => {
    try {
        const result = await authService.sendOtp(req.body || {});
        return res.json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const verifyOtp = async (req, res) => {
    try {
        const result = await authService.verifyOtp(req.body || {});
        return res.json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const resendOtp = async (req, res) => {
    try {
        const result = await authService.sendOtp(req.body || {});
        return res.json({
            ...result,
            message: "A new verification code has been sent."
        });
    } catch (error) {
        return handleAuthError(res, error);
    }
};

const me = async (req, res) => {
    try {
        const result = await authService.getCurrentUser(req.user.id);
        return res.json(result);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

module.exports = {
    register,
    login,
    google,
    sendOtp,
    verifyOtp,
    resendOtp,
    me
};
