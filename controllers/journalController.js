//journalController.js

const { JournalEntry, JournalPrompt, JournalStreak } = require('../models/Journal');
const User = require('../models/User');
const { analyzeJournalEntry } = require('../services/journalAnalysisService');
const { updateMatchesForUser } = require('../services/matchScoringService');

/**
 * ✅ Create a new journal entry
 * - Saves entry to DB
 * - Updates user's journaling streak
 * - Optionally analyzes content with AI
 */
const createJournalEntry = async (req, res) => {
  const userId = req.user.userId;
  const { title, content, promptId, emotions, tags, isPrivate, useForMatching, visibility } = req.body;

  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Title and content are required' });
  }

  try {
    // Create the journal entry
    const journalEntry = new JournalEntry({
      userId,
      title,
      content,
      promptId: promptId || null,
      emotions: emotions || [],
      tags: tags || [],
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      useForMatching: useForMatching !== undefined ? useForMatching : false,
      visibility: visibility || 'private'
    });

    await journalEntry.save();

    // Update user's journaling streak
    await updateJournalingStreak(userId);

    // If AI analysis is requested, perform it asynchronously
    if (req.body.performAnalysis) {
      // Don't await this to keep response time fast
      analyzeJournalEntry(journalEntry._id).catch(err => 
        console.error(`❌ Error analyzing journal entry ${journalEntry._id}:`, err)
      );
    }

    // If entry should be used for matching, update matches
    if (useForMatching) {
      // Don't await this to keep response time fast
      updateMatchesForUser(userId).catch(err =>
        console.error(`❌ Error updating matches for user ${userId}:`, err)
      );
    }

    return res.status(201).json({ 
      success: true, 
      message: 'Journal entry created successfully',
      journalEntry
    });

  } catch (error) {
    console.error('❌ Error creating journal entry:', error);
    return res.status(500).json({ success: false, message: 'Error creating journal entry', error });
  }
};

/**
 * ✅ Get all journal entries for a user
 * - Sorted by date (newest first)
 * - With pagination
 */
const getJournalEntries = async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 10, startDate, endDate, emotions, tags, searchQuery } = req.query;
  const skip = (page - 1) * limit;

  try {
    // Build query filters
    let query = { userId };
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Emotions filter
    if (emotions) {
      const emotionsList = emotions.split(',');
      query.emotions = { $in: emotionsList };
    }
    
    // Tags filter
    if (tags) {
      const tagsList = tags.split(',');
      query.tags = { $in: tagsList };
    }
    
    // Text search
    if (searchQuery) {
      query.$text = { $search: searchQuery };
    }

    // Execute query with pagination
    const journalEntries = await JournalEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('promptId', 'title text category');
    
    // Get total count for pagination
    const total = await JournalEntry.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      journalEntries,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching journal entries:', error);
    return res.status(500).json({ success: false, message: 'Error fetching journal entries', error });
  }
};

/**
 * ✅ Get a single journal entry
 */
const getJournalEntry = async (req, res) => {
  const userId = req.user.userId;
  const { entryId } = req.params;

  try {
    const journalEntry = await JournalEntry.findOne({ _id: entryId, userId })
      .populate('promptId', 'title text category');
    
    if (!journalEntry) {
      return res.status(404).json({ success: false, message: 'Journal entry not found' });
    }
    
    return res.status(200).json({ success: true, journalEntry });

  } catch (error) {
    console.error('❌ Error fetching journal entry:', error);
    return res.status(500).json({ success: false, message: 'Error fetching journal entry', error });
  }
};

/**
 * ✅ Update a journal entry
 */
const updateJournalEntry = async (req, res) => {
  const userId = req.user.userId;
  const { entryId } = req.params;
  const { title, content, emotions, tags, isPrivate, useForMatching, visibility } = req.body;

  try {
    const journalEntry = await JournalEntry.findOne({ _id: entryId, userId });
    
    if (!journalEntry) {
      return res.status(404).json({ success: false, message: 'Journal entry not found' });
    }
    
    // Update fields if provided
    if (title) journalEntry.title = title;
    if (content) journalEntry.content = content;
    if (emotions) journalEntry.emotions = emotions;
    if (tags) journalEntry.tags = tags;
    if (isPrivate !== undefined) journalEntry.isPrivate = isPrivate;
    if (useForMatching !== undefined) journalEntry.useForMatching = useForMatching;
    if (visibility) journalEntry.visibility = visibility;
    
    await journalEntry.save();
    
    // If AI analysis is requested, perform it
    if (req.body.performAnalysis) {
      analyzeJournalEntry(journalEntry._id).catch(err => 
        console.error(`❌ Error analyzing journal entry ${journalEntry._id}:`, err)
      );
    }
    
    // If matching preference changed, update matches
    if (useForMatching !== undefined && useForMatching !== journalEntry.useForMatching) {
      updateMatchesForUser(userId).catch(err =>
        console.error(`❌ Error updating matches for user ${userId}:`, err)
      );
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Journal entry updated successfully',
      journalEntry
    });

  } catch (error) {
    console.error('❌ Error updating journal entry:', error);
    return res.status(500).json({ success: false, message: 'Error updating journal entry', error });
  }
};

/**
 * ✅ Delete a journal entry
 */
