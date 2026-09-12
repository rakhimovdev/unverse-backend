const express = require("express");

const auth = require("../middleware/auth");
const {
    getResults,
    getResultById,
    getResultComparison,
    createSpeakingResult
} = require("../controllers/resultController");

const router = express.Router();

router.get("/", auth, getResults);
router.get("/compare/:id", auth, getResultComparison);
router.get("/:id", auth, getResultById);
router.post("/speaking", auth, createSpeakingResult);

module.exports = router;
