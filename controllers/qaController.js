const Question = require('../models/Question');
const ForumTopic = require('../models/ForumTopic');
const ExpertProfile = require('../models/ExpertProfile');
const Vote = require('../models/Vote');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * ✅ Get questions with filtering, sorting, and pagination
 */
const getQuestions = async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    sort = 'recent', 
    topic, 
    tag,
    emotion,
    solved,
    expert,
    search,
    user
  } = req.query;
  
  try {
    // Build the base query
    const query = { isDeleted: { $ne: true } };
    
    // Apply filters if provided
    if (topic) query.topics = topic;
    if (tag) query.tags = tag;
    if (emotion) query.emotionalContext = emotion;
    if (solved === 'true') query.isSolved = true;
    if (solved === 'false') query.isSolved = false;
    if (user) query.userId = user;
    if (expert === 'true') query['answers.isExpertAnswer'] = true;
    if (search) query.$text = { $search: search };
    
    // Determine sort order
    let sortOption = {};
    switch (sort) {
      case 'views':
        sortOption = { views: -1 };
        break;
      case 'popular':
        // For popular, we'll use an aggregation pipeline later
        sortOption = { createdAt: -1 }; // Default fallback
        break;
      case 'answers':
        // For answers, we'll use an aggregation pipeline later
        sortOption = { createdAt: -1 }; // Default fallback
        break;
      default: // 'recent' or any other value
        sortOption = { createdAt: -1 };
    }
    
    let questions;
    let total;
    
    // For complex sorts, use aggregation
    if (sort === 'popular' || sort === 'answers') {
      const aggregation = [
        { $match: query },
        {
          $addFields: {
            answerCount: { $size: { $ifNull: ["$answers", []] } },
            popularity: {
              $add: [
                { $multiply: [{ $size: { $ifNull: ["$answers", []] } }, 3] }, // Answers: 3 points each
                { $divide: ["$views", 5] }, // Views: 0.2 points each
                { $multiply: [{ $ifNull: ["$followersCount", 0] }, 2] } // Followers: 2 points each
              ]
            }
          }
        },
        {
          $sort: sort === 'answers' 
            ? { answerCount: -1, createdAt: -1 } 
            : { popularity: -1, createdAt: -1 }
        },
        { $skip: (Number(page) - 1) * Number(limit) },
        { $limit: Number(limit) }
      ];
      
      // Get total count
      const countPipeline = [
        { $match: query },
        { $count: 'total' }
      ];
      
      const countResult = await Question.aggregate(countPipeline);
      total = countResult.length > 0 ? countResult[0].total : 0;
      
      // Get paginated results
      questions = await Question.aggregate(aggregation);
      
      // Populate user information for non-anonymous questions
      const userIds = questions
        .filter(q => !q.isAnonymous)
        .map(q => q.userId);
      
      if (userIds.length > 0) {
        const users = await User.find({ _id: { $in: userIds } })
          .select('username profilePic')
          .lean();
        
        const userMap = {};
        users.forEach(user => {
          userMap[user._id.toString()] = user;
        });
        
        questions = questions.map(q => {
          return {
            ...q,
            user: q.isAnonymous 
              ? { username: 'Anonymous', profilePic: '' }
              : userMap[q.userId.toString()] || { username: 'Unknown', profilePic: '' }
          };
        });
      }
    } 
    // For simple sorts, use the standard find
    else {
      questions = await Question.find(query)
        .sort(sortOption)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean();
      
      total = await Question.countDocuments(query);
      
      // Populate user information for non-anonymous questions
      const userIds = questions
        .filter(q => !q.isAnonymous)
        .map(q => q.userId);
      
      if (userIds.length > 0) {
        const users = await User.find({ _id: { $in: userIds } })
          .select('username profilePic')
          .lean();
        
        const userMap = {};
        users.forEach(user => {
          userMap[user._id.toString()] = user;
        });
        
        questions = questions.map(q => {
          return {
            ...q,
            user: q.isAnonymous 
              ? { username: 'Anonymous', profilePic: '' }
              : userMap[q.userId.toString()] || { username: 'Unknown', profilePic: '' }
          };
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      questions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching questions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching questions',
      error: error.message
    });
  }
};

/**
 * ✅ Get a specific question by ID with its answers
 */
const getQuestionById = async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user?.userId; // Optional user ID for tracking votes
  
  try {
    // Find question and increment view count in one operation
    const question = await Question.findByIdAndUpdate(
      questionId,
      { $inc: { views: 1 } },
      { new: true } // Return updated document
    ).lean();
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Get author information
    let authorData = { username: 'Anonymous', profilePic: '' };
    if (!question.isAnonymous) {
      const author = await User.findById(question.userId)
        .select('username profilePic')
        .lean();
      
      if (author) {
        authorData = author;
      }
    }
    
    // Process answers
    const processedAnswers = [];
    if (question.answers && question.answers.length > 0) {
      // Get all user IDs from answers (non-anonymous only)
      const answerUserIds = question.answers
        .filter(a => !a.isAnonymous && !a.isDeleted)
        .map(a => a.userId);
      
      // Fetch user data
      const answerUsers = await User.find({ _id: { $in: answerUserIds } })
        .select('username profilePic')
        .lean();
      
      const userMap = {};
      answerUsers.forEach(user => {
        userMap[user._id.toString()] = user;
      });
      
      // Get expert profiles for expert answers
      const expertUserIds = question.answers
        .filter(a => a.isExpertAnswer)
        .map(a => a.userId);
      
      const expertProfiles = await ExpertProfile.find({ userId: { $in: expertUserIds } })
        .select('credentials specializations professionalTitle')
        .lean();
      
      const expertMap = {};
      expertProfiles.forEach(profile => {
        expertMap[profile.userId.toString()] = profile;
      });
      
      // Get user votes if logged in
      let userVotes = {};
      if (userId) {
        const votes = await Vote.find({
          userId,
          $or: [
            { questionId },
            { answerId: { $in: question.answers.map(a => a._id) } }
          ]
        }).lean();
        
        votes.forEach(vote => {
          if (vote.questionId && !vote.answerId) {
            userVotes.questionVote = vote.voteType;
          } else if (vote.answerId) {
            userVotes[vote.answerId.toString()] = vote.voteType;
          }
        });
      }
      
      // Process each answer
      for (const answer of question.answers) {
        if (answer.isDeleted) continue;
        
        // Get user data
        let userData = { username: 'Anonymous', profilePic: '' };
        if (!answer.isAnonymous) {
          userData = userMap[answer.userId.toString()] || { username: 'Unknown', profilePic: '' };
        }
        
        // Get expert data if applicable
        let expertData = null;
        if (answer.isExpertAnswer) {
          expertData = expertMap[answer.userId.toString()];
        }
        
        // Get user's vote on this answer
        const userVote = userId ? userVotes[answer._id.toString()] : null;
        
        processedAnswers.push({
          ...answer,
          user: userData,
          expertInfo: expertData,
          userVote
        });
      }
      
      // Sort answers: accepted first, then expert, then by votes, finally by recency
      processedAnswers.sort((a, b) => {
        // Accepted answer first
        if (a.isAccepted !== b.isAccepted) return b.isAccepted ? 1 : -1;
        
        // Expert answers next
        if (a.isExpertAnswer !== b.isExpertAnswer) return b.isExpertAnswer ? 1 : -1;
        
        // Sort by vote count
        const aScore = a.upvotes - a.downvotes;
        const bScore = b.upvotes - b.downvotes;
        if (aScore !== bScore) return bScore - aScore;
        
        // Finally by date (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
    
    // Add user's vote on the question
    const userQuestionVote = userId ? userVotes?.questionVote : null;
    
    // Prepare response
    const response = {
      ...question,
      user: authorData,
      answers: processedAnswers,
      userVote: userQuestionVote
    };
    
    return res.status(200).json({
      success: true,
      question: response
    });
    
  } catch (error) {
    console.error('❌ Error fetching question:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching question',
      error: error.message
    });
  }
};

/**
 * ✅ Create a new question
 */
const createQuestion = async (req, res) => {
  const userId = req.user.userId;
  const {
    title,
    content,
    topics = [],
    tags = [],
    emotionalContext = 'Neutral',
    isAnonymous = false
  } = req.body;
  
  // Validate required fields
  if (!title || !content) {
    return res.status(400).json({
      success: false,
      message: 'Title and content are required'
    });
  }
  
  try {
    // Create the question
    const question = new Question({
      title,
      content,
      userId,
      topics,
      tags,
      emotionalContext,
      isAnonymous
    });
    
    await question.save();
    
    // Increment question count for each topic
    if (topics && topics.length > 0) {
      await ForumTopic.updateMany(
        { _id: { $in: topics } },
        { $inc: { questionsCount: 1 } }
      );
    }
    
    return res.status(201).json({
      success: true,
      message: 'Question posted successfully',
      questionId: question._id
    });
    
  } catch (error) {
    console.error('❌ Error creating question:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating question',
      error: error.message
    });
  }
};

/**
 * ✅ Update an existing question
 */
const updateQuestion = async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user.userId;
  const {
    title,
    content,
    topics,
    tags,
    emotionalContext,
    isAnonymous
  } = req.body;
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Verify ownership
    if (question.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to edit this question'
      });
    }
    
    // Update fields if provided
    if (title !== undefined) question.title = title;
    if (content !== undefined) question.content = content;
    if (topics !== undefined) question.topics = topics;
    if (tags !== undefined) question.tags = tags;
    if (emotionalContext !== undefined) question.emotionalContext = emotionalContext;
    if (isAnonymous !== undefined) question.isAnonymous = isAnonymous;
    
    // Mark as edited
    question.isEdited = true;
    question.lastEditedAt = new Date();
    
    await question.save();
    
    return res.status(200).json({
      success: true,
      message: 'Question updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating question:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating question',
      error: error.message
    });
  }
};

