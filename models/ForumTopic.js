const mongoose = require('mongoose');

const ForumTopicSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  },
  description: { 
    type: String,
    required: true
  },
  iconUrl: { 
    type: String 
  },
  color: {
    type: String,
    default: '#3498db' // Default color
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  questionsCount: { 
    type: Number, 
    default: 0 
  },
  followersCount: {
    type: Number,
    default: 0
  },
  relatedTopics: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumTopic'
  }],
  parentTopic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumTopic',
    default: null
  },
  isSubTopic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for searching topics
ForumTopicSchema.index({ name: 'text', description: 'text' });
// Index for sorting by popularity
ForumTopicSchema.index({ questionsCount: -1 });
// Index for active topics
ForumTopicSchema.index({ isActive: 1 });
// Index for subtopics
ForumTopicSchema.index({ parentTopic: 1 });

// Virtual for subtopics
ForumTopicSchema.virtual('subTopics', {
  ref: 'ForumTopic',
  localField: '_id',
  foreignField: 'parentTopic',
  justOne: false
});

// Pre-save middleware to generate slug
ForumTopicSchema.pre('save', function(next) {
  if (!this.isModified('name')) return next();
  
  this.slug = this.name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove special characters
    .replace(/\s+/g, '-');    // Replace spaces with hyphens
  
  next();
});

module.exports = mongoose.model('ForumTopic', ForumTopicSchema);