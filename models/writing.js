const mongoose = require("mongoose");

const WritingSchema = new mongoose.Schema(
    {
        task1Topic: String,
        task1Image: String,
        task1Text: String,
        task2Topic: String,
        task2Text: String,
        // Legacy fields (older data)
        image: String,
        task: {
            type: String,
            enum: ["task1", "task2"]
        },
        taskText: String,
        topic: String,
        audience: {
            type: String,
            enum: ["regular", "mooc"],
            default: "regular"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Writing", WritingSchema);
