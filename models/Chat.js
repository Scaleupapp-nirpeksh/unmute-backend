const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    participants: [
        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    ],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, // Stores last message for easy access
    status: { type: String, enum: ['active', 'closed'], default: 'active' }, // Closed if users unmatch
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 🔥 Ensure users are unique per chat (prevent duplicate chats)
ChatSchema.index({ participants: 1 }, { unique: true });

module.exports = mongoose.model('Chat', ChatSchema);