/**
 * ✅ Delete a question
 */
const deleteQuestion = async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user.userId;
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Verify ownership
    if (question.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this question'
      });
    }
    
    // Soft delete
    question.isDeleted = true;
    await question.save();
    
    return res.status(200).json({
      success: true,
      message: 'Question deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting question:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting question',
      error: error.message
    });
  }
};

/**
 * ✅ Post an answer to a question
 */
const postAnswer = async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user.userId;
  const {
    content,
    isAnonymous = false
  } = req.body;
  
  // Validate input
  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Answer content is required'
    });
  }
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    if (question.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot answer a deleted question'
      });
    }
    
    // Check if user already answered
    const existingAnswer = question.answers.find(
      a => a.userId.toString() === userId && !a.isDeleted
    );
    
    if (existingAnswer) {
      return res.status(400).json({
        success: false,
        message: 'You have already answered this question'
      });
    }
    
    // Check if the user is an expert
    const expertProfile = await ExpertProfile.findOne({
      userId: userId,
      isVerified: true
    });
    
    // Create the answer
    const newAnswer = {
      userId,
      content,
      isAnonymous,
      isExpertAnswer: !!expertProfile,
      expertCredentials: expertProfile ? expertProfile.credentials : null,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date()
    };
    
    // Add to question
    question.answers.push(newAnswer);
    await question.save();
    
    // If expert, update their answer count
    if (expertProfile) {
      await ExpertProfile.updateOne(
        { userId },
        { $inc: { answerCount: 1 } }
      );
    }
    
    return res.status(201).json({
      success: true,
      message: 'Answer posted successfully',
      answerId: question.answers[question.answers.length - 1]._id
    });
    
  } catch (error) {
    console.error('❌ Error posting answer:', error);
    return res.status(500).json({
      success: false,
      message: 'Error posting answer',
      error: error.message
    });
  }
};

