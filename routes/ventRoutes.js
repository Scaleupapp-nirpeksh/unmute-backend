const express = require('express');
const { createVent, getVents, reactToVent, deleteVent, searchVents,getVentFeed , reportVent} = require('../controllers/ventController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ Rate Limit Vent Creation to prevent spam (Max 5 per minute per user)
const rateLimit = require('express-rate-limit');
const ventLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Max 5 vents per user per minute
    message: "⚠️ Too many vents created. Please wait before posting again.",
});

// ✅ Routes
router.post('/create', authMiddleware, ventLimiter, createVent);  // 🚀 Added Rate Limiting
router.get('/all', getVents); // 🚀 Added Pagination Support
router.post('/react', authMiddleware, reactToVent);
router.delete('/:ventId', authMiddleware, deleteVent);
router.get('/search', searchVents);
router.get('/feed', authMiddleware, getVentFeed);
router.post('/report', authMiddleware, reportVent);



module.exports = router;
