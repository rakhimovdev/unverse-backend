const FREE_PLAN = "free";
const PRO_PLAN = "pro";

const PRO_DURATION_DAYS = {
    one_week: 7,
    two_weeks: 14,
    three_weeks: 21,
    one_month: 30,
};

const VALID_PLANS = new Set([FREE_PLAN, PRO_PLAN]);

const isValidDate = (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
};

const resolveUserPlan = (user, now = new Date()) => {
    const rawPlan = typeof user?.plan === "string" ? user.plan.trim().toLowerCase() : "";
    const basePlan = VALID_PLANS.has(rawPlan)
        ? rawPlan
        : user?.isPro
            ? PRO_PLAN
            : FREE_PLAN;

    if (
        basePlan === PRO_PLAN &&
        isValidDate(user?.proExpiresAt) &&
        new Date(user.proExpiresAt).getTime() <= now.getTime()
    ) {
        return FREE_PLAN;
    }

    return basePlan;
};

const isProActive = (user, now = new Date()) =>
    resolveUserPlan(user, now) === PRO_PLAN;

const syncPlanFields = (user, now = new Date()) => {
    if (!user) return user;

    const nextPlan = resolveUserPlan(user, now);
    user.plan = nextPlan;
    user.isPro = nextPlan === PRO_PLAN;

    if (
        nextPlan === FREE_PLAN &&
        isValidDate(user.proExpiresAt) &&
        new Date(user.proExpiresAt).getTime() <= now.getTime()
    ) {
        user.proExpiresAt = null;
    }

    return user;
};

const checkAndExpirePro = async (user, options = {}) => {
    if (!user) {
        return { expired: false, plan: FREE_PLAN, changed: false, user: null };
    }

    const now = options.now || new Date();
    const save =
        options.save !== undefined
            ? options.save
            : typeof user.save === "function";

    const previousPlan = typeof user.plan === "string" ? user.plan : undefined;
    const previousIsPro = Boolean(user.isPro);
    const previousExpiry = user.proExpiresAt ? new Date(user.proExpiresAt).getTime() : null;
    const expired =
        resolveUserPlan(user, new Date(0)) === PRO_PLAN &&
        isValidDate(user.proExpiresAt) &&
        new Date(user.proExpiresAt).getTime() <= now.getTime();

    syncPlanFields(user, now);

    const nextExpiry = user.proExpiresAt ? new Date(user.proExpiresAt).getTime() : null;
    const changed =
        previousPlan !== user.plan ||
        previousIsPro !== Boolean(user.isPro) ||
        previousExpiry !== nextExpiry;

    if (changed && save && typeof user.save === "function") {
        await user.save();
    }

    return {
        expired,
        plan: user.plan,
        changed,
        user,
    };
};

const calculateProExpiry = (durationKey, now = new Date()) => {
    const days = PRO_DURATION_DAYS[durationKey];
    if (!days) return null;

    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
};

const applyProDuration = (user, durationKey, now = new Date()) => {
    const proExpiresAt = calculateProExpiry(durationKey, now);
    if (!proExpiresAt) return null;

    user.plan = PRO_PLAN;
    user.isPro = true;
    user.proExpiresAt = proExpiresAt;

    return proExpiresAt;
};

const stopPro = (user) => {
    if (!user) return user;

    user.plan = FREE_PLAN;
    user.isPro = false;
    user.proExpiresAt = null;

    return user;
};

module.exports = {
    FREE_PLAN,
    PRO_PLAN,
    PRO_DURATION_DAYS,
    resolveUserPlan,
    isProActive,
    syncPlanFields,
    checkAndExpirePro,
    calculateProExpiry,
    applyProDuration,
    stopPro,
};
