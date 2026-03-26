const LEGACY_OWNER_ROLES = new Set(["admin", "teacher"]);
const LEGACY_USER_ROLES = new Set(["student", "mock_user", "mooc"]);

const normalizeRole = (role) => {
    if (role === "owner" || role === "user") return role;
    if (LEGACY_OWNER_ROLES.has(role)) return "owner";
    if (LEGACY_USER_ROLES.has(role)) return "user";
    return "user";
};

const isOwner = (role) => normalizeRole(role) === "owner";
const isUser = (role) => normalizeRole(role) === "user";

module.exports = {
    normalizeRole,
    isOwner,
    isUser
};
