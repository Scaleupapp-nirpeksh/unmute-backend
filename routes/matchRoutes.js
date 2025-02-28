const express = require('express');
const { 
    getMatchSuggestions, 
    getRecommendedMatches,
    getMatchDetails,
    acceptMatch, 
    rejectMatch, 
    unmatchUser, 
    refreshMatches,
    getPendingMatches,  // 🔥 NEW
    getMatchHistory     // 🔥 NEW
} = require('../controllers/matchController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ Get direct match suggestions
router.get('/suggestions', authMiddleware, getMatchSuggestions);

// ✅ Get recommended matches
router.get('/recommended', authMiddleware, getRecommendedMatches);

// ✅ Get match details
router.get('/details', authMiddleware, getMatchDetails);

// ✅ Accept / Reject Matches
router.post('/accept', authMiddleware, acceptMatch);
router.post('/reject', authMiddleware, rejectMatch);

// ✅ Unmatch a user
router.post('/unmatch', authMiddleware, unmatchUser);

// ✅ Refresh matches manually
router.post('/refresh', authMiddleware, refreshMatches);

// ✅ View pending matches (received & sent)
router.get('/pending', authMiddleware, getPendingMatches);  // 🔥 NEW

// ✅ View match history
router.get('/history', authMiddleware, getMatchHistory);  // 🔥 NEW

module.exports = router;
