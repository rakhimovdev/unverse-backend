const express = require('express')
const router = express.Router()
const { createPayment, clickWebhook } = require('../controllers/clickController')
const authMiddleware = require('../middleware/auth')

router.post('/create', authMiddleware, createPayment)
router.post('/webhook', clickWebhook)

module.exports = router