/**
 * ✅ Update an answer
 */
const updateAnswer = async (req, res) => {
  const { questionId, answerId } = req.params;
  const userId = req.user.userId;
  const {
    content,
    isAnonymous
  } = req.body;
  
  // Validate input
  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Answer content is required'
    });
  }
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Find the answer
    const answerIndex = question.answers.findIndex(
      a => a._id.toString() === answerId
    );
    
    if (answerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }
    
    const answer = question.answers[answerIndex];
    
    // Verify ownership
    if (answer.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to edit this answer'
      });
    }
    
    // Update fields
    answer.content = content;
    if (isAnonymous !== undefined) answer.isAnonymous = isAnonymous;
    
    // Mark as edited
    answer.isEdited = true;
    answer.lastEditedAt = new Date();
    
    await question.save();
    
    return res.status(200).json({
      success: true,
      message: 'Answer updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating answer:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating answer',
      error: error.message
    });
  }
};

/**
 * ✅ Delete an answer
 */
const deleteAnswer = async (req, res) => {
  const { questionId, answerId } = req.params;
  const userId = req.user.userId;
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Find the answer
    const answerIndex = question.answers.findIndex(
      a => a._id.toString() === answerId
    );
    
    if (answerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }
    
    const answer = question.answers[answerIndex];
    
    // Verify ownership
    if (answer.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this answer'
      });
    }
    
    // If this was the accepted answer, unmark the question as solved
    if (answer.isAccepted) {
      question.isSolved = false;
      question.solvedByAnswerId = null;
    }
    
    // Soft delete the answer
    answer.isDeleted = true;
    answer.content = '[This answer has been deleted]';
    
    await question.save();
    
    // If expert answer, decrement count
    if (answer.isExpertAnswer) {
      await ExpertProfile.updateOne(
        { userId },
        { $inc: { answerCount: -1 } }
      );
    }
    
    return res.status(200).json({
      success: true,
      message: 'Answer deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting answer:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting answer',
      error: error.message
    });
  }
};

