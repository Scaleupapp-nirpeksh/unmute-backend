const SupportCircle = require('../models/SupportCircles');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Configure Socket.io events for Support Circles
 * @param {Object} io - Socket.io instance
 * @param {Map} onlineUsers - Map of online users (userId -> socketId)
 */
const configureCircleSocket = (io, onlineUsers) => {
  // Create a namespace for circles
  const circleIo = io.of('/circles');
  
  // Track users in each circle room
  const circleUsers = new Map(); // circleId -> Set of userIds
  
  circleIo.on('connection', (socket) => {
    console.log('🔄 User connected to circles namespace:', socket.id);
    let currentUserId = null;
    
    // 🔹 User authenticates with the socket
    socket.on('authenticate', async ({ userId, token }) => {
      try {
        // In a real app, validate token here
        currentUserId = userId;
        console.log(`✅ User ${userId} authenticated with circle socket`);
        
        // Add user to the global online users map
        onlineUsers.set(userId, socket.id);
        
        // Get the user's circle memberships to auto-join rooms
        const circles = await SupportCircle.find({
          'members.userId': mongoose.Types.ObjectId(userId),
          'members.status': 'active'
        }).select('_id');
        
        // Join socket rooms for each circle
        circles.forEach(circle => {
          const circleId = circle._id.toString();
          socket.join(`circle:${circleId}`);
          
          // Update circle users tracking
          if (!circleUsers.has(circleId)) {
            circleUsers.set(circleId, new Set());
          }
          circleUsers.get(circleId).add(userId);
          
          // Notify other users in the circle that this user is online
          socket.to(`circle:${circleId}`).emit('userJoinedCircle', {
            circleId,
            userId
          });
        });
        
        // Emit the list of online users in each circle to the client
        circles.forEach(circle => {
          const circleId = circle._id.toString();
          const onlineMembers = Array.from(circleUsers.get(circleId) || []);
          socket.emit('circleOnlineUsers', {
            circleId,
            onlineUsers: onlineMembers
          });
        });
        
      } catch (error) {
        console.error('❌ Error authenticating user with circle socket:', error);
        socket.emit('error', { message: 'Authentication failed' });
      }
    });
    
    // 🔹 User manually joins a circle room
    socket.on('joinCircle', ({ circleId }) => {
      if (!currentUserId) return;
      
      // Join the room
      socket.join(`circle:${circleId}`);
      
      // Update tracking
      if (!circleUsers.has(circleId)) {
        circleUsers.set(circleId, new Set());
      }
      circleUsers.get(circleId).add(currentUserId);
      
      // Notify others in the circle
      socket.to(`circle:${circleId}`).emit('userJoinedCircle', {
        circleId,
        userId: currentUserId
      });
      
      // Send list of online users to the joining user
      const onlineMembers = Array.from(circleUsers.get(circleId) || []);
      socket.emit('circleOnlineUsers', {
        circleId,
        onlineUsers: onlineMembers
      });
      
      console.log(`👤 User ${currentUserId} joined circle ${circleId}`);
    });
    
    // 🔹 User leaves a circle room
    socket.on('leaveCircle', ({ circleId }) => {
      if (!currentUserId) return;
      
      // Leave the room
      socket.leave(`circle:${circleId}`);
      
      // Update tracking
      if (circleUsers.has(circleId)) {
        circleUsers.get(circleId).delete(currentUserId);
      }
      
      // Notify others in the circle
      socket.to(`circle:${circleId}`).emit('userLeftCircle', {
        circleId,
        userId: currentUserId
      });
      
      console.log(`👋 User ${currentUserId} left circle ${circleId}`);
    });
    
    // 🔹 User sends a message to a circle
    socket.on('circleMessage', async ({ 
      circleId, 
      content, 
      parentMessageId = null,
      attachments = [] 
    }) => {
      if (!currentUserId || !circleId || !content) return;
      
      try {
        const circle = await SupportCircle.findById(circleId);
        if (!circle) {
          socket.emit('error', { message: 'Circle not found' });
          return;
        }
        
        // Check if user is a member
        const isMember = circle.members.some(
          m => m.userId.toString() === currentUserId && m.status === 'active'
        );
        
        if (!isMember) {
          socket.emit('error', { message: 'You must be a member to send messages' });
          return;
        }
        
        // Check if user is muted
        const member = circle.members.find(m => m.userId.toString() === currentUserId);
        if (member.status === 'muted') {
          socket.emit('error', { message: 'You are currently muted in this circle' });
          return;
        }
        
        // If this is a reply, verify parent message exists
        if (parentMessageId) {
          const parentExists = circle.messages.some(
            msg => msg._id.toString() === parentMessageId
          );
          
          if (!parentExists) {
            socket.emit('error', { message: 'Parent message not found' });
            return;
          }
        }
        
        // Create new message
        const newMessage = {
          userId: mongoose.Types.ObjectId(currentUserId),
          content,
          attachments,
          parentMessageId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        circle.messages.push(newMessage);
        circle.messageCount += 1;
        circle.updatedAt = new Date();
        await circle.save();
        
        // Get the saved message with its ID
        const savedMessage = circle.messages[circle.messages.length - 1];
        
        // Get user details
        const user = await User.findById(currentUserId).select('username profilePic');
        
        // Prepare message for sending
        const messageToSend = {
          ...savedMessage.toObject(),
          user: {
            _id: currentUserId,
            username: user ? user.username : 'Unknown User',
            profilePic: user ? user.profilePic : ''
          }
        };
        
        // Broadcast to all users in the circle
        circleIo.to(`circle:${circleId}`).emit('newCircleMessage', {
          circleId,
          message: messageToSend
        });
        
        console.log(`📨 User ${currentUserId} sent message to circle ${circleId}`);
      } catch (error) {
        console.error('❌ Error sending circle message:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });
    
    // 🔹 User is typing in a circle
    socket.on('circleTyping', ({ circleId }) => {
      if (!currentUserId) return;
      
      // Broadcast to others in the circle
      socket.to(`circle:${circleId}`).emit('userTyping', {
        circleId,
        userId: currentUserId
      });
    });
    
    // 🔹 User stopped typing in a circle
    socket.on('circleStoppedTyping', ({ circleId }) => {
      if (!currentUserId) return;
      
      // Broadcast to others in the circle
      socket.to(`circle:${circleId}`).emit('userStoppedTyping', {
        circleId,
        userId: currentUserId
      });
    });
    
    // 🔹 User reacts to a message
    socket.on('circleMessageReaction', async ({ 
      circleId, 
      messageId, 
      reactionType 
    }) => {
      if (!currentUserId || !['supportive', 'insightful', 'thankful'].includes(reactionType)) return;
      
      try {
        const circle = await SupportCircle.findById(circleId);
        if (!circle) {
          socket.emit('error', { message: 'Circle not found' });
          return;
        }
        
        // Check if user is a member
        const isMember = circle.members.some(
          m => m.userId.toString() === currentUserId && m.status === 'active'
        );
        
        if (!isMember) {
          socket.emit('error', { message: 'You must be a member to react to messages' });
          return;
        }
        
        // Find the message
        const messageIndex = circle.messages.findIndex(
          msg => msg._id.toString() === messageId
        );
        
        if (messageIndex === -1) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }
        
        const message = circle.messages[messageIndex];
        
        // Check if user already reacted
        const existingReactionIndex = message.reactedBy.findIndex(
          r => r.userId.toString() === currentUserId
        );
        
        let action = 'added'; // Default action
        
        if (existingReactionIndex !== -1) {
          // User already reacted, check if it's the same reaction
          const existingType = message.reactedBy[existingReactionIndex].reactionType;
          
          if (existingType === reactionType) {
            // Remove reaction (toggle off)
            message.reactions[existingType] -= 1;
            message.reactedBy.splice(existingReactionIndex, 1);
            action = 'removed';
          } else {
            // Change reaction type
            message.reactions[existingType] -= 1;
            message.reactions[reactionType] += 1;
            message.reactedBy[existingReactionIndex].reactionType = reactionType;
            action = 'changed';
          }
        } else {
          // Add new reaction
          message.reactions[reactionType] += 1;
          message.reactedBy.push({
            userId: mongoose.Types.ObjectId(currentUserId),
            reactionType
          });
        }
        
        await circle.save();
        
        // Broadcast the updated reactions to all users in the circle
        circleIo.to(`circle:${circleId}`).emit('messageReaction', {
          circleId,
          messageId,
          userId: currentUserId,
          reactionType,
          action,
          reactions: message.reactions
        });
        
      } catch (error) {
        console.error('❌ Error reacting to message:', error);
        socket.emit('error', { message: 'Error updating reaction' });
      }
    });
    
    // 🔹 Handle disconnection
    socket.on('disconnect', () => {
      if (!currentUserId) return;
      
      console.log(`❌ User ${currentUserId} disconnected from circles`);
      
      // Remove user from all circle rooms they were in
      circleUsers.forEach((users, circleId) => {
        if (users.has(currentUserId)) {
          users.delete(currentUserId);
          
          // Notify others in the circle
          socket.to(`circle:${circleId}`).emit('userLeftCircle', {
            circleId,
            userId: currentUserId
          });
        }
      });
      
      // Remove from global online users map
      onlineUsers.delete(currentUserId);
    });
  });
  
  return circleIo;
};

module.exports = configureCircleSocket;