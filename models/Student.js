const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // parol kiritilmagan edi
    role: { type: String, enum: ['student', 'teacher', 'mock_user', 'mooc'], default: 'student' }, // 🔑 qo‘shildi
    tests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Test' }]
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);
