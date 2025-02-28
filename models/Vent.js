const mongoose = require('mongoose');

const VentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  text: { type: String, required: true },
  vector: { type: Map, of: Number },  // Stores TF-IDF representation
  emotion: { type: String, required: true, enum: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral', 'Burnout'] },
  hashtags: { type: [String], index: true },
  issueType: { type: String, index: true },
  reactions: {
    hug: { type: Number, default: 0 },
    heart: { type: Number, default: 0 },
    listen: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
  
  VentSchema.index({ hashtags: 1 });
  VentSchema.index({ issueType: 1 });
  VentSchema.index({ emotion: 1 });


  module.exports = mongoose.model('Vent', VentSchema);