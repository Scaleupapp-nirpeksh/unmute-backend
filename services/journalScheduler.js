//services/journalScheduler.js

const cron = require('node-cron');
const { batchAnalyzeJournalEntries } = require('./journalAnalysisService');
const { JournalStreak, JournalEntry } = require('../models/Journal');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * ✅ Run batch analysis of journal entries
 * - Processes entries that haven't been analyzed yet
 */
const runBatchAnalysis = async () => {
  console.log('🔍 Running batch journal analysis...');
  try {
    const result = await batchAnalyzeJournalEntries(20); // Process 20 entries at a time
    console.log(`✅ Batch analysis complete: ${result.successful} successful, ${result.failed} failed`);
  } catch (error) {
    console.error('❌ Error in batch journal analysis job:', error);
  }
};

/**
 * ✅ Check for broken streaks
 * - Finds users who missed journaling yesterday and resets their streak
 */
const checkForBrokenStreaks = async () => {
  console.log('🔍 Checking for broken journal streaks...');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const twoDaysAgo = new Date(yesterday);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
    
    // Find users with active streaks who didn't journal yesterday
    const streaksToReset = await JournalStreak.find({
      currentStreak: { $gt: 0 },
      lastEntryDate: { $lt: yesterday, $gte: twoDaysAgo }
    });
    
    console.log(`Found ${streaksToReset.length} broken streaks to reset`);
    
    // Reset streaks and notify users
    for (const streak of streaksToReset) {
      // Reset the streak
      streak.currentStreak = 0;
      await streak.save();
      
      // Create notification
      await Notification.create({
        userId: streak.userId,
        type: 'streak_broken',
        message: 'Your journaling streak was reset. Start a new streak today!',
        isRead: false
      });
    }
    
    console.log('✅ Streak check complete');
  } catch (error) {
    console.error('❌ Error checking broken streaks:', error);
  }
};

/**
 * ✅ Generate and send journal reminders
 * - Sends notifications to users who haven't journaled today
 */
const sendJournalReminders = async () => {
  console.log('📩 Sending journal reminders...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find users who have journaled before but not today
    const activeUsers = await JournalEntry.distinct('userId');
    
    // Check which users haven't journaled today
    const reminderCandidates = [];
    for (const userId of activeUsers) {
      const todayEntry = await JournalEntry.findOne({
        userId,
        createdAt: { $gte: today }
      });
      
      if (!todayEntry) {
        reminderCandidates.push(userId);
      }
    }
    
    console.log(`Found ${reminderCandidates.length} users to remind`);
    
    // Create reminder notifications
    for (const userId of reminderCandidates) {
      await Notification.create({
        userId,
        type: 'journal_reminder',
        message: 'Take a moment to journal today. How are you feeling?',
        isRead: false
      });
    }
    
    console.log('✅ Reminders sent successfully');
  } catch (error) {
    console.error('❌ Error sending journal reminders:', error);
  }
};

/**
 * ✅ Generate weekly insights for users
 * - Creates a summary of emotional patterns
 */
const generateWeeklyInsights = async () => {
  console.log('📊 Generating weekly journal insights...');
  try {
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // Find users who have journaled at least 3 times in the past week
    const activeUsers = await JournalEntry.aggregate([
      { 
        $match: { 
          createdAt: { $gte: oneWeekAgo } 
        } 
      },
      { 
        $group: { 
          _id: '$userId', 
          count: { $sum: 1 },
          emotions: { $push: '$emotions' }
        } 
      },
      { 
        $match: { 
          count: { $gte: 3 } 
        } 
      }
    ]);
    
    console.log(`Found ${activeUsers.length} users for weekly insights`);
    
    // Generate insights for each user
    for (const user of activeUsers) {
      // Flatten emotions array
      const allEmotions = user.emotions.flat();
      
      // Count occurrences of each emotion
      const emotionCounts = {};
      allEmotions.forEach(emotion => {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      });
      
      // Find dominant emotion
      let dominantEmotion = null;
      let maxCount = 0;
      for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
          dominantEmotion = emotion;
          maxCount = count;
        }
      }
      
      // Create notification with insight
      if (dominantEmotion) {
        await Notification.create({
          userId: user._id,
          type: 'journal_insight',
          message: `This week, you journaled ${user.count} times. Your most frequent emotion was "${dominantEmotion}". Check your journal insights for more details.`,
          isRead: false
        });
      }
    }
    
    console.log('✅ Weekly insights generated successfully');
  } catch (error) {
    console.error('❌ Error generating weekly insights:', error);
  }
};

// Schedule batch analysis to run every 2 hours
cron.schedule('0 */2 * * *', runBatchAnalysis);

// Schedule streak checking to run every day at 3 AM
cron.schedule('0 3 * * *', checkForBrokenStreaks);

// Schedule journal reminders at 8 PM every day
cron.schedule('0 20 * * *', sendJournalReminders);

// Schedule weekly insights on Sunday at 9 AM
cron.schedule('0 9 * * 0', generateWeeklyInsights);

// Run once on startup
setTimeout(() => {
  runBatchAnalysis();
}, 5000);

console.log('✅ Journal scheduling service initialized');

module.exports = {
  runBatchAnalysis,
  checkForBrokenStreaks,
  sendJournalReminders,
  generateWeeklyInsights
};