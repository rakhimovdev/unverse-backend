const jwt = require("jsonwebtoken");

const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";
const readJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET environment variable is not configured.");
    }

    return process.env.JWT_SECRET;
};

const extractBearerToken = (authorizationHeader = "") => {
    const authHeader = String(authorizationHeader || "").trim();
    if (!authHeader) return "";

    if (authHeader.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }

    return authHeader;
};

const signAuthToken = (user) =>
    jwt.sign(
        {
            id: String(user._id),
            role: user.role,
            email: user.email,
            username: user.username || ""
        },
        readJwtSecret(),
        { expiresIn: JWT_EXPIRES }
    );

const verifyAuthToken = (token) => jwt.verify(token, readJwtSecret());

const getOptionalAuthPayload = (req) => {
    const token = extractBearerToken(req?.headers?.authorization);
    if (!token) return null;

    try {
        return verifyAuthToken(token);
    } catch (error) {
        return null;
    }
};

module.exports = {
    signAuthToken,
    verifyAuthToken,
    extractBearerToken,
    getOptionalAuthPayload
};