const deleteJournalEntry = async (req, res) => {
  const userId = req.user.userId;
  const { entryId } = req.params;

  try {
    const result = await JournalEntry.deleteOne({ _id: entryId, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Journal entry not found' });
    }
    
    return res.status(200).json({ success: true, message: 'Journal entry deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting journal entry:', error);
    return res.status(500).json({ success: false, message: 'Error deleting journal entry', error });
  }
};

/**
 * ✅ Get journal prompts
 * - Filter by category, difficulty, emotions
 */
const getJournalPrompts = async (req, res) => {
  const { category, difficultyLevel, targetEmotions, limit = 10 } = req.query;

  try {
    let query = { isActive: true };
    
    if (category) query.category = category;
    if (difficultyLevel) query.difficultyLevel = Number(difficultyLevel);
    if (targetEmotions) {
      const emotionsList = targetEmotions.split(',');
      query.targetEmotions = { $in: emotionsList };
    }
    
    // Get random prompts matching criteria
    const prompts = await JournalPrompt.aggregate([
      { $match: query },
      { $sample: { size: Number(limit) } }
    ]);
    
    return res.status(200).json({ success: true, prompts });

  } catch (error) {
    console.error('❌ Error fetching journal prompts:', error);
    return res.status(500).json({ success: false, message: 'Error fetching journal prompts', error });
  }
};

/**
 * ✅ Get user's journal streak data
 */
const getJournalStreak = async (req, res) => {
  const userId = req.user.userId;

  try {
    let streak = await JournalStreak.findOne({ userId });
    
    if (!streak) {
      streak = new JournalStreak({ userId });
      await streak.save();
    }
    
    // Get additional stats
    const totalEntries = await JournalEntry.countDocuments({ userId });
    const entriesByEmotion = await JournalEntry.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      { $unwind: "$emotions" },
      { $group: { _id: "$emotions", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    return res.status(200).json({ 
      success: true, 
      streak: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastEntryDate: streak.lastEntryDate,
        totalEntries,
        entriesByEmotion,
        achievements: streak.achievements.filter(a => a.seen)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching journal streak:', error);
    return res.status(500).json({ success: false, message: 'Error fetching journal streak', error });
  }
};

/**
 * ✅ Mark achievements as seen
 */
const markAchievementsSeen = async (req, res) => {
  const userId = req.user.userId;

  try {
    await JournalStreak.updateOne(
      { userId },
      { $set: { "achievements.$[elem].seen": true } },
      { arrayFilters: [{ "elem.seen": false }] }
    );
    
    return res.status(200).json({ success: true, message: 'Achievements marked as seen' });

  } catch (error) {
    console.error('❌ Error marking achievements as seen:', error);
    return res.status(500).json({ success: false, message: 'Error marking achievements as seen', error });
  }
};

/**
 * ✅ Helper: Update user's journaling streak
 * - Called internally when creating a journal entry
 */
const updateJournalingStreak = async (userId) => {
  try {
    let streak = await JournalStreak.findOne({ userId });
    
    if (!streak) {
      streak = new JournalStreak({ userId });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastEntryDate = streak.lastEntryDate ? new Date(streak.lastEntryDate) : null;
    
    if (lastEntryDate) {
      lastEntryDate.setHours(0, 0, 0, 0);
      
      // Check if already journaled today
      if (lastEntryDate.getTime() === today.getTime()) {
        // Already journaled today, just update the entry count
        const todayIndex = streak.streakHistory.findIndex(
          h => new Date(h.date).setHours(0, 0, 0, 0) === today.getTime()
        );
        
        if (todayIndex >= 0) {
          streak.streakHistory[todayIndex].entriesCount += 1;
        } else {
          streak.streakHistory.push({ date: today, entriesCount: 1 });
        }
      }
      // Check if journaled yesterday (maintaining streak)
      else if (lastEntryDate.getTime() === yesterday.getTime()) {
        streak.currentStreak += 1;
        if (streak.currentStreak > streak.longestStreak) {
          streak.longestStreak = streak.currentStreak;
        }
        streak.streakHistory.push({ date: today, entriesCount: 1 });
        
        // Check for achievements
        checkAndAddAchievements(streak);
      }
      // Streak broken
      else if (lastEntryDate.getTime() < yesterday.getTime()) {
        streak.currentStreak = 1; // Reset streak
        streak.streakHistory.push({ date: today, entriesCount: 1 });
      }
    } else {
      // First entry ever
      streak.currentStreak = 1;
      streak.longestStreak = 1;
      streak.streakHistory = [{ date: today, entriesCount: 1 }];
      
      // First entry achievement
      streak.achievements.push({
        type: 'first_entry',
        earnedAt: new Date(),
        seen: false
      });
    }
    
    streak.lastEntryDate = new Date();
    await streak.save();
    
    return streak;
  } catch (error) {
    console.error('❌ Error updating journal streak:', error);
    throw error;
  }
};

/**
 * ✅ Helper: Check and add streak achievements
 */
const checkAndAddAchievements = (streak) => {
  // 3-day streak achievement
  if (streak.currentStreak === 3 && !streak.achievements.some(a => a.type === 'three_day_streak')) {
    streak.achievements.push({
      type: 'three_day_streak',
      earnedAt: new Date(),
      seen: false
    });
  }
  
  // 7-day streak achievement
  if (streak.currentStreak === 7 && !streak.achievements.some(a => a.type === 'week_streak')) {
    streak.achievements.push({
      type: 'week_streak',
      earnedAt: new Date(),
      seen: false
    });
  }
  
  // 30-day streak achievement
  if (streak.currentStreak === 30 && !streak.achievements.some(a => a.type === 'month_streak')) {
    streak.achievements.push({
      type: 'month_streak',
      earnedAt: new Date(),
      seen: false
    });
  }
};

module.exports = {
  createJournalEntry,
  getJournalEntries,
  getJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getJournalPrompts,
  getJournalStreak,
  markAchievementsSeen
};