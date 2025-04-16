const mongoose = require('mongoose');

// Create a proper schema for suggested resources
const SuggestedResourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true },
  id: { type: String, required: true }
}, { _id: false }); // Don't create _id for embedded docs

const JournalEntrySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  title: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  promptId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'JournalPrompt',
    default: null
  },
  emotions: [{ 
    type: String,
    enum: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral', 'Burnout', 'Peaceful', 'Excited', 'Grateful', 'Overwhelmed', 'Hopeful', 'Disappointed']
  }],
  tags: [{ 
    type: String 
  }],
  aiAnalysis: {
    dominantEmotion: { type: String },
    emotionalIntensity: { type: Number }, // Scale 1-10
    topics: [{ type: String }],
    // Fix: Changed from array of strings to array of objects with a defined schema
    suggestedResources: [SuggestedResourceSchema], 
    insightSummary: { type: String }
  },
  isPrivate: { 
    type: Boolean, 
    default: true 
  },
  useForMatching: {
    type: Boolean,
    default: false
  },
  visibility: {
    type: String,
    enum: ['private', 'matches', 'public'],
    default: 'private'
  }
}, { timestamps: true });

// Create text indexes for search
JournalEntrySchema.index({ title: 'text', content: 'text', tags: 'text' });
// Index for time-based queries
JournalEntrySchema.index({ createdAt: -1 });
// Compound index for user's entries by date
JournalEntrySchema.index({ userId: 1, createdAt: -1 });

const JournalPromptSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  text: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true,
    index: true
  },
  tags: [{ 
    type: String,
    index: true
  }],
  difficultyLevel: { 
    type: Number, 
    min: 1,
    max: 5,
    default: 1 
  },
  targetEmotions: [{ 
    type: String,
    enum: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral', 'Burnout', 'Peaceful', 'Excited', 'Grateful', 'Overwhelmed', 'Hopeful', 'Disappointed']
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Index for category-based queries
JournalPromptSchema.index({ category: 1, difficultyLevel: 1 });
// Index for emotion-based queries
JournalPromptSchema.index({ targetEmotions: 1 });

const JournalStreakSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastEntryDate: {
    type: Date
  },
  streakHistory: [{
    date: Date,
    entriesCount: Number
  }],
  achievements: [{
    type: {
      type: String,
      enum: ['first_entry', 'three_day_streak', 'week_streak', 'month_streak', 'emotion_variety', 'consistent_time']
    },
    earnedAt: {
      type: Date,
      default: Date.now
    },
    seen: {
      type: Boolean,
      default: false
    }
  }]
}, { timestamps: true });

// Export all models
module.exports = {
  JournalEntry: mongoose.model('JournalEntry', JournalEntrySchema),
  JournalPrompt: mongoose.model('JournalPrompt', JournalPromptSchema),
  JournalStreak: mongoose.model('JournalStreak', JournalStreakSchema)
};