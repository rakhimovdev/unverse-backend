const { isProActive, resolveUserPlan } = require("./proPlan");

const resolveFullname = (user) => {
    if (user?.fullname) return user.fullname;
    return [user?.name, user?.lastname].filter(Boolean).join(" ").trim();
};

const serializeUser = (user) => ({
    id: String(user._id),
    fullname: resolveFullname(user),
    name: user.name || "",
    lastname: user.lastname || "",
    email: user.email,
    username: user.username || "",
    role: user.role,
    avatar: user.avatar || "",
    googleId: user.googleId || "",
    isVerified: Boolean(user.isVerified),
    plan: resolveUserPlan(user),
    isPro: isProActive(user),
    proExpiresAt: user.proExpiresAt || null,
    studentType: user.studentType || null,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt || null
});

module.exports = {
    serializeUser
};
