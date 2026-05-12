const requireRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "You do not have access to this resource." });
    }

    return next();
};

module.exports = requireRoles;
