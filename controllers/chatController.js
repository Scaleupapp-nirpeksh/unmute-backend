const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Match = require('../models/Match')

/**
 * ✅ Start or Retrieve a Chat (Only if Match is Accepted)
 */
const startChat = async (req, res) => {
    const userId = req.user.userId;
    const { recipientId } = req.body;

    if (!recipientId) {
        return res.status(400).json({ success: false, message: 'Recipient ID is required' });
    }

    try {
        // 🔍 Ensure a match exists and is explicitly 'accepted'
        const match = await Match.findOne({
            $or: [
                { user1: userId, user2: recipientId, status: 'accepted' },
                { user1: recipientId, user2: userId, status: 'accepted' }
            ]
        });

        if (!match) {
            return res.status(403).json({ success: false, message: 'Chat can only start if a match is accepted' });
        }

        // ✅ Check if a chat already exists
        let chat = await Chat.findOne({ participants: { $all: [userId, recipientId] } });

        if (!chat) {
            // ✅ Create new chat if not exists
            chat = new Chat({ participants: [userId, recipientId] });
            await chat.save();
        }

        return res.status(200).json({ success: true, chat });

    } catch (error) {
        console.error("❌ Error starting chat:", error);
        return res.status(500).json({ success: false, message: 'Error starting chat', error });
    }
};

/**
 * ✅ Send a Message & Emit to Socket.io
 */
const sendMessage = async (req, res, io) => {
    const userId = req.user.userId;
    const { chatId, text } = req.body;

    if (!chatId || !text) {
        return res.status(400).json({ success: false, message: 'Chat ID and text are required' });
    }

    try {
        // Check if chat exists
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        // Create new message
        const message = new Message({ chatId, sender: userId, text, status: 'sent' });
        await message.save();

        // Update lastMessage in Chat
        chat.lastMessage = message._id;
        chat.updatedAt = new Date();
        await chat.save();

        // 🔥 Emit message to recipient via Socket.io
        const recipientId = chat.participants.find(id => id.toString() !== userId);
        io.to(recipientId).emit('newMessage', { chatId, senderId: userId, text });

        return res.status(201).json({ success: true, message });

    } catch (error) {
        console.error("❌ Error sending message:", error);
        return res.status(500).json({ success: false, message: 'Error sending message', error });
    }
};

/**
 * ✅ Get Chat List (All active chats for the user)
 */
const getChatList = async (req, res) => {
    const userId = req.user.userId;

    try {
        // Fetch all chats for the user
        const chats = await Chat.find({ participants: userId, status: 'active' })
            .populate('participants', 'username')
            .populate('lastMessage');

        return res.status(200).json({ success: true, chats });

    } catch (error) {
        console.error("❌ Error fetching chat list:", error);
        return res.status(500).json({ success: false, message: 'Error fetching chat list', error });
    }
};

/**
 * ✅ Get Chat Messages
 */
const getChatMessages = async (req, res) => {
    const userId = req.user.userId;
    const { chatId } = req.params;

    try {
        // Ensure chat exists and user is part of it
        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        // Fetch all messages in the chat
        const messages = await Message.find({ chatId }).sort({ createdAt: 1 });

        return res.status(200).json({ success: true, messages });

    } catch (error) {
        console.error("❌ Error fetching messages:", error);
        return res.status(500).json({ success: false, message: 'Error fetching messages', error });
    }
};

/**
 * ✅ Mark Messages as Read & Emit Read Receipts
 */
const markMessagesAsRead = async (req, res, io) => {
    const userId = req.user.userId;
    const { chatId } = req.body;

    if (!chatId) {
        return res.status(400).json({ success: false, message: 'Chat ID is required' });
    }

    try {
        // Update message status for messages in this chat
        const updatedMessages = await Message.updateMany(
            { chatId, status: 'sent', sender: { $ne: userId } },
            { $set: { status: 'read' } }
        );

        // Notify sender that messages were read
        io.to(chatId).emit('messagesRead', { chatId });

        return res.status(200).json({ success: true, message: 'Messages marked as read' });

    } catch (error) {
        console.error("❌ Error marking messages as read:", error);
        return res.status(500).json({ success: false, message: 'Error marking messages as read', error });
    }
};


/**
 * ✅ Delete a Single Message (Soft Delete)
 * - Users can only delete their own messages.
 * - Optionally, replace text with "Message deleted".
 */
const deleteMessage = async (req, res) => {
    const userId = req.user.userId;
    const { messageId } = req.body;

    if (!messageId) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
    }

    try {
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        if (message.sender.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
        }

        // Soft delete - Replace message text
        message.text = 'Message deleted';
        message.isDeleted = true;
        await message.save();

        // Notify the recipient in real-time
        const chat = await Chat.findById(message.chatId);
        const recipientId = chat.participants.find(participant => participant.toString() !== userId);

        if (recipientId) {
            const recipientSocketId = onlineUsers.get(recipientId.toString());
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('messageDeleted', { chatId: message.chatId, messageId });
            }
        }

        return res.status(200).json({ success: true, message: 'Message deleted' });

    } catch (error) {
        console.error("❌ Error deleting message:", error);
        return res.status(500).json({ success: false, message: 'Error deleting message', error });
    }
};

/**
 * ✅ Delete an Entire Chat (Soft Delete)
 * - Removes the chat **only for the requesting user**.
 * - If both users delete, remove completely.
 */
const deleteChat = async (req, res) => {
    const userId = req.user.userId;
    const { chatId } = req.body;

    if (!chatId) {
        return res.status(400).json({ success: false, message: 'Chat ID is required' });
    }

    try {
        const chat = await Chat.findById(chatId);

        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        // Soft delete - Remove only for the requesting user
        chat.participants = chat.participants.filter(participant => participant.toString() !== userId);

        // If no participants remain, delete chat completely
        if (chat.participants.length === 0) {
            await Message.deleteMany({ chatId }); // Delete messages
            await chat.deleteOne();
            return res.status(200).json({ success: true, message: 'Chat fully deleted' });
        }

        await chat.save();
        return res.status(200).json({ success: true, message: 'Chat deleted for you' });

    } catch (error) {
        console.error("❌ Error deleting chat:", error);
        return res.status(500).json({ success: false, message: 'Error deleting chat', error });
    }
};

module.exports = {
    startChat,
    sendMessage,
    getChatList,
    getChatMessages,
    markMessagesAsRead,
    deleteMessage,  // ✅ Ensure this is exported
    deleteChat      // ✅ Ensure this is exported
};

