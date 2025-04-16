//routes/journalRoutes.js
const express = require('express');
const {
  createJournalEntry,
  getJournalEntries,
  getJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getJournalPrompts,
  getJournalStreak,
  markAchievementsSeen
} = require('../controllers/journalController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();



// ✅ Journal Entries Routes
router.post('/entries', authMiddleware, createJournalEntry);
router.get('/entries', authMiddleware, getJournalEntries);
router.get('/entries/:entryId', authMiddleware, getJournalEntry);
router.put('/entries/:entryId', authMiddleware, updateJournalEntry);
router.delete('/entries/:entryId', authMiddleware, deleteJournalEntry);

// ✅ Journal Prompts Routes
router.get('/prompts', authMiddleware, getJournalPrompts);

// ✅ Streak and Achievements Routes
router.get('/streak', authMiddleware, getJournalStreak);
router.post('/achievements/seen', authMiddleware, markAchievementsSeen);

module.exports = router;