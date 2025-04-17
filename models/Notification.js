const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    required: true,
    index: true
  },
  message: { 
    type: String, 
    required: true 
  },
  // For linking to the relevant item
  reference: {
    type: { type: String },  // 'vent', 'circle', 'circle_message', 'journal', etc.
    id: { type: mongoose.Schema.Types.ObjectId },
    parentId: { type: mongoose.Schema.Types.ObjectId } // For nested items like circle messages
  },
  // For additional data that might be needed by the frontend
  data: {
    type: Object,
    default: {}
  },
  // The user who triggered this notification (if applicable)
  fromUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null
  },
  isRead: { 
    type: Boolean, 
    default: false,
    index: true
  },
  readAt: { 
    type: Date, 
    default: null 
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'delivered'
  }
}, { 
  timestamps: true 
});

// Index for efficient queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ type: 1, userId: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);