const express = require('express');
const {
  getNotificationSettings,
  updateGeneralSettings,
  updateCircleSettings,
  updateSpecificCircleSettings,
  removeCircleSpecificSettings,
  muteAllNotifications,
  unmuteAllNotifications
} = require('../controllers/notiifcationSettingsController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Get all notification settings
router.get('/', authMiddleware, getNotificationSettings);

// Update general notification settings
router.put('/general', authMiddleware, updateGeneralSettings);

// Update circle notification settings
router.put('/circles', authMiddleware, updateCircleSettings);

// Update settings for a specific circle
router.put('/circles/:circleId', authMiddleware, updateSpecificCircleSettings);

// Remove settings for a specific circle
router.delete('/circles/:circleId', authMiddleware, removeCircleSpecificSettings);

// Mute all notifications for a specified duration
router.post('/mute', authMiddleware, muteAllNotifications);

// Unmute all notifications
router.post('/unmute', authMiddleware, unmuteAllNotifications);

module.exports = router;