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
        if (err?.name === "TokenExpiredError") {
            try {
                const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
                if (decoded?.role === "teacher") {
                    req.user = decoded;
                    return next();
                }
            } catch (innerErr) {
                console.error("JWT xatosi:", innerErr.message);
                return res.status(401).json({ message: "Noto‘g‘ri token ❌" });
            }
        }

        console.error("JWT xatosi:", err.message);
        return res.status(401).json({ message: "Noto‘g‘ri yoki muddati o‘tgan token ❌" });
    }
}

module.exports = authMiddleware;
