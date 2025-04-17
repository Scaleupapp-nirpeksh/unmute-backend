//models/SupportCircle.js
const mongoose = require('mongoose');

// Schema for individual messages in a circle
const CircleMessageSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  attachments: [{ 
    type: String 
  }],
  reactions: {
    supportive: { 
      type: Number, 
      default: 0 
    },
    insightful: { 
      type: Number, 
      default: 0 
    },
    thankful: { 
      type: Number, 
      default: 0 
    }
  },
  reactedBy: [{
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    reactionType: { 
      type: String, 
      enum: ['supportive', 'insightful', 'thankful'] 
    }
  }],
  isEdited: { 
    type: Boolean, 
    default: false 
  },
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  parentMessageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: null 
  }, // For threaded replies
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { _id: true });

// Schema for circle weekly topics
const CircleTopicSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  resources: [{
    title: { 
      type: String, 
      required: true 
    },
    url: { 
      type: String 
    },
    description: { 
      type: String 
    },
    type: { 
      type: String, 
      enum: ['article', 'video', 'exercise', 'book', 'podcast', 'other'],
      default: 'article'
    }
  }],
  guideQuestions: [{ 
    type: String 
  }],
  activeFrom: { 
    type: Date, 
    required: true 
  },
  activeTo: { 
    type: Date, 
    required: true 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, { timestamps: true });

// Main Support Circle Schema
const SupportCircleSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true,
    index: true
  }, // e.g., "Grief", "Work Stress", "Anxiety", etc.
  tags: [{ 
    type: String,
    index: true
  }],
  coverImage: { 
    type: String 
  },
  moderators: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  members: [{ 
    userId: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member'
    },
    status: {
      type: String,
      enum: ['active', 'muted', 'banned'],
      default: 'active'
    }
  }],
  memberCount: {
    type: Number,
    default: 0
  },
  memberLimit: { 
    type: Number, 
    default: 20 
  },
  isPrivate: { 
    type: Boolean, 
    default: false 
  },
  joinRequests: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  accessCode: {
    type: String,
    default: null
  }, // For invite-only circles
  messages: [CircleMessageSchema],
  weeklyTopics: [CircleTopicSchema],
  rules: [{
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    }
  }],
  activeMembers: {
    daily: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 }
  },
  messageCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'archived'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

// Indexes for efficient queries
SupportCircleSchema.index({ name: 'text', description: 'text', tags: 'text' });
SupportCircleSchema.index({ category: 1 });
SupportCircleSchema.index({ status: 1 });
SupportCircleSchema.index({ 'members.userId': 1 });
SupportCircleSchema.index({ isPrivate: 1 });

// Pre-save middleware to update memberCount
SupportCircleSchema.pre('save', function(next) {
  if (this.isModified('members')) {
    this.memberCount = this.members.length;
  }
  this.updatedAt = new Date();
  next();
});

// Method to check if a user is a member of the circle
SupportCircleSchema.methods.isMember = function(userId) {
  return this.members.some(member => 
    member.userId.toString() === userId.toString() && 
    member.status === 'active'
  );
};

// Method to check if a user is a moderator of the circle
SupportCircleSchema.methods.isModerator = function(userId) {
  return this.members.some(member => 
    member.userId.toString() === userId.toString() && 
    (member.role === 'moderator' || member.role === 'admin')
  );
};

// Create the model
const SupportCircles = mongoose.model('SupportCircle', SupportCircleSchema);

module.exports = SupportCircles;