const User = require("../models/User");
const { extractBearerToken, verifyAuthToken } = require("../utils/jwt");

async function authMiddleware(req, res, next) {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
        return res.status(401).json({ message: "Authentication token is required." });
    }

    try {
        const decoded = verifyAuthToken(token);
        const user = await User.findById(decoded.id).select(
            "_id fullname name lastname email username role avatar isVerified studentType teacher timeSlot timeSlots"
        );

        if (!user) {
            return res.status(401).json({ message: "Authenticated user could not be found." });
        }

        if (user.isVerified === false) {
            return res.status(401).json({ message: "Please verify your email before continuing." });
        }

        req.user = {
            id: String(user._id),
            email: user.email,
            username: user.username || "",
            role: user.role,
            fullname: user.fullname || "",
            isVerified: user.isVerified,
            avatar: user.avatar || ""
        };
        req.authToken = token;

        return next();
    } catch (err) {
        console.error("JWT error:", err.message);
        return res.status(401).json({ message: "Invalid or expired authentication token." });
    }
}

module.exports = authMiddleware;
