const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema(
    {
        writingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Writing",
            required: true
        },
        topic: {
            type: String,
            required: true
        },
        userName: String,
        userLastname: String,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        answer: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Response", ResponseSchema);
