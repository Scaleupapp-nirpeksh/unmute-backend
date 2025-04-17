const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    index: true
  },
  answerId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  voteType: {
    type: String,
    enum: ['up', 'down'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index to ensure one vote per user per content
VoteSchema.index({ userId: 1, questionId: 1, answerId: 1 }, { unique: true });

// Pre-save to set updatedAt on modification
VoteSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Vote', VoteSchema);