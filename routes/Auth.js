const express = require("express");

const auth = require("../middleware/auth");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/google", authController.google);
router.post("/student-setup", auth, authController.completeStudentSetup);
router.delete("/account", auth, authController.deleteAccount);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.get("/me", auth, authController.me);

module.exports = router;
