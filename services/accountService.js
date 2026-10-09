const mongoose = require("mongoose");

const User = require("../models/User");
const Attendance = require("../models/Attendance");
const Response = require("../models/Response");
const Result = require("../models/Result");
const Score = require("../models/Score");
const ScoreL = require("../models/ScoreL");
const ScoreW = require("../models/ScoreW");
const WritingResult = require("../models/WritingResult");
const Test = require("../models/Test");
const Listening = require("../models/Testl");

const deleteAccount = async (userId) => {
    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            const ownerId = new mongoose.Types.ObjectId(userId);
            const user = await User.findById(ownerId).session(session);

            if (!user) {
                const error = new Error("Account could not be found.");
                error.status = 404;
                throw error;
            }

            if (!["student", "mooc", "mock_user"].includes(user.role)) {
                const error = new Error("Only student accounts can be deleted here.");
                error.status = 403;
                throw error;
            }

            await Attendance.deleteMany({ student: ownerId }, { session });
            await Response.deleteMany({ userId: ownerId }, { session });
            await Result.deleteMany({ userId: ownerId }, { session });
            await Score.deleteMany({ student: ownerId }, { session });
            await ScoreL.deleteMany({ student: ownerId }, { session });
            await ScoreW.deleteMany({ student: ownerId }, { session });
            await WritingResult.deleteMany({ userId: ownerId }, { session });
            await Test.updateMany(
                { student: ownerId },
                { $unset: { student: "" } },
                { session }
            );
            await Listening.updateMany(
                { student: ownerId },
                { $unset: { student: "" } },
                { session }
            );

            await User.findByIdAndDelete(ownerId, { session });
        });

        return { message: "Account and learning data deleted successfully." };
    } finally {
        await session.endSession();
    }
};

module.exports = { deleteAccount };
