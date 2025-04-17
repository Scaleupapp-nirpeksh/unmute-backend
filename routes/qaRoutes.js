const express = require('express');
const {
  // Question endpoints
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  followQuestion,
  unfollowQuestion,
  
  // Answer endpoints
  postAnswer,
  updateAnswer,
  deleteAnswer,
  acceptAnswer,
  unacceptAnswer,
  
  // Voting endpoints
  voteOnQuestion,
  voteOnAnswer,
  
  // Forum topic endpoints
  getForumTopics,
  getForumTopic,
  
  // Expert endpoints
  getExperts,
  getExpertProfile
} = require('../controllers/qaController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Apply rate limiting for questions and answers
const rateLimit = require('express-rate-limit');

// Limit new questions
const questionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 questions per hour
  message: "⚠️ You've reached the limit of new questions. Please try again later."
});

// Limit new answers
const answerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 answers per hour
  message: "⚠️ You've reached the limit of new answers. Please try again later."
});

// Limit voting
const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 votes per 15 minutes
  message: "⚠️ You're voting too frequently. Please try again later."
});

// ✅ Question routes
router.get('/questions', getQuestions);
router.get('/questions/:questionId', getQuestionById);
router.post('/questions', authMiddleware, questionLimiter, createQuestion);
router.put('/questions/:questionId', authMiddleware, updateQuestion);
router.delete('/questions/:questionId', authMiddleware, deleteQuestion);
router.post('/questions/:questionId/follow', authMiddleware, followQuestion);
router.post('/questions/:questionId/unfollow', authMiddleware, unfollowQuestion);

// ✅ Answer routes
router.post('/questions/:questionId/answers', authMiddleware, answerLimiter, postAnswer);
router.put('/questions/:questionId/answers/:answerId', authMiddleware, updateAnswer);
router.delete('/questions/:questionId/answers/:answerId', authMiddleware, deleteAnswer);
router.post('/questions/:questionId/answers/:answerId/accept', authMiddleware, acceptAnswer);
router.post('/questions/:questionId/answers/:answerId/unaccept', authMiddleware, unacceptAnswer);

// ✅ Voting routes
router.post('/questions/:questionId/vote', authMiddleware, voteLimiter, voteOnQuestion);
router.post('/questions/:questionId/answers/:answerId/vote', authMiddleware, voteLimiter, voteOnAnswer);

// ✅ Forum topic routes
router.get('/topics', getForumTopics);
router.get('/topics/:topicId', getForumTopic);

// ✅ Expert routes
router.get('/experts', getExperts);
router.get('/experts/:expertId', getExpertProfile);

module.exports = router;