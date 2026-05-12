const WritingResult = require("../models/WritingResult");

const TRACKED_TASKS = ["task1", "task2"];
const FREEFORM_SESSION_KEY = "__freeform__";
const SINGLE_AI_CHECK_LIMIT = 1;
const SINGLE_AI_CHECK_MESSAGE = "AI tekshiruv faqat 1 martalik. Limitingiz tugagan.";

const normalizeWritingId = (writingId) => writingId || null;

const toSessionKey = (writingId) => (
    writingId ? String(writingId) : FREEFORM_SESSION_KEY
);

const checkSingleAiAccess = async ({
    userId,
    taskType,
    writingId = null,
    limit = SINGLE_AI_CHECK_LIMIT
}) => {
    const normalizedWritingId = normalizeWritingId(writingId);

    const alreadyCheckedTask = await WritingResult.exists({
        userId,
        writingId: normalizedWritingId,
        taskType
    });

    if (alreadyCheckedTask) {
        return {
            allowed: false,
            message: SINGLE_AI_CHECK_MESSAGE
        };
    }

    const [usedWritingIds, hasFreeformSession] = await Promise.all([
        WritingResult.distinct("writingId", {
            userId,
            taskType: { $in: TRACKED_TASKS },
            writingId: { $ne: null }
        }),
        WritingResult.exists({
            userId,
            taskType: { $in: TRACKED_TASKS },
            writingId: null
        })
    ]);

    const usedSessionKeys = new Set(usedWritingIds.map((id) => String(id)));

    if (hasFreeformSession) {
        usedSessionKeys.add(FREEFORM_SESSION_KEY);
    }

    const currentSessionKey = toSessionKey(normalizedWritingId);

    if (!usedSessionKeys.has(currentSessionKey) && usedSessionKeys.size >= limit) {
        return {
            allowed: false,
            message: SINGLE_AI_CHECK_MESSAGE
        };
    }

    return { allowed: true };
};

module.exports = {
    SINGLE_AI_CHECK_LIMIT,
    checkSingleAiAccess
};
