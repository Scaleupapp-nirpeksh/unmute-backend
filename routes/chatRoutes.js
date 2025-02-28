const express = require('express');

module.exports = (io) => {
    const {
        startChat,
        sendMessage,
        getChatList,
        getChatMessages,
        markMessagesAsRead,
        deleteMessage,
        deleteChat
    } = require('../controllers/chatController'); 

    const authMiddleware = require('../middleware/authMiddleware');

    const router = express.Router();

    // ✅ Start or retrieve a chat (Only if match is accepted)
    router.post('/start', authMiddleware, startChat);

    // ✅ Send a message (Pass `io` to controller)
    router.post('/send', authMiddleware, (req, res) => sendMessage(req, res, io));

    // ✅ Get all active chats for the user
    router.get('/list', authMiddleware, getChatList);

    // ✅ Get messages of a specific chat
    router.get('/messages/:chatId', authMiddleware, getChatMessages);

    // ✅ Mark messages as read (Pass `io` to controller)
    router.post('/read', authMiddleware, (req, res) => markMessagesAsRead(req, res, io));

    // ✅ Delete a single message (Soft Delete)
    router.delete('/message', authMiddleware, deleteMessage);

    // ✅ Delete a chat (Soft Delete or Full Delete if both users delete)
    router.delete('/chat', authMiddleware, deleteChat);

    return router;
};
