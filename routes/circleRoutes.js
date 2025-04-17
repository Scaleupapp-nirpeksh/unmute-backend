const express = require('express');
const {
  getPublicCircles,
  getUserCircles,
  getCircleDetails,
  createCircle,
  updateCircle,
  joinCircle,
  leaveCircle,
  handleJoinRequest,
  getJoinRequests,
  changeMemberRole,
  addWeeklyTopic,
  sendMessage,
  getMessages,
  reactToMessage,
  deleteMessage,
  getCategories
} = require('../controllers/circleController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Apply rate limiting for circle operations
const rateLimit = require('express-rate-limit');



// ✅ Circle discovery and browsing
router.get('/public', authMiddleware, getPublicCircles);
router.get('/my-circles', authMiddleware, getUserCircles);
router.get('/categories', authMiddleware, getCategories);

// ✅ Individual circle operations
router.post('/', authMiddleware, createCircle);
router.get('/:circleId', authMiddleware, getCircleDetails);
router.put('/:circleId', authMiddleware, updateCircle);

// ✅ Circle membership operations
router.post('/:circleId/join', authMiddleware, joinCircle);
router.post('/:circleId/leave', authMiddleware, leaveCircle);
router.get('/:circleId/join-requests', authMiddleware, getJoinRequests);
router.post('/:circleId/join-requests/:requestId', authMiddleware, handleJoinRequest);
router.post('/:circleId/members/:memberId/role', authMiddleware, changeMemberRole);

// ✅ Circle content operations
router.post('/:circleId/topics', authMiddleware, addWeeklyTopic);
router.post('/:circleId/messages', authMiddleware, sendMessage);
router.get('/:circleId/messages', authMiddleware, getMessages);
router.post('/:circleId/messages/:messageId/react', authMiddleware, reactToMessage);
router.delete('/:circleId/messages/:messageId', authMiddleware, deleteMessage);

module.exports = router;