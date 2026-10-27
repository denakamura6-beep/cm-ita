const router = require('express').Router();
const db = require('../db');
const ollama = require('../services/ollama');
const ai = require('../services/ai');
const { requireAdmin } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { aiPerMinute } = require('../config');
const { AppError, wrap } = require('../errors');

const limiter = rateLimit({
  max: aiPerMinute,
  message: 'You are asking too fast. Please wait a minute.',
});

router.get(
  '/status',
  wrap(async (req, res) => res.json(await ollama.status())),
);

// ADMIN: rough notes (any language) -> draft announcement
router.post(
  '/draft',
  requireAdmin,
  limiter,
  wrap(async (req, res) => {
    const notes = String(req.body?.notes || '').trim();
    if (notes.length < 5)
      throw new AppError(400, 'Please type your rough notes first.');
    if (notes.length > 1500)
      throw new AppError(400, 'Notes are too long (1500 characters at most).');
    res.json(await ai.draftAnnouncement(notes));
  }),
);

// STUDENT: ask a question about the announcements (any language)
router.post(
  '/ask',
  limiter,
  wrap(async (req, res) => {
    const question = String(req.body?.question || '').trim();
    if (!question) throw new AppError(400, 'Please type a question.');
    if (question.length > 300)
      throw new AppError(400, 'Question is too long (300 characters at most).');
    const { rows } = await db.query(
      'SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 200',
    );
    res.json(await ai.answerQuestion(question, rows));
  }),
);

module.exports = router;
