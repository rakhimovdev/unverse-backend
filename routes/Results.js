const express = require("express");

const auth = require("../middleware/auth");
const {
    getResults,
    getResultById,
    createSpeakingResult
} = require("../controllers/resultController");

const router = express.Router();

router.get("/", auth, getResults);
router.get("/:id", auth, getResultById);
router.post("/speaking", auth, createSpeakingResult);

module.exports = router;