/**
 * ✅ Vote on a question
 */
const voteOnQuestion = async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user.userId;
  const { voteType } = req.body;
  
  // Validate input
  if (!voteType || !['up', 'down'].includes(voteType)) {
    return res.status(400).json({
      success: false,
      message: 'Vote type must be "up" or "down"'
    });
  }
  
  try {
    // Find the question
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Check if user already voted
    const existingVote = await Vote.findOne({
      userId,
      questionId,
      answerId: null
    });
    
    // If already voted with same type, remove vote (toggle off)
    if (existingVote && existingVote.voteType === voteType) {
      await Vote.deleteOne({ _id: existingVote._id });
      
      // Update question vote count
      if (voteType === 'up') {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { upvotes: -1 } }
        );
      } else {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { downvotes: -1 } }
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Vote removed successfully'
      });
    }
    // If already voted with different type, change vote
    else if (existingVote && existingVote.voteType !== voteType) {
      existingVote.voteType = voteType;
      await existingVote.save();
      
      // Update question vote count
      if (voteType === 'up') {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { upvotes: 1, downvotes: -1 } }
        );
      } else {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { upvotes: -1, downvotes: 1 } }
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Vote changed successfully'
      });
    }
    // If not voted before, add new vote
    else {
      const newVote = new Vote({
        userId,
        questionId,
        answerId: null,
        voteType
      });
      
      await newVote.save();
      
      // Update question vote count
      if (voteType === 'up') {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { upvotes: 1 } }
        );
      } else {
        await Question.updateOne(
          { _id: questionId },
          { $inc: { downvotes: 1 } }
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Vote recorded successfully'
      });
    }
    
  } catch (error) {
    console.error('❌ Error voting on question:', error);
    return res.status(500).json({
      success: false,
      message: 'Error voting on question',
      error: error.message
    });
  }
};

/**
 * ✅ Vote on an answer
 */
