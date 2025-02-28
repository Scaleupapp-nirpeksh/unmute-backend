const express = require('express');
const { requestOTP, verifyUserOTP, changeUsername,updateUserDetails, getUserDetails } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyUserOTP);
router.put('/change-username', authMiddleware, changeUsername);
router.put('/update-details', authMiddleware, updateUserDetails);
router.get('/user/:userId', authMiddleware, getUserDetails);

module.exports = router;
