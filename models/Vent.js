const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const VentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    emotion: { type: String, required: true, enum: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral', 'Burnout'] },
    hashtags: { type: [String], index: true },
    issueType: { type: String, index: true },
    reactions: {
        hug: { type: Number, default: 0 },
        heart: { type: Number, default: 0 },
        listen: { type: Number, default: 0 }
    },
    comments: [CommentSchema],  // ✅ Added Comments
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Vent', VentSchema);
