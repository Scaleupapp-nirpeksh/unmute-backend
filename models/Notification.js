const mongoose = require('mongoose');
const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: ['new_match', 'new_message', 'vent_reaction', 'report_update'] },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }, { timestamps: true });
  
  NotificationSchema.index({ userId: 1 });
  NotificationSchema.index({ isRead: 1 });

  module.exports = mongoose.model('Notification', NotificationSchema);