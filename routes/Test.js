const router = require('express').Router();
const Test = require('../models/Test');

// Helper: valid mode
const isValidMode = (m) => ['full', 'part'].includes(m);

// =====================
// POST /test/upload
// =====================
// Accepts: { name, testText, readingText, questions, studentId, mode }
// Behaviour:
// - if mode === 'part' -> readingText will be cleared (ignored) by default
// - stores mode into DB
router.post('/upload', async (req, res) => {
    try {
        const { name, testText, readingText, questions, studentId, mode } = req.body;

        // Basic validation
        if (!name || !testText) {
            return res.status(400).json({ error: 'name va testText majburiy.' });
        }

        const finalMode = isValidMode(mode) ? mode : 'full';

        // Agar 'part' bo'lsa readingTextni saqlamaslik (yoki kerak bo'lsa saqlashni o'zgartiring)
        const readingToSave = finalMode === 'part' ? '' : (readingText || '');

        // Normalizatsiya: questions - massiv bo'lmasa [] ga o'tkaziladi
        const questionsToSave = Array.isArray(questions)
            ? questions.map((q) => ({
                value: typeof q.value === 'string' ? q.value : '',
                type: q.type === 'select' ? 'select' : 'text',
            }))
            : [];

        const test = new Test({
            name: name.trim(),
            testText,
            readingText: readingToSave,
            questions: questionsToSave,
            mode: finalMode,
            student: studentId || undefined,
        });

        await test.save();
        return res.status(201).json(test);
    } catch (err) {
        console.error('POST /test/upload error:', err);
        return res.status(500).json({ error: err.message || 'Server xatosi' });
    }
});

// =====================
// GET /test/last
// =====================
// Optional query: ?mode=full|part
// Returns the latest test (by createdAt) optionally filtered by mode
router.get('/last', async (req, res) => {
    try {
        const { mode } = req.query;
        const filter = {};
        if (mode && isValidMode(mode)) filter.mode = mode;

        const test = await Test.findOne(filter).sort({ createdAt: -1 });
        if (!test) return res.status(404).json({ message: 'Test topilmadi' });
        return res.json(test);
    } catch (err) {
        console.error('GET /test/last error:', err);
        return res.status(500).json({ error: err.message || 'Server xatosi' });
    }
});

// =====================
// GET /test/all
// =====================
// Optional query params:
// - mode=full|part  (filter by mode)
// - student=<id>    (filter by student)
// Pagination optionally could be added later
router.get('/all', async (req, res) => {
    try {
        const { mode, student } = req.query;
        const filter = {};
        if (mode && isValidMode(mode)) filter.mode = mode;
        if (student) filter.student = student;

        const tests = await Test.find(filter).sort({ createdAt: -1 });
        return res.json(tests);
    } catch (err) {
        console.error('GET /test/all error:', err);
        return res.status(500).json({ error: err.message || 'Server xatosi' });
    }
});

// =====================
// GET /test/:id
// =====================
router.get('/:id', async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test topilmadi' });
        return res.json(test);
    } catch (err) {
        console.error('GET /test/:id error:', err);
        return res.status(500).json({ error: err.message || 'Server xatosi' });
    }
});

// =====================
// DELETE /test/:id
// =====================
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Test.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Test topilmadi' });
        return res.json({ message: 'Test o‘chirildi', test: deleted });
    } catch (err) {
        console.error('DELETE /test/:id error:', err);
        return res.status(500).json({ error: err.message || 'Server xatosi' });
    }
});

module.exports = router;
