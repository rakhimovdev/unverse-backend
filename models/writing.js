const mongoose = require("mongoose");

const WritingSchema = new mongoose.Schema({
    image: {
        type: String,
        required: true
    },
    topic: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Writing", WritingSchema);
