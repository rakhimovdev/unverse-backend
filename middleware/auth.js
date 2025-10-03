const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: "Token topilmadi ❌" });
    }

    // "Bearer token" yoki faqat "token"
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

    if (!token) {
        return res.status(401).json({ message: "Token topilmadi ❌" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // 🔹 decoded object ichida `id`, `role`, `email` bo‘lishi mumkin
        req.user = decoded;

        next();
    } catch (err) {
        console.error("JWT xatosi:", err.message);
        return res.status(401).json({ message: "Noto‘g‘ri yoki muddati o‘tgan token ❌" });
    }
}

module.exports = authMiddleware;
