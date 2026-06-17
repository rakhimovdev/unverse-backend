const WritingResult = require("../models/WritingResult");
const { isProActive } = require("./proPlan");

const FREE_DAILY_WRITING_CHECK_LIMIT = 1;
const FREE_DAILY_WRITING_CHECK_MESSAGE =
    "Daily free writing check limit reached. Upgrade to PRO.";

const isSameLocalDay = (left, right) => {
    if (!left || !right) return false;

    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
};

const resetWritingUsageIfNeeded = (user, now = new Date()) => {
    if (!user) return false;

    const resetAt = user.writingChecksResetAt
        ? new Date(user.writingChecksResetAt)
        : null;

    if (resetAt && isSameLocalDay(resetAt, now)) {
        return false;
    }

    user.writingChecksUsedToday = 0;
    user.writingChecksResetAt = now;
    return true;
};

const checkWritingAccess = async ({
    user,
    writingId = null,
    taskType = "",
    now = new Date()
}) => {
    if (!user) {
        return {
            allowed: false,
            status: 401,
            message: "Authentication required.",
        };
    }

    resetWritingUsageIfNeeded(user, now);

    if (isProActive(user, now)) {
        return {
            allowed: true,
            isPro: true,
            shouldConsume: false,
            remaining: null,
        };
    }

    const used = Number(user.writingChecksUsedToday) || 0;
    if (used >= FREE_DAILY_WRITING_CHECK_LIMIT) {
        if (writingId && taskType) {
            const startOfToday = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );

            const [hasCompanionTaskToday, hasCurrentTaskToday] = await Promise.all([
                WritingResult.exists({
                    userId: user._id,
                    writingId,
                    taskType: {
                        $in: ["task1", "task2"],
                        $ne: taskType
                    },
                    createdAt: { $gte: startOfToday }
                }),
                WritingResult.exists({
                    userId: user._id,
                    writingId,
                    taskType,
                    createdAt: { $gte: startOfToday }
                })
            ]);

            if (hasCompanionTaskToday && !hasCurrentTaskToday) {
                return {
                    allowed: true,
                    isPro: false,
                    shouldConsume: false,
                    remaining: 0,
                };
            }
        }

        return {
            allowed: false,
            status: 403,
            message: FREE_DAILY_WRITING_CHECK_MESSAGE,
            shouldConsume: false,
            remaining: 0,
        };
    }

    return {
        allowed: true,
        isPro: false,
        shouldConsume: true,
        remaining: FREE_DAILY_WRITING_CHECK_LIMIT - used,
    };
};

const consumeWritingCheck = (user, now = new Date()) => {
    if (!user) return false;

    resetWritingUsageIfNeeded(user, now);

    if (isProActive(user, now)) {
        return false;
    }

    user.writingChecksUsedToday = (Number(user.writingChecksUsedToday) || 0) + 1;
    user.writingChecksResetAt = now;
    return true;
};

module.exports = {
    FREE_DAILY_WRITING_CHECK_LIMIT,
    FREE_DAILY_WRITING_CHECK_MESSAGE,
    resetWritingUsageIfNeeded,
    checkWritingAccess,
    consumeWritingCheck,
};