const voteOnAnswer = async (req, res) => {
  const { questionId, answerId } = req.params;
  const userId = req.user.userId;
  const { voteType } = req.body;
  
  // Validate input
  if (!voteType || !['up', 'down'].includes(voteType)) {
    return res.status(400).json({
      success: false,
      message: 'Vote type must be "up" or "down"'
    });
  }
  
  try {
    // Find the question and answer
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Find the specific answer
    const answerIndex = question.answers.findIndex(
      a => a._id.toString() === answerId
    );
    
    if (answerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }
    
    const answer = question.answers[answerIndex];
    
    // Check if user already voted
    const existingVote = await Vote.findOne({
      userId,
      answerId
    });
    
    // If already voted with same type, remove vote (toggle off)
    if (existingVote && existingVote.voteType === voteType) {
      await Vote.deleteOne({ _id: existingVote._id });
      
      // Update answer vote count
      if (voteType === 'up') {
        answer.upvotes = Math.max(0, answer.upvotes - 1);
        
        // If expert answer, update helpfulness score
        if (answer.isExpertAnswer) {
          await ExpertProfile.updateOne(
            { userId: answer.userId },
            { $inc: { helpfulnessScore: -1 } }
          );
        }
      } else {
        answer.downvotes = Math.max(0, answer.downvotes - 1);
      }
      
      await question.save();
      
      return res.status(200).json({
        success: true,
        message: 'Vote removed successfully'
      });
    }
    // If already voted with different type, change vote
    else if (existingVote && existingVote.voteType !== voteType) {
      existingVote.voteType = voteType;
      await existingVote.save();
      
      // Update answer vote count
      if (voteType === 'up') {
        answer.upvotes += 1;
        answer.downvotes = Math.max(0, answer.downvotes - 1);
        
        // If expert answer, update helpfulness score
        if (answer.isExpertAnswer) {
          await ExpertProfile.updateOne(
            { userId: answer.userId },
            { $inc: { helpfulnessScore: 2 } } // +2 for changing from down to up
          );
        }
      } else {
        answer.upvotes = Math.max(0, answer.upvotes - 1);
        answer.downvotes += 1;
        
        // If expert answer, update helpfulness score
        if (answer.isExpertAnswer) {
          await ExpertProfile.updateOne(
            { userId: answer.userId },
            { $inc: { helpfulnessScore: -2 } } // -2 for changing from up to down
          );
        }
      }
      
      await question.save();
      
      return res.status(200).json({
        success: true,
        message: 'Vote changed successfully'
      });
    }
    // If not voted before, add new vote
    else {
      const newVote = new Vote({
        userId,
        questionId,
        answerId,
        voteType
      });
      
      await newVote.save();
      
      // Update answer vote count
      if (voteType === 'up') {
        answer.upvotes += 1;
        
        // If expert answer, update helpfulness score
        if (answer.isExpertAnswer) {
          await ExpertProfile.updateOne(
            { userId: answer.userId },
            { $inc: { helpfulnessScore: 1 } }
          );
        }
      } else {
        answer.downvotes += 1;
      }
      
      await question.save();
      
      return res.status(200).json({
        success: true,
        message: 'Vote recorded successfully'
      });
    }
    
  } catch (error) {
    console.error('❌ Error voting on answer:', error);
    return res.status(500).json({
      success: false,
      message: 'Error voting on answer',
      error: error.message
    });
  }
};

/**
 * ✅ Accept an answer as the solution
 */
