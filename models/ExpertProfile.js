const mongoose = require('mongoose');

const ExpertProfileSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true,
    index: true
  },
  specializations: [{ 
    type: String,
    required: true
  }],
  credentials: { 
    type: String, 
    required: true 
  },
  professionalTitle: {
    type: String
  },
  organization: {
    type: String
  },
  biography: { 
    type: String 
  },
  yearsOfExperience: {
    type: Number,
    min: 0
  },
  education: [{
    degree: String,
    institution: String,
    year: Number
  }],
  certifications: [{
    name: String,
    issuer: String,
    year: Number
  }],
  publicProfile: {
    type: Boolean,
    default: false
  },
  allowDirectMessages: {
    type: Boolean,
    default: false
  },
  topicsOfExpertise: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumTopic'
  }],
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationDocuments: [{ 
    type: String  // URLs to uploaded credentials
  }],
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'  // Admin who verified
  }, 
  reviewNotes: { 
    type: String 
  },
  reviewedAt: { 
    type: Date 
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'additional_info_needed'],
    default: 'pending'
  },
  answerCount: {
    type: Number,
    default: 0
  },
  helpfulnessScore: {
    type: Number,
    default: 0
  },
  endorsements: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Create index for specializations
ExpertProfileSchema.index({ specializations: 1 });
// Index for verification status
ExpertProfileSchema.index({ verificationStatus: 1 });
// Index for searching by topic expertise
ExpertProfileSchema.index({ topicsOfExpertise: 1 });
// Index for sorting by helpfulness
ExpertProfileSchema.index({ helpfulnessScore: -1 });

module.exports = mongoose.model('ExpertProfile', ExpertProfileSchema);