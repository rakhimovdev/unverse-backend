import mongoose from "mongoose";

const PostSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        content: {
            type: String,
            required: true,
        },
        imageUrl: {
            type: String,
            required: false, // rasm bo‘lishi shart emas
        }
    },
    { timestamps: true }
);

export default mongoose.model("Post", PostSchema);
