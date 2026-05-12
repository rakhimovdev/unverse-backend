const User = require("../models/User");

const normalizeBase = (value) => {
    const base = String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 18);

    return base || "digieduuser";
};

const buildUniqueUsername = async (seed) => {
    const base = normalizeBase(seed);
    let username = base;
    let suffix = 0;

    while (await User.exists({ username })) {
        suffix += 1;
        username = `${base}${suffix}`;
    }

    return username;
};

module.exports = {
    buildUniqueUsername
};
