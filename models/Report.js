const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vent', default: null },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
    reason: { type: String, required: true },
    reviewedAt: { type: Date, default: null }
  }, { timestamps: true });
  
  ReportSchema.index({ ventId: 1 });
  ReportSchema.index({ chatId: 1 });
  ReportSchema.index({ reviewedAt: 1 });
  
  module.exports = mongoose.model('Report', ReportSchema);
