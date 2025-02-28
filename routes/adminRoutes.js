const express = require('express');
const { 
    getReports, 
    reviewReport, 
    getFlaggedVents, 
    clearFlaggedVent 
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ Get all reports (For Admin Review)
router.get('/reports', authMiddleware, getReports);

// ✅ Review & act on a report
router.post('/review', authMiddleware, reviewReport);

// ✅ Get flagged vents
router.get('/flagged', authMiddleware, getFlaggedVents);

// ✅ Unflag a vent
router.post('/unflag', authMiddleware, clearFlaggedVent);

module.exports = router;
