const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  randomUsernameGenerated: { type: Boolean, default: true },
  profilePic: { type: String, default: '' },
  bio: { type: String, default: '' },
  interests: { type: [String], default: [] },
  likes: { type: [String], default: [] },
  dislikes: { type: [String], default: [] },
  preferences: {
    anonymousChat: { type: Boolean, default: true },
    matchPreference: { type: String, default: 'Similar Emotions' },
    // Journal preferences
    journalReminders: { type: Boolean, default: true },
    journalReminderTime: { type: String, default: '20:00' }, // 24-hour format
    autoAnalyzeJournals: { type: Boolean, default: true },
    journalPrivacyDefault: { type: String, default: 'private', enum: ['private', 'matches', 'public'] }
  },
  allowComments: { type: Boolean, default: true },
  // Journal feature related fields
  journalStats: {
    totalEntries: { type: Number, default: 0 },
    lastEntryDate: { type: Date },
    favoriteCategories: [{ type: String }],
    topEmotions: [{
      emotion: String,
      count: Number
    }]
  },
  // 🆕 Notification preferences
  notifications: {
    // General notification settings
    enabled: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' }, // 24-hour format
    quietHoursEnd: { type: String, default: '08:00' }, // 24-hour format
    
    // Journal notifications
    journalReminders: { type: Boolean, default: true },
    streakAlerts: { type: Boolean, default: true },
    journalInsights: { type: Boolean, default: true },
    
    // Match & Vent notifications
    matchSuggestions: { type: Boolean, default: true },
    newMatches: { type: Boolean, default: true },
    ventReactions: { type: Boolean, default: true },
    ventComments: { type: Boolean, default: true },
    
    // 🆕 Circle notification settings
    circles: {
      newMessage: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      newTopic: { type: Boolean, default: true },
      joinRequests: { type: Boolean, default: true }, // For moderators
      memberJoined: { type: Boolean, default: true }, // For moderators
      messageReactions: { type: Boolean, default: true },
      roleChanges: { type: Boolean, default: true },
      circleUpdates: { type: Boolean, default: true },
      // Granular circle settings
      circleSpecific: [{
        circleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCircle' },
        muted: { type: Boolean, default: false },
        mentionsOnly: { type: Boolean, default: false }, // Only notify for mentions
        // Override general circle settings
        overrideDefaults: { type: Boolean, default: false },
        settings: {
          newMessage: { type: Boolean, default: true },
          mentions: { type: Boolean, default: true },
          newTopic: { type: Boolean, default: true },
          messageReactions: { type: Boolean, default: true }
        }
      }]
    }
  },
  // 🆕 Circle participation stats
  circleStats: {
    joinedCount: { type: Number, default: 0 },
    moderatingCount: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    lastActive: { type: Date }
  },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);