const acceptAnswer = async (req, res) => {
    const { questionId, answerId } = req.params;
    const userId = req.user.userId;
    
    try {
      // Find the question
      const question = await Question.findById(questionId);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }
      
      // Verify ownership - only question author can accept answers
      if (question.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the question author can accept an answer'
        });
      }
      
      // Find the specific answer
      const answerIndex = question.answers.findIndex(
        a => a._id.toString() === answerId
      );
      
      if (answerIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Answer not found'
        });
      }
      
      // If already has an accepted answer, unmark it
      const previousAcceptedIndex = question.answers.findIndex(a => a.isAccepted);
      if (previousAcceptedIndex !== -1) {
        question.answers[previousAcceptedIndex].isAccepted = false;
      }
      
      // Mark the new answer as accepted
      question.answers[answerIndex].isAccepted = true;
      question.isSolved = true;
      question.solvedByAnswerId = question.answers[answerIndex]._id;
      
      await question.save();
      
      // If expert answer, update helpfulness score
      if (question.answers[answerIndex].isExpertAnswer) {
        await ExpertProfile.updateOne(
          { userId: question.answers[answerIndex].userId },
          { $inc: { helpfulnessScore: 5 } } // Bonus for accepted answer
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Answer accepted as solution'
      });
      
    } catch (error) {
      console.error('❌ Error accepting answer:', error);
      return res.status(500).json({
        success: false,
        message: 'Error accepting answer',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Unaccept a previously accepted answer
   */
  const unacceptAnswer = async (req, res) => {
    const { questionId, answerId } = req.params;
    const userId = req.user.userId;
    
    try {
      // Find the question
      const question = await Question.findById(questionId);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }
      
      // Verify ownership - only question author can unaccept answers
      if (question.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the question author can unaccept an answer'
        });
      }
      
      // Find the specific answer
      const answerIndex = question.answers.findIndex(
        a => a._id.toString() === answerId
      );
      
      if (answerIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Answer not found'
        });
      }
      
      // Check if this answer is actually the accepted one
      if (!question.answers[answerIndex].isAccepted) {
        return res.status(400).json({
          success: false,
          message: 'This answer is not currently accepted'
        });
      }
      
      // Unmark the answer
      question.answers[answerIndex].isAccepted = false;
      question.isSolved = false;
      question.solvedByAnswerId = null;
      
      await question.save();
      
      // If expert answer, update helpfulness score
      if (question.answers[answerIndex].isExpertAnswer) {
        await ExpertProfile.updateOne(
          { userId: question.answers[answerIndex].userId },
          { $inc: { helpfulnessScore: -5 } } // Remove bonus for accepted answer
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Answer no longer marked as solution'
      });
      
    } catch (error) {
      console.error('❌ Error unaccepting answer:', error);
      return res.status(500).json({
        success: false,
        message: 'Error unaccepting answer',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Follow a question to receive updates
   */
  const followQuestion = async (req, res) => {
    const { questionId } = req.params;
    const userId = req.user.userId;
    
    try {
      // Find the question
      const question = await Question.findById(questionId);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }
      
      // Check if already following
      const isAlreadyFollowing = question.followers.some(
        followerId => followerId.toString() === userId
      );
      
      if (isAlreadyFollowing) {
        return res.status(400).json({
          success: false,
          message: 'You are already following this question'
        });
      }
      
      // Add to followers
      question.followers.push(userId);
      question.followersCount = question.followers.length;
      
      await question.save();
      
      return res.status(200).json({
        success: true,
        message: 'Now following this question'
      });
      
    } catch (error) {
      console.error('❌ Error following question:', error);
      return res.status(500).json({
        success: false,
        message: 'Error following question',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Unfollow a question
   */
  const unfollowQuestion = async (req, res) => {
    const { questionId } = req.params;
    const userId = req.user.userId;
    
    try {
      // Find the question
      const question = await Question.findById(questionId);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }
      
      // Check if actually following
      const followerIndex = question.followers.findIndex(
        followerId => followerId.toString() === userId
      );
      
      if (followerIndex === -1) {
        return res.status(400).json({
          success: false,
          message: 'You are not following this question'
        });
      }
      
      // Remove from followers
      question.followers.splice(followerIndex, 1);
      question.followersCount = question.followers.length;
      
      await question.save();
      
      return res.status(200).json({
        success: true,
        message: 'No longer following this question'
      });
      
    } catch (error) {
      console.error('❌ Error unfollowing question:', error);
      return res.status(500).json({
        success: false,
        message: 'Error unfollowing question',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Get forum topics with pagination and filters
   */
  const getForumTopics = async (req, res) => {
    const { page = 1, limit = 20, parentTopic, search } = req.query;
    
    try {
      // Build query
      const query = { isActive: true };
      
      if (parentTopic) {
        query.parentTopic = parentTopic;
        query.isSubTopic = true;
      } else {
        query.isSubTopic = false; // Get only parent topics if no parent specified
      }
      
      if (search) {
        query.$text = { $search: search };
      }
      
      // Get topics with pagination
      const topics = await ForumTopic.find(query)
        .sort({ sortOrder: 1, questionsCount: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('subTopics', 'name slug questionsCount')
        .lean();
      
      // Get total count
      const total = await ForumTopic.countDocuments(query);
      
      return res.status(200).json({
        success: true,
        topics,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      });
      
    } catch (error) {
      console.error('❌ Error fetching forum topics:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching forum topics',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Get a specific forum topic with its questions
   */
  const getForumTopic = async (req, res) => {
    const { topicId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;
    
    try {
      // Find the topic
      const topic = await ForumTopic.findById(topicId)
        .populate('subTopics', 'name slug questionsCount')
        .populate('parentTopic', 'name slug')
        .populate('relatedTopics', 'name slug')
        .lean();
      
      if (!topic) {
        return res.status(404).json({
          success: false,
          message: 'Topic not found'
        });
      }
      
      // Get questions for this topic
      let sortOption = {};
      switch (sort) {
        case 'views':
          sortOption = { views: -1 };
          break;
        case 'popular':
          // Popularity would require additional calculation
          sortOption = { views: -1, createdAt: -1 };
          break;
        default: // 'recent' or any other value
          sortOption = { createdAt: -1 };
      }
      
      const questions = await Question.find({
        topics: topicId,
        isDeleted: { $ne: true }
      })
        .sort(sortOption)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('userId', 'username profilePic')
        .lean();
      
      // Get total question count
      const totalQuestions = await Question.countDocuments({
        topics: topicId,
        isDeleted: { $ne: true }
      });
      
      // Process questions to handle anonymous ones
      const processedQuestions = questions.map(q => {
        return {
          ...q,
          user: q.isAnonymous 
            ? { username: 'Anonymous', profilePic: '' }
            : q.userId || { username: 'Unknown', profilePic: '' }
        };
      });
      
      return res.status(200).json({
        success: true,
        topic,
        questions: processedQuestions,
        pagination: {
          total: totalQuestions,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(totalQuestions / Number(limit))
        }
      });
      
    } catch (error) {
      console.error('❌ Error fetching forum topic:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching forum topic',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Get expert profiles
   */
  const getExperts = async (req, res) => {
    const { page = 1, limit = 10, specialization, topic, sort = 'helpful' } = req.query;
    
    try {
      // Build query
      const query = { 
        isVerified: true,
        publicProfile: true
      };
      
      if (specialization) {
        query.specializations = specialization;
      }
      
      if (topic) {
        query.topicsOfExpertise = topic;
      }
      
      // Determine sort order
      let sortOption = {};
      switch (sort) {
        case 'helpful':
          sortOption = { helpfulnessScore: -1 };
          break;
        case 'recent':
          sortOption = { answerCount: -1 };
          break;
        case 'experience':
          sortOption = { yearsOfExperience: -1 };
          break;
        default:
          sortOption = { helpfulnessScore: -1 };
      }
      
      // Get experts with pagination
      const experts = await ExpertProfile.find(query)
        .sort(sortOption)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('userId', 'username profilePic')
        .populate('topicsOfExpertise', 'name slug')
        .lean();
      
      // Get total count
      const total = await ExpertProfile.countDocuments(query);
      
      return res.status(200).json({
        success: true,
        experts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      });
      
    } catch (error) {
      console.error('❌ Error fetching experts:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching experts',
        error: error.message
      });
    }
  };
  
  /**
   * ✅ Get a specific expert profile
   */
  const getExpertProfile = async (req, res) => {
    const { expertId } = req.params;
    
    try {
      // Find the expert
      const expert = await ExpertProfile.findOne({
        userId: expertId,
        isVerified: true,
        publicProfile: true
      })
        .populate('userId', 'username profilePic')
        .populate('topicsOfExpertise', 'name slug')
        .lean();
      
      if (!expert) {
        return res.status(404).json({
          success: false,
          message: 'Expert profile not found'
        });
      }
      
      // Get recent answers by this expert
      const recentAnswers = await Question.aggregate([
        { $match: { 'answers.userId': mongoose.Types.ObjectId(expertId), 'answers.isExpertAnswer': true } },
        { $unwind: '$answers' },
        { $match: { 'answers.userId': mongoose.Types.ObjectId(expertId), 'answers.isExpertAnswer': true } },
        { $sort: { 'answers.createdAt': -1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            title: 1,
            answer: '$answers',
            createdAt: '$answers.createdAt'
          }
        }
      ]);
      
      return res.status(200).json({
        success: true,
        expert,
        recentAnswers
      });
      
    } catch (error) {
      console.error('❌ Error fetching expert profile:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching expert profile',
        error: error.message
      });
    }
  };
  
  module.exports = {
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
  };