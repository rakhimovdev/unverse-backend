const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const { upload } = require("../middleware/upload");
const auth = require("../middleware/auth");
const requireRoles = require("../middleware/requireRoles");
const Listening = require("../models/Testl");
const { getOptionalAuthPayload } = require("../utils/jwt");
const router = express.Router();

const getRoleFromReq = (req) => getOptionalAuthPayload(req)?.role || null;

const normalizeAudience = (value) => (value === "mooc" ? "mooc" : "regular");

const getAudienceFilter = (role) => {
    if (role === "admin" || role === "teacher") return {};
    if (role === "mooc") return { audience: "mooc" };
    return { audience: { $ne: "mooc" } };
};

const canAccessAudience = (role, audience) => {
    if (role === "admin" || role === "teacher") return true;
    const normalized = normalizeAudience(audience);
    if (role === "mooc") return normalized === "mooc";
    return normalized !== "mooc";
};

const canUseCloudinary = () => {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
};

const resolveBaseUrl = (req) => {
    if (process.env.BASE_URL) {
        return process.env.BASE_URL.replace(/\/+$/, "");
    }

    const host = req.get("host");
    if (!host) return "http://localhost:5000";

    const forwardedProto = req.headers["x-forwarded-proto"];
    const protoValue = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const protocol = (protoValue || req.protocol || "http").split(",")[0].trim();

    return `${protocol}://${host}`;
};

const uploadAudioToCloudinary = async (file) => {
    if (!file?.path) return null;
    if (!canUseCloudinary()) return null;

    const folder = process.env.CLOUDINARY_AUDIO_FOLDER || "ielts/listening/audio";

    const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "video",
        folder,
    });

    try {
        await fs.promises.unlink(file.path);
    } catch (err) {
        console.warn("Audio temp file delete failed:", err.message);
    }

    return {
        url: result.secure_url,
        publicId: result.public_id,
    };
};

const uploadImageToCloudinary = async (file) => {
    if (!file?.path) return null;
    if (!canUseCloudinary()) return null;

    const folder = process.env.CLOUDINARY_IMAGE_FOLDER || "ielts/listening/images";

    const result = await cloudinary.uploader.upload(file.path, {
        folder,
    });

    try {
        await fs.promises.unlink(file.path);
    } catch (err) {
        console.warn("Image temp file delete failed:", err.message);
    }

    return {
        url: result.secure_url,
        publicId: result.public_id,
    };
};

const PART_IMAGE_FIELDS = Array.from({ length: 4 }, (_, index) => ({
    name: `imagePart${index}`,
    maxCount: 1,
}));
const PART_AUDIO_FIELDS = Array.from({ length: 4 }, (_, index) => ({
    name: `audioPart${index}`,
    maxCount: 1,
}));

/**
 * 🔹 Full Listening test upload
 */
router.post(
    "/full",
    auth,
    requireRoles("teacher", "admin"),
    upload.fields([
        { name: "audio", maxCount: 1 },
        { name: "image", maxCount: 1 },
        ...PART_IMAGE_FIELDS,
        ...PART_AUDIO_FIELDS,
    ]),
    async (req, res) => {
        try {
            let questions = [];
            if (req.body.questions) {
                try {
                    questions = JSON.parse(req.body.questions);
                } catch (err) {
                    console.error("JSON parse error:", err);
                    questions = [];
                }
            }

            let partsPayload = [];
            if (req.body.parts) {
                try {
                    const parsed = JSON.parse(req.body.parts);
                    if (Array.isArray(parsed)) {
                        partsPayload = parsed;
                    }
                } catch (err) {
                    console.error("Parts JSON parse error:", err);
                    partsPayload = [];
                }
            }

            const parts = await Promise.all(
                partsPayload.map(async (part, index) => {
                    const imageField = `imagePart${index}`;
                    const audioField = `audioPart${index}`;
                    const imageFile = req.files?.[imageField]?.[0];
                    const imageUpload = imageFile
                        ? await uploadImageToCloudinary(imageFile)
                        : null;
                    const audioFile = req.files?.[audioField]?.[0];
                    const audioUpload = audioFile
                        ? await uploadAudioToCloudinary(audioFile)
                        : null;

                    return {
                        partNumber: index + 1,
                        transcript: part?.transcript || "",
                        testText: part?.testText || "",
                        questions: Array.isArray(part?.questions) ? part.questions : [],
                        imagePath:
                            imageUpload || !imageFile
                                ? null
                                : `/uploads/${imageFile.filename}`,
                        imageUrl: imageUpload?.url || null,
                        imagePublicId: imageUpload?.publicId || null,
                        audioPath:
                            audioUpload || !audioFile
                                ? null
                                : `/uploads/${audioFile.filename}`,
                        audioUrl: audioUpload?.url || null,
                        audioPublicId: audioUpload?.publicId || null,
                    };
                })
            );

            const mainAudioFile = req.files?.audio?.[0];
            const mainAudioUpload = mainAudioFile
                ? await uploadAudioToCloudinary(mainAudioFile)
                : null;
            const mainImageFile = req.files?.image?.[0];
            const mainImageUpload = mainImageFile
                ? await uploadImageToCloudinary(mainImageFile)
                : null;

            const newTest = new Listening({
                title: req.body.title,
                transcript: parts[0]?.transcript || req.body.transcript || "",
                testText: parts[0]?.testText || req.body.testText || "",
                audioPath:
                    mainAudioUpload || !mainAudioFile
                        ? null
                        : `/uploads/${mainAudioFile.filename}`,
                imagePath:
                    mainImageUpload || !mainImageFile
                        ? null
                        : `/uploads/${mainImageFile.filename}`,
                imageUrl: mainImageUpload?.url || null,
                imagePublicId: mainImageUpload?.publicId || null,
                questions: parts[0]?.questions?.length ? parts[0].questions : questions,
                parts,
                audioUrl: mainAudioUpload?.url || null,
                audioPublicId: mainAudioUpload?.publicId || null,
                audience: normalizeAudience(req.body.audience),
            });

            await newTest.save();
            res.json({ message: "✅ Listening test saqlandi", id: newTest._id });
        } catch (err) {
            console.error("Full uploadda xato:", err);
            res.status(500).json({ message: "Full uploadda xato", error: err.message });
        }
    }
);

