const router = require('express').Router();
const Test = require('../models/Test');

// ✅ Test yaratish / upload
router.post('/upload', async (req, res) => {
    try {
        const { name, testText, readingText, questions, studentId } = req.body;

        const test = new Test({
            name,
            testText,
            readingText,
            questions,
            student: studentId // studentga bog‘laymiz
        });

        await test.save();
        res.status(201).json(test);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Testni o‘chirish
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Test.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Test topilmadi' });
        res.json({ message: 'Test o‘chirildi', test: deleted });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Oxirgi testni olish
router.get('/last', async (req, res) => {
    try {
        const test = await Test.findOne().sort({ createdAt: -1 });
        if (!test) return res.status(404).json({ message: 'Test topilmadi' });
        res.json(test);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Barcha testlarni olish
router.get('/all', async (req, res) => {
    try {
        const tests = await Test.find().sort({ createdAt: -1 });
        res.json(tests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Bitta testni olish
router.get('/:id', async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test topilmadi' });
        res.json(test);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
