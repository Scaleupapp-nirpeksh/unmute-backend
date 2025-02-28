const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matchScore: { type: Number, required: true },
  ventMatches: [{
      vent1: { type: mongoose.Schema.Types.ObjectId, ref: 'Vent', required: true },
      vent2: { type: mongoose.Schema.Types.ObjectId, ref: 'Vent', required: true },
      matchScore: { type: Number, required: true }
  }],
  commonEmotions: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'unmatched'], default: 'pending' },
  user1Accepted: { type: Boolean, default: false },  // 🔹 Tracks acceptance from user1
  user2Accepted: { type: Boolean, default: false },  // 🔹 Tracks acceptance from user2
}, { timestamps: true });

// 🔥 Ensure user1 and user2 are always unique pairs
MatchSchema.index({ user1: 1, user2: 1 }, { unique: true });

module.exports = mongoose.model('Match', MatchSchema);