/**
 * 🔹 Info olish (bitta test)
 */
router.get("/info/:id", async (req, res) => {
    try {
        const listening = await Listening.findById(req.params.id);
        if (!listening) {
            return res.status(404).json({ message: "Test topilmadi" });
        }
        const role = getRoleFromReq(req);
        if (!canAccessAudience(role, listening.audience)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        const baseUrl = resolveBaseUrl(req);
        const mainAudioUrl =
            listening.audioUrl || (listening.audioPath ? `${baseUrl}${listening.audioPath}` : null);
        const mainImageUrl =
            listening.imageUrl || (listening.imagePath ? `${baseUrl}${listening.imagePath}` : null);

        const parts = (listening.parts || []).map((part) => ({
            partNumber: part.partNumber,
            transcript: part.transcript,
            testText: part.testText,
            questions: part.questions,
            imageUrl: part.imageUrl || (part.imagePath ? `${baseUrl}${part.imagePath}` : null),
            audioUrl: part.audioUrl
                ? part.audioUrl
                : part.audioPath
                    ? `${baseUrl}${part.audioPath}`
                    : mainAudioUrl,
        }));

        res.json({
            _id: listening._id,
            title: listening.title,
            transcript: listening.transcript,
            testText: listening.testText,
            questions: listening.questions,
            parts,
            audioUrl: mainAudioUrl,
            imageUrl: mainImageUrl,
        });
    } catch (err) {
        console.error("Test olishda xato:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

/**
 * 🔹 Audio URL redirect (Cloudinary)
 */
router.get("/audio/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const baseUrl = resolveBaseUrl(req);
        const partIndex = Number(req.query.part);
        const role = getRoleFromReq(req);

        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({ message: "Audio topilmadi" });
        }

        const listening = await Listening.findById(id).select(
            "audioUrl audioPath audience parts.audioUrl parts.audioPath"
        );

        if (!listening) {
            return res.status(404).json({ message: "Audio topilmadi" });
        }

        if (!canAccessAudience(role, listening.audience)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        let url = null;

        if (!Number.isNaN(partIndex) && listening.parts?.[partIndex]) {
            const part = listening.parts[partIndex];
            url = part.audioUrl || (part.audioPath ? `${baseUrl}${part.audioPath}` : null);
        }

        if (!url) {
            url = listening.audioUrl || (listening.audioPath ? `${baseUrl}${listening.audioPath}` : null);
        }

        if (!url) {
            return res.status(404).json({ message: "Audio topilmadi" });
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.redirect(302, url);
    } catch (err) {
        console.error("Audio URL error:", err);
        res.status(500).json({ message: "Server xatosi" });
    }
});

/**
 * 🔹 Barcha testlarni olish (id + title)
 */
router.get("/all", async (req, res) => {
    try {
        const role = getRoleFromReq(req);
        const tests = await Listening.find(getAudienceFilter(role)).select("_id title");
        res.json(tests);
    } catch (err) {
        console.error("All olishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

/**
 * 🔹 Testni o‘chirish
 */
router.delete("/:id", auth, requireRoles("teacher", "admin"), async (req, res) => {
    try {
        const deleted = await Listening.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Test topilmadi!" });
        }
        const audioPublicIds = [];
        if (deleted.audioPublicId) audioPublicIds.push(deleted.audioPublicId);
        (deleted.parts || []).forEach((part) => {
            if (part.audioPublicId) audioPublicIds.push(part.audioPublicId);
        });

        if (audioPublicIds.length) {
            await Promise.all(
                audioPublicIds.map((publicId) =>
                    cloudinary.uploader
                        .destroy(publicId, { resource_type: "video" })
                        .catch((err) =>
                            console.warn("Cloudinary audio delete failed:", err.message)
                        )
                )
            );
        }
        const imagePublicIds = [];
        if (deleted.imagePublicId) imagePublicIds.push(deleted.imagePublicId);
        (deleted.parts || []).forEach((part) => {
            if (part.imagePublicId) imagePublicIds.push(part.imagePublicId);
        });
        if (imagePublicIds.length) {
            await Promise.all(
                imagePublicIds.map((publicId) =>
                    cloudinary.uploader
                        .destroy(publicId, { resource_type: "image" })
                        .catch((err) =>
                            console.warn("Cloudinary image delete failed:", err.message)
                        )
                )
            );
        }
        res.json({ message: "✅ Test o‘chirildi" });
    } catch (err) {
        console.error("Delete qilishda xato:", err);
        res.status(500).json({ message: "Server xatosi!" });
    }
});

module.exports = router;
