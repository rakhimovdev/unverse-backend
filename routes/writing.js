const express = require("express");
const router = express.Router();
const multer = require("multer");
const Writing = require("../models/writing");
const Response = require("../models/Response");
const User = require("../models/Student");
const auth = require("../middleware/auth");
const requireRoles = require("../middleware/requireRoles");
const { getOptionalAuthPayload } = require("../utils/jwt");

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

// -------------------- MULTER --------------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

const toDataUri = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

// -------------------- POST: Writing create --------------------
router.post(
  "/upload",
  auth,
  requireRoles("teacher", "admin"),
  upload.single("image"),
  async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const normalizedAudience = normalizeAudience(req.body.audience);

    const hasCombinedFields = ["task1Topic", "task1Text", "task2Topic", "task2Text"].some(
      (key) => Object.prototype.hasOwnProperty.call(req.body, key)
    );

    const imageData = req.file ? toDataUri(req.file) : "";

    if (hasCombinedFields) {
      const task1Topic = (req.body.task1Topic || "").trim();
      const task1Text = (req.body.task1Text || "").trim();
      const task2Topic = task1Topic;
      const task2Text = (req.body.task2Text || "").trim();

      if (!task1Topic) {
        return res.status(400).json({ message: "Task 1 topic yozilmagan!" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Task 1 rasmi kelmadi!" });
      }
      if (!task1Text) {
        return res.status(400).json({ message: "Task 1 matni yozilmagan!" });
      }
      if (!task2Text) {
        return res.status(400).json({ message: "Task 2 matni yozilmagan!" });
      }

      const newWriting = new Writing({
        task1Topic,
        task1Image: imageData,
        task1Text,
        task2Topic,
        task2Text,
        topic: task1Topic,
        image: imageData,
        audience: normalizedAudience
      });

      await newWriting.save();
      return res.status(201).json(newWriting);
    }

    // Legacy single-task upload
    const task = req.body.task === "task2" ? "task2" : "task1";
    const taskText = (req.body.taskText || "").trim();

    if (task === "task1" && !req.file) {
      return res.status(400).json({ message: "Image kelmadi!" });
    }
    if (!req.body.topic || !req.body.topic.trim()) {
      return res.status(400).json({ message: "Topic yozilmagan!" });
    }
    if (task === "task2" && !taskText) {
      return res.status(400).json({ message: "Task 2 matni yozilmagan!" });
    }

    const newWriting = new Writing({
      topic: req.body.topic,
      task,
      taskText,
      image: req.file ? imageData : "",
      audience: normalizedAudience
    });

    await newWriting.save();

    res.status(201).json(newWriting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/delete/:id", auth, requireRoles("teacher", "admin"), async (req, res) => {
  try {
    const writing = await Writing.findByIdAndDelete(req.params.id);
    if (!writing) {
      return res.status(404).json({ message: "Writing topilmadi!" });
    }
    res.json({ message: "✅ Writing o‘chirildi" });
  } catch (err) {
    console.error("Delete qilishda xato:", err);
    res.status(500).json({ message: "Server xatosi!" });
  }
})

// -------------------- GET: All writings --------------------
router.get("/all", async (req, res) => {
  try {
    const role = getRoleFromReq(req);
    const tests = await Writing.find({
      task1Topic: { $exists: true, $ne: "" },
      task2Topic: { $exists: true, $ne: "" },
      task2Text: { $exists: true, $ne: "" },
      ...getAudienceFilter(role)
    }).select("_id task1Topic task2Topic topic");
    res.json(tests);
  } catch (err) {
    console.error("All olishda xato:", err);
    res.status(500).json({ message: "Server xatosi!" });
  }
});

// -------------------- GET: One writing --------------------
router.get("/:id", async (req, res) => {
  try {
    const writing = await Writing.findById(req.params.id);
    if (!writing) {
      return res.status(404).json({ error: "Not found" });
    }
    const role = getRoleFromReq(req);
    if (!canAccessAudience(role, writing.audience)) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    res.json(writing);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- POST: Save user response --------------------
router.post("/response", async (req, res) => {
  try {
    const {
      writingId,
      topic,
      userId,
      answer,
      task1Answer,
      task2Answer
    } = req.body;

    const hasCombinedAnswers =
      task1Answer !== undefined || task2Answer !== undefined;

    if (!writingId || !userId) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (hasCombinedAnswers) {
      if (!task1Answer || !task2Answer) {
        return res.status(400).json({ message: "Ikkala task javobi kerak" });
      }
    } else if (!answer) {
      return res.status(400).json({ message: "Answer kerak" });
    }

    // 🔹 Userni topamiz
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const writing = await Writing.findById(writingId);
    if (!writing) {
      return res.status(404).json({ message: "Writing topilmadi!" });
    }
    const task1Topic = writing?.task1Topic || writing?.topic || "";
    const task2Topic = writing?.task2Topic || "";

    const newResponse = new Response(
      hasCombinedAnswers
        ? {
            writingId,
            task1Topic,
            task2Topic,
            task1Answer,
            task2Answer,
            userId,
            userName: user.name,
            userLastname: user.lastname
          }
        : {
            writingId,
            topic: topic || task1Topic,
            userId,
            userName: user.name,
            userLastname: user.lastname,
            answer
          }
    );

    await newResponse.save();

    res.status(201).json({
      message: "Response saved",
      data: newResponse
    });
  } catch (error) {
    console.error("SAVE RESPONSE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
