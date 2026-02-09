const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema(
    {
        writingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Writing",
            required: true
        },
        task1Topic: String,
        task2Topic: String,
        // legacy fields
        topic: String,
        userName: String,
        userLastname: String,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        task1Answer: String,
        task2Answer: String,
        // legacy fields
        answer: String
    },
    { timestamps: true }
);

module.exports = mongoose.model("Response", ResponseSchema);
