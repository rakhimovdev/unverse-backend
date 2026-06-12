const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  planType: { type: String, enum: ['monthly', 'lifetime'] },
  amount: Number,
  status: { type: String, default: 'pending' }
}, { timestamps: true })

module.exports = mongoose.model('Order', orderSchema)