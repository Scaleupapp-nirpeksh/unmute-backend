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
    matchPreference: { type: String, default: 'Similar Emotions' }
  },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
