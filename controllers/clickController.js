const Order = require('../models/Order')
const User = require('../models/User')
const crypto = require('crypto')
const { applyProDuration } = require('../utils/proPlan')

const CLICK_URL = 'https://my.click.uz/services/pay'

// To'lov URL yaratish
exports.createPayment = async (req, res) => {
    try {
        const { planType } = req.body
        const userId = req.user.id

        const prices = {
            monthly: 49900,    // so'mda
            lifetime: 199900
        }

        const orderId = `${userId}_${planType}_${Date.now()}`

        await Order.create({
            orderId,
            userId,
            planType,
            amount: prices[planType],
            status: 'pending'
        })

        // Click to'lov URL
        const params = new URLSearchParams({
            service_id: process.env.CLICK_SERVICE_ID,
            merchant_id: process.env.CLICK_MERCHANT_ID,
            amount: prices[planType],
            transaction_param: orderId,
            return_url: `${process.env.FRONTEND_URL}/payment/success`
        })

        const paymentUrl = `${CLICK_URL}?${params.toString()}`
        res.json({ url: paymentUrl })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

// Click Webhook
exports.clickWebhook = async (req, res) => {
    try {
        const {
            click_trans_id,
            service_id,
            click_paydoc_id,
            merchant_trans_id,  // bizning orderId
            amount,
            action,
            error,
            sign_time,
            sign_string
        } = req.body

        // Signature tekshirish
        const secretKey = process.env.CLICK_SECRET_KEY
        const expectedSign = crypto
            .createHash('md5')
            .update(`${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${amount}${action}${sign_time}`)
            .digest('hex')

        if (sign_string !== expectedSign) {
            return res.json({ error: -1, error_note: 'Invalid sign' })
        }

        const order = await Order.findOne({ orderId: merchant_trans_id })
        if (!order) {
            return res.json({ error: -5, error_note: 'Order not found' })
        }

        // action=0: tekshirish, action=1: tasdiqlash
        if (action === 0) {
            return res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_confirm_id: order._id,
                error: 0,
                error_note: 'Success'
            })
        }

        if (action === 1 && error === 0) {
            // Foydalanuvchini Pro qilish
            const user = await User.findById(order.userId)
            if (user) {
                if (order.planType === 'monthly') {
                    applyProDuration(user, 'one_month')
                } else {
                    user.plan = 'pro'
                    user.isPro = true
                    user.proExpiresAt = null
                }
                await user.save()
            }

            await Order.findByIdAndUpdate(order._id, { status: 'paid' })

            return res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_confirm_id: order._id,
                error: 0,
                error_note: 'Success'
            })
        }

        res.json({ error: 0, error_note: 'Success' })

    } catch (err) {
        res.status(500).json({ error: -9, error_note: err.message })
    }
}
