const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  content: {
    type: String,
    required: true
  },
  upvotes: {
    type: Number,
    default: 0
  },
  downvotes: {
    type: Number,
    default: 0
  },
  votedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    voteType: {
      type: String,
      enum: ['up', 'down']
    }
  }],
  isExpertAnswer: {
    type: Boolean,
    default: false
  },
  expertCredentials: {
    type: String,
    default: null
  },
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isAccepted: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  lastEditedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Vote count virtual
AnswerSchema.virtual('voteCount').get(function() {
  return this.upvotes - this.downvotes;
});

const QuestionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  topics: [{
    type: String,
    index: true
  }],
  emotionalContext: {
    type: String,
    enum: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral', 'Burnout', 'Peaceful', 'Excited', 'Grateful', 'Overwhelmed', 'Hopeful', 'Disappointed'],
    default: 'Neutral'
  },
  tags: [{
    type: String,
    index: true
  }],
  answers: [AnswerSchema],
  views: {
    type: Number,
    default: 0
  },
  followersCount: {
    type: Number,
    default: 0
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isSolved: {
    type: Boolean,
    default: false
  },
  solvedByAnswerId: {
    type: mongoose.Schema.Types.ObjectId
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  lastEditedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  reportCount: {
    type: Number,
    default: 0
  },
  isFlagged: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text indexes for search
QuestionSchema.index({ title: 'text', content: 'text', tags: 'text' });
// Index for sorting by recency
QuestionSchema.index({ createdAt: -1 });
// Index for sorting by popularity
QuestionSchema.index({ views: -1 });
// Index for user's questions
QuestionSchema.index({ userId: 1, createdAt: -1 });

// Virtual for answer count
QuestionSchema.virtual('answerCount').get(function() {
  return this.answers ? this.answers.filter(a => !a.isDeleted).length : 0;
});

module.exports = mongoose.model('Question', QuestionSchema);