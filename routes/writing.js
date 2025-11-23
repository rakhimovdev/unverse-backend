const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const Writing = require("../models/writing");

// -------------------- MULTER SETUP --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads"); // uploads papkasi
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unik nom
  }
});

const upload = multer({ storage });

// -------------------- POST: Upload Image + Topic --------------------
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const newWriting = new Writing({
      topic: req.body.topic,
      image: req.file.filename
    });

    await newWriting.save();

    return res.status(201).json({
      message: "Writing task saved successfully!",
      data: newWriting
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- GET: All Writings --------------------
router.get("/all", async (req, res) => {
  try {
    const writings = await Writing.find().sort({ createdAt: -1 });
    res.status(200).json(writings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- GET: One Writing by ID --------------------
router.get("/:id", async (req, res) => {
  try {
    const writing = await Writing.findById(req.params.id);

    if (!writing) {
      return res.status(404).json({ error: "Writing task not found" });
    }

    res.status(200).json(writing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
