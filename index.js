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

dotenv.config();
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for journal entries with rich content

// ✅ Load Background Services
require('./services/matchScheduler');  // Runs Match Updating Daily
require('./services/journalScheduler'); // New! Runs Journal Analysis and Reminders

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

// Load Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vent', require('./routes/ventRoutes'));
app.use('/api/match', require('./routes/matchRoutes'));
// First import the function
const chatRoutes = require('./routes/chatRoutes');
// Then call it with io and use the returned router
app.use('/api/chat', chatRoutes(io));
app.use('/api/admin', require('./routes/adminRoutes'));
console.log('>>> journalRoutes path:', require.resolve('./routes/journalRoutes'));
const importedJournalRoutes = require('./routes/journalRoutes');
console.log('>>> importedJournalRoutes:', importedJournalRoutes);


app.use('/api/journal', importedJournalRoutes);

app.get('/', (req, res) => {
    res.send('🚀 Unmute Backend is Running!');
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));