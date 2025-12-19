const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const Writing = require("../models/writing");
const Response = require("../models/Response");
const User = require("../models/Student");

// -------------------- MULTER --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// -------------------- POST: Writing create --------------------
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    if (!req.file) {
      return res.status(400).json({ message: "Image kelmadi!" });
    }

    const newWriting = new Writing({
      topic: req.body.topic,
      image: req.file.filename
    });

    await newWriting.save();

    res.status(201).json(newWriting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


// -------------------- GET: All writings --------------------
router.get("/all", async (req, res) => {
  console.log("GET /writing/all HIT"); // 👈 SHU CHIQSIN
  try {
    const writings = await Writing.find().sort({ createdAt: -1 });
    res.json(writings);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});


// -------------------- GET: One writing --------------------
router.get("/:id", async (req, res) => {
  try {
    const writing = await Writing.findById(req.params.id);
    if (!writing) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(writing);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- POST: Save user response --------------------
router.post("/response", async (req, res) => {
  try {
    const { writingId, topic, userId, answer } = req.body;

    if (!writingId || !userId || !answer) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 🔹 Userni topamiz
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newResponse = new Response({
      writingId,
      topic,
      userId,
      userName: user.name,
      userLastname: user.lastname,
      answer
    });

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
