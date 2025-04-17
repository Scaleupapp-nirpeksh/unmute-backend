const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const https = require('https'); 
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const fs = require('fs');
const configureCircleSocket = require('./services/circleSocketService');

dotenv.config();
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for rich content

// ✅ Load Background Services
require('./services/matchScheduler');  // Runs Match Updating Daily
require('./services/journalScheduler'); // Runs Journal Analysis and Reminders

// Create HTTP Server and Attach Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',  // Allow all origins (You can restrict it later)
        methods: ['GET', 'POST']
    }
});

// Store connected users (userId -> socketId mapping)
const onlineUsers = new Map();

// Handle Socket.io Connections
io.on('connection', (socket) => {
    console.log('🔥 A user connected:', socket.id);

    // 🔹 User joins and is stored in online users map
    socket.on('join', (userId) => {
        onlineUsers.set(userId, socket.id);
        console.log(`✅ User ${userId} is online`);
        io.emit('userOnline', { userId });
    });

    // 🔹 Send a message (Store in DB before emitting)
    socket.on('sendMessage', async ({ chatId, senderId, recipientId, text }) => {
        console.log('📨 New Message:', text);

        try {
            // Store message in MongoDB
            const message = new Message({ chatId, sender: senderId, text, status: 'sent' });
            await message.save();

            // Update last message in Chat
            await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, updatedAt: new Date() });

            // Send to recipient if online
            const recipientSocketId = onlineUsers.get(recipientId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('newMessage', { chatId, senderId, text, messageId: message._id });
            }
        } catch (error) {
            console.error("❌ Error sending message via Socket.io:", error);
        }
    });

    // 🔹 Real-time message read receipts
    socket.on('markAsRead', async ({ chatId, readerId }) => {
        try {
            // Mark messages as read
            await Message.updateMany(
                { chatId, sender: { $ne: readerId }, status: 'sent' },
                { $set: { status: 'read' } }
            );

            // Notify sender that messages are read
            const chat = await Chat.findById(chatId).populate('participants');
            const otherUser = chat.participants.find(user => user._id.toString() !== readerId);

            if (otherUser) {
                const senderSocketId = onlineUsers.get(otherUser._id.toString());
                if (senderSocketId) {
                    io.to(senderSocketId).emit('messagesRead', { chatId, readerId });
                }
            }
        } catch (error) {
            console.error("❌ Error marking messages as read in Socket.io:", error);
        }
    });

    // 🔹 Delete a message in real-time
    socket.on('deleteMessage', async ({ chatId, messageId, senderId }) => {
        try {
            // Soft delete the message
            const message = await Message.findById(messageId);
            if (message) {
                message.text = 'Message deleted';
                message.isDeleted = true;
                await message.save();

                // Notify recipient in real-time
                const chat = await Chat.findById(chatId);
                const recipientId = chat.participants.find(participant => participant.toString() !== senderId);

                if (recipientId) {
                    const recipientSocketId = onlineUsers.get(recipientId.toString());
                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit('messageDeleted', { chatId, messageId });
                    }
                }
            }
        } catch (error) {
            console.error("❌ Error deleting message in real-time:", error);
        }
    });
    
    // 🆕 Journal Entry Notification
    socket.on('journalEntryCreated', ({ userId }) => {
        // Notify user's matches about new journal entry (if public)
        // This would be implemented based on your visibility rules
    });
    
    // 🆕 Real-time notifications
    socket.on('subscribeToNotifications', (userId) => {
        // Add user to a personal notification room
        socket.join(`user:${userId}:notifications`);
        console.log(`👂 User ${userId} subscribed to notifications`);
    });
    
    // 🆕 Q&A Forum activity
    socket.on('joinQuestionRoom', (questionId) => {
        socket.join(`question:${questionId}`);
        console.log(`👋 User joined question room: ${questionId}`);
    });
    
    socket.on('leaveQuestionRoom', (questionId) => {
        socket.leave(`question:${questionId}`);
        console.log(`👋 User left question room: ${questionId}`);
    });

    // 🔹 Handle user disconnection properly
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        
        let disconnectedUserId;
        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                onlineUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            io.emit('userOffline', { userId: disconnectedUserId });
        }
    });
});

// Set up circle socket namespace
const circleIO = configureCircleSocket(io, onlineUsers);

// Import route handlers
const authRoutes = require('./routes/authRoutes');
const ventRoutes = require('./routes/ventRoutes');
const matchRoutes = require('./routes/matchRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes');
const journalRoutes = require('./routes/journalRoutes');
const circleRoutes = require('./routes/circleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const notificationSettingsRoutes = require('./routes/notificationSettingsRoutes');
const qaRoutes = require('./routes/qaRoutes'); // New! Q&A Forum routes

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/vent', ventRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes(io)); // Pass io to chat routes
app.use('/api/admin', adminRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/circles', circleRoutes);
//app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-settings', notificationSettingsRoutes);
app.use('/api/qa', qaRoutes); // New! Q&A Forum routes

// Home route
app.get('/', (req, res) => {
    res.send('🚀 Unmute Backend is Running!');
});

// Set up notification socket events
// This allows sending real-time notifications to users
io.on('connection', (socket) => {
    socket.on('join', (userId) => {
        // Send any pending notifications
        // This could trigger a notification check when user connects
    });
});

// Set up Q&A socket events for real-time updates
io.on('connection', (socket) => {
    // When a new answer is posted
    socket.on('newAnswer', ({ questionId, answer }) => {
        // Broadcast to everyone viewing the question
        socket.to(`question:${questionId}`).emit('answerAdded', { questionId, answer });
    });
    
    // When an answer is voted on
    socket.on('answerVoted', ({ questionId, answerId, voteCount }) => {
        // Broadcast vote update
        socket.to(`question:${questionId}`).emit('voteUpdated', { 
            questionId, 
            answerId, 
            voteCount 
        });
    });
    
    // When an answer is accepted
    socket.on('answerAccepted', ({ questionId, answerId }) => {
        // Broadcast acceptance
        socket.to(`question:${questionId}`).emit('solutionMarked', { 
            questionId, 
            answerId 
        });
    });
});

// Function to emit a notification to a specific user
global.emitNotification = (userId, notification) => {
    io.to(`user:${userId}:notifications`).emit('newNotification', notification);
};

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'An unexpected error occurred',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start the server
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));