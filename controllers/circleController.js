const SupportCircle = require('../models/SupportCircles');
const User = require('../models/User');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

/**
 * ✅ Get all public support circles
 * - With optional filters
 * - With pagination
 */
const getPublicCircles = async (req, res) => {
  const { 
    category, 
    tags, 
    search, 
    page = 1, 
    limit = 10,
    sort = 'newest' 
  } = req.query;
  
  try {
    const skip = (Number(page) - 1) * Number(limit);
    let query = { isPrivate: false, status: 'active' };
    
    if (category) {
      query.category = category;
    }
    
    if (tags) {
      const tagList = tags.split(',');
      query.tags = { $in: tagList };
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    let sortOption = {};
    if (sort === 'newest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { memberCount: -1 };
    } else if (sort === 'active') {
      sortOption = { 'activeMembers.weekly': -1 };
    }
    
    const circles = await SupportCircle.find(query)
      .select('name description category tags coverImage memberCount createdAt')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean();
    
    const total = await SupportCircle.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      circles,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching circles:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch circles',
      error: error.message
    });
  }
};

/**
 * ✅ Get circles where the user is a member
 */
const getUserCircles = async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const circles = await SupportCircle.find({
      'members.userId': userId,
      'members.status': 'active'
    })
    .select('name description category tags coverImage memberCount createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .lean();
    
    return res.status(200).json({
      success: true,
      circles
    });
    
  } catch (error) {
    console.error('❌ Error fetching user circles:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch user circles',
      error: error.message
    });
  }
};

/**
 * ✅ Get circle details
 * - Include recent messages if user is a member
 */
const getCircleDetails = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if this is a private circle and user is not a member
    if (circle.isPrivate && !circle.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: 'This is a private circle. You must be a member to view details.'
      });
    }
    
    // Convert to plain object for easier manipulation
    const circleData = circle.toObject();
    
    // If user is a member, include messages
    if (circle.isMember(userId)) {
      // Get only the most recent messages (limited to 50)
      circleData.recentMessages = circleData.messages
        .filter(msg => !msg.isDeleted)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
        .reverse();
      
      // Populate user data for messages
      const userIds = [...new Set(circleData.recentMessages.map(msg => msg.userId))];
      const users = await User.find({ _id: { $in: userIds } })
        .select('username profilePic')
        .lean();
      
      const userMap = {};
      users.forEach(user => {
        userMap[user._id.toString()] = user;
      });
      
      circleData.recentMessages = circleData.recentMessages.map(msg => {
        const user = userMap[msg.userId.toString()];
        return {
          ...msg,
          user: {
            _id: msg.userId,
            username: user ? user.username : 'Unknown User',
            profilePic: user ? user.profilePic : ''
          }
        };
      });
      
      // Get the current active topic (if any)
      const now = new Date();
      circleData.activeTopic = circleData.weeklyTopics.find(
        topic => topic.activeFrom <= now && topic.activeTo >= now
      );
    } else {
      // Non-members don't get messages
      delete circleData.messages;
      
      // Only show basic info about weekly topics
      if (circleData.weeklyTopics && circleData.weeklyTopics.length > 0) {
        circleData.weeklyTopics = circleData.weeklyTopics.map(topic => ({
          title: topic.title,
          description: topic.description
        }));
      }
    }
    
    // Remove sensitive information
    delete circleData.joinRequests;
    delete circleData.accessCode;
    
    // Add user-specific permission flags
    circleData.isMember = circle.isMember(userId);
    circleData.isModerator = circle.isModerator(userId);
    
    return res.status(200).json({
      success: true,
      circle: circleData
    });
    
  } catch (error) {
    console.error('❌ Error fetching circle details:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch circle details',
      error: error.message
    });
  }
};

/**
 * ✅ Create a new support circle
 */
const createCircle = async (req, res) => {
  const userId = req.user.userId;
  const { 
    name, 
    description, 
    category, 
    tags = [], 
    isPrivate = false, 
    memberLimit = 20,
    rules = [],
    coverImage = ''
  } = req.body;
  
  if (!name || !description || !category) {
    return res.status(400).json({
      success: false,
      message: 'Name, description, and category are required'
    });
  }
  
  try {
    // Create the circle
    const circle = new SupportCircle({
      name,
      description,
      category,
      tags,
      isPrivate,
      memberLimit,
      rules,
      coverImage,
      createdBy: userId,
      members: [{
        userId,
        role: 'admin',
        status: 'active',
        joinedAt: new Date()
      }],
      moderators: [userId]
    });
    
    // Set access code for private circles
    if (isPrivate) {
      circle.accessCode = generateAccessCode();
    }
    
    await circle.save();
    
    return res.status(201).json({
      success: true,
      message: 'Circle created successfully',
      circle: {
        _id: circle._id,
        name: circle.name,
        description: circle.description,
        category: circle.category,
        tags: circle.tags,
        isPrivate: circle.isPrivate,
        accessCode: circle.accessCode,
        memberLimit: circle.memberLimit,
        createdAt: circle.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating circle:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not create circle',
      error: error.message
    });
  }
};

/**
 * ✅ Update a support circle
 * - Only accessible by moderators
 */
const updateCircle = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  const {
    name,
    description,
    category,
    tags,
    isPrivate,
    memberLimit,
    rules,
    coverImage
  } = req.body;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a moderator
    if (!circle.isModerator(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only moderators can update circle settings'
      });
    }
    
    // Update fields if provided
    if (name) circle.name = name;
    if (description) circle.description = description;
    if (category) circle.category = category;
    if (tags) circle.tags = tags;
    if (isPrivate !== undefined) {
      circle.isPrivate = isPrivate;
      // Generate new access code if switching to private
      if (isPrivate && !circle.isPrivate) {
        circle.accessCode = generateAccessCode();
      }
    }
    if (memberLimit) circle.memberLimit = memberLimit;
    if (rules) circle.rules = rules;
    if (coverImage) circle.coverImage = coverImage;
    
    await circle.save();
    
    return res.status(200).json({
      success: true,
      message: 'Circle updated successfully',
      circle: {
        _id: circle._id,
        name: circle.name,
        description: circle.description,
        category: circle.category,
        tags: circle.tags,
        isPrivate: circle.isPrivate,
        accessCode: circle.accessCode,
        memberLimit: circle.memberLimit,
        rules: circle.rules,
        coverImage: circle.coverImage
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating circle:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update circle',
      error: error.message
    });
  }
};

/**
 * ✅ Join a circle
 * - Public circles: Join directly
 * - Private circles: Require access code or join request
 */
const joinCircle = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  const { accessCode } = req.body;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is already a member
    if (circle.isMember(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already a member of this circle'
      });
    }
    
    // Check if circle is at capacity
    if (circle.memberCount >= circle.memberLimit) {
      return res.status(400).json({
        success: false,
        message: 'This circle has reached its member limit'
      });
    }
    
    // Handle joining based on circle privacy
    if (circle.isPrivate) {
      // If access code provided, verify it
      if (accessCode) {
        if (accessCode !== circle.accessCode) {
          return res.status(403).json({
            success: false,
            message: 'Invalid access code'
          });
        }
        
        // Valid access code, add user as member
        circle.members.push({
          userId,
          role: 'member',
          status: 'active',
          joinedAt: new Date()
        });
        
        await circle.save();
        
        // Notify circle moderators
        await notifyModerators(circle, userId, 'circle_new_member');
        
        return res.status(200).json({
          success: true,
          message: 'Successfully joined the circle'
        });
      } else {
        // No access code, create join request
        // Check if there's an existing request
        const existingRequest = circle.joinRequests.find(
          req => req.userId.toString() === userId && req.status === 'pending'
        );
        
        if (existingRequest) {
          return res.status(400).json({
            success: false,
            message: 'You already have a pending request to join this circle'
          });
        }
        
        circle.joinRequests.push({
          userId,
          requestedAt: new Date(),
          status: 'pending'
        });
        
        await circle.save();
        
        // Notify circle moderators about join request
        await notifyModerators(circle, userId, 'circle_join_request');
        
        return res.status(200).json({
          success: true,
          message: 'Join request submitted successfully'
        });
      }
    } else {
      // Public circle, join directly
      circle.members.push({
        userId,
        role: 'member',
        status: 'active',
        joinedAt: new Date()
      });
      
      await circle.save();
      
      // Notify circle moderators
      await notifyModerators(circle, userId, 'circle_new_member');
      
      return res.status(200).json({
        success: true,
        message: 'Successfully joined the circle'
      });
    }
    
  } catch (error) {
    console.error('❌ Error joining circle:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not join circle',
      error: error.message
    });
  }
};

/**
 * ✅ Leave a circle
 */
const leaveCircle = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a member
    const memberIndex = circle.members.findIndex(
      member => member.userId.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this circle'
      });
    }
    
    // Check if user is the only admin
    const isAdmin = circle.members[memberIndex].role === 'admin';
    if (isAdmin) {
      const adminCount = circle.members.filter(m => m.role === 'admin').length;
      if (adminCount === 1) {
        // Check if there are other moderators who can be promoted
        const moderators = circle.members.filter(m => m.role === 'moderator');
        
        if (moderators.length > 0) {
          // Promote the first moderator to admin
          const newAdminIndex = circle.members.findIndex(
            m => m.userId.toString() === moderators[0].userId.toString()
          );
          circle.members[newAdminIndex].role = 'admin';
        } else if (circle.members.length > 1) {
          // No moderators, promote the oldest member
          const oldestMember = [...circle.members]
            .filter(m => m.userId.toString() !== userId)
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
          
          const oldestMemberIndex = circle.members.findIndex(
            m => m.userId.toString() === oldestMember.userId.toString()
          );
          
          circle.members[oldestMemberIndex].role = 'admin';
        } else {
          // User is the only member, archive the circle
          circle.status = 'archived';
          await circle.save();
          
          return res.status(200).json({
            success: true,
            message: 'You were the only member. Circle has been archived.'
          });
        }
      }
    }
    
    // Remove user from members array
    circle.members.splice(memberIndex, 1);
    
    // Also remove from moderators array if present
    const modIndex = circle.moderators.findIndex(
      modId => modId.toString() === userId
    );
    if (modIndex !== -1) {
      circle.moderators.splice(modIndex, 1);
    }
    
    await circle.save();
    
    // If user was an admin/moderator, notify other moderators
    if (isAdmin || modIndex !== -1) {
      await notifyModerators(circle, userId, 'circle_moderator_left');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Successfully left the circle'
    });
    
  } catch (error) {
    console.error('❌ Error leaving circle:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not leave circle',
      error: error.message
    });
  }
};

/**
 * ✅ Approve/reject join request
 * - Only accessible by moderators
 */
const handleJoinRequest = async (req, res) => {
  const { circleId, requestId } = req.params;
  const userId = req.user.userId;
  const { action } = req.body; // 'approve' or 'reject'
  
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Action must be either "approve" or "reject"'
    });
  }
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a moderator
    if (!circle.isModerator(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only moderators can handle join requests'
      });
    }
    
    // Find the join request
    const requestIndex = circle.joinRequests.findIndex(
      req => req._id.toString() === requestId
    );
    
    if (requestIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Join request not found'
      });
    }
    
    const request = circle.joinRequests[requestIndex];
    
    // Check if request is already handled
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${request.status}`
      });
    }
    
    if (action === 'approve') {
      // Check if circle is at capacity
      if (circle.memberCount >= circle.memberLimit) {
        return res.status(400).json({
          success: false,
          message: 'This circle has reached its member limit'
        });
      }
      
      // Update request status
      circle.joinRequests[requestIndex].status = 'approved';
      
      // Add user as member
      circle.members.push({
        userId: request.userId,
        role: 'member',
        status: 'active',
        joinedAt: new Date()
      });
      
      await circle.save();
      
      // Notify the user that their request was approved
      await Notification.create({
        userId: request.userId,
        type: 'circle_request_approved',
        message: `Your request to join "${circle.name}" has been approved`,
        reference: {
          type: 'circle',
          id: circle._id
        },
        isRead: false
      });
      
      return res.status(200).json({
        success: true,
        message: 'Join request approved'
      });
      
    } else { // reject
      // Update request status
      circle.joinRequests[requestIndex].status = 'rejected';
      
      await circle.save();
      
      // Notify the user that their request was rejected
      await Notification.create({
        userId: request.userId,
        type: 'circle_request_rejected',
        message: `Your request to join "${circle.name}" has been declined`,
        reference: {
          type: 'circle',
          id: circle._id
        },
        isRead: false
      });
      
      return res.status(200).json({
        success: true,
        message: 'Join request rejected'
      });
    }
    
  } catch (error) {
    console.error('❌ Error handling join request:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not process join request',
      error: error.message
    });
  }
};

/**
 * ✅ Get pending join requests
 * - Only accessible by moderators
 */
const getJoinRequests = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a moderator
    if (!circle.isModerator(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only moderators can view join requests'
      });
    }
    
    // Get pending requests
    const pendingRequests = circle.joinRequests.filter(req => req.status === 'pending');
    
    // Get user details for the requests
    const userIds = pendingRequests.map(req => req.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('username profilePic');
    
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });
    
    const requestsWithUserInfo = pendingRequests.map(req => {
      const user = userMap[req.userId.toString()];
      return {
        _id: req._id,
        userId: req.userId,
        requestedAt: req.requestedAt,
        username: user ? user.username : 'Unknown User',
        profilePic: user ? user.profilePic : ''
      };
    });
    
    return res.status(200).json({
      success: true,
      requests: requestsWithUserInfo
    });
    
  } catch (error) {
    console.error('❌ Error fetching join requests:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch join requests',
      error: error.message
    });
  }
};

/**
 * ✅ Change member role (promote/demote)
 * - Only accessible by admins
 */
const changeMemberRole = async (req, res) => {
  const { circleId, memberId } = req.params;
  const userId = req.user.userId;
  const { role } = req.body;
  
  if (!['member', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Role must be "member", "moderator", or "admin"'
    });
  }
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if requester is an admin
    const requesterIndex = circle.members.findIndex(
      m => m.userId.toString() === userId && m.role === 'admin'
    );
    
    if (requesterIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'Only circle admins can change member roles'
      });
    }
    
    // Find the target member
    const memberIndex = circle.members.findIndex(
      m => m.userId.toString() === memberId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this circle'
      });
    }
    
    // Can't change your own role
    if (memberId === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }
    
    // Update member role
    const oldRole = circle.members[memberIndex].role;
    circle.members[memberIndex].role = role;
    
    // Update moderators array for consistent access
    if (role === 'moderator' || role === 'admin') {
      if (!circle.moderators.includes(memberId)) {
        circle.moderators.push(mongoose.Types.ObjectId(memberId));
      }
    } else {
      // Remove from moderators if demoted
      const modIndex = circle.moderators.findIndex(
        modId => modId.toString() === memberId
      );
      if (modIndex !== -1) {
        circle.moderators.splice(modIndex, 1);
      }
    }
    
    await circle.save();
    
    // Notify the member of their role change
    await Notification.create({
      userId: memberId,
      type: 'circle_role_change',
      message: `Your role in "${circle.name}" has been changed to ${role}`,
      reference: {
        type: 'circle',
        id: circle._id
      },
      isRead: false
    });
    
    return res.status(200).json({
      success: true,
      message: `Member role changed from ${oldRole} to ${role}`
    });
    
  } catch (error) {
    console.error('❌ Error changing member role:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not change member role',
      error: error.message
    });
  }
};

/**
 * ✅ Add a new weekly topic
 * - Only accessible by moderators
 */
const addWeeklyTopic = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  const {
    title,
    description,
    resources = [],
    guideQuestions = [],
    activeFrom,
    activeTo
  } = req.body;
  
  if (!title || !description || !activeFrom || !activeTo) {
    return res.status(400).json({
      success: false,
      message: 'Title, description, activeFrom, and activeTo are required'
    });
  }
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a moderator
    if (!circle.isModerator(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only moderators can add weekly topics'
      });
    }
    
    // Create new topic
    const newTopic = {
      title,
      description,
      resources,
      guideQuestions,
      activeFrom: new Date(activeFrom),
      activeTo: new Date(activeTo),
      createdBy: userId
    };
    
    circle.weeklyTopics.push(newTopic);
    await circle.save();
    
    // Notify all circle members about the new topic
    circle.members.forEach(async (member) => {
      if (member.status === 'active' && member.userId.toString() !== userId) {
        await Notification.create({
          userId: member.userId,
          type: 'circle_new_topic',
          message: `New topic "${title}" added to "${circle.name}"`,
          reference: {
            type: 'circle',
            id: circle._id
          },
          isRead: false
        });
      }
    });
    
    return res.status(201).json({
      success: true,
      message: 'Weekly topic added successfully',
      topic: newTopic
    });
    
  } catch (error) {
    console.error('❌ Error adding weekly topic:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not add weekly topic',
      error: error.message
    });
  }
};

/**
 * ✅ Send a message to the circle
 */
const sendMessage = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  const { 
    content,
    parentMessageId = null,
    attachments = []
  } = req.body;
  
  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required'
    });
  }
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a member
    if (!circle.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only members can send messages to the circle'
      });
    }
    
    // Check if user is muted
    const member = circle.members.find(m => m.userId.toString() === userId);
    if (member.status === 'muted') {
      return res.status(403).json({
        success: false,
        message: 'You are currently muted in this circle'
      });
    }
    
    // If this is a reply, verify parent message exists
    if (parentMessageId) {
      const parentExists = circle.messages.some(
        msg => msg._id.toString() === parentMessageId
      );
      
      if (!parentExists) {
        return res.status(404).json({
          success: false,
          message: 'Parent message not found'
        });
      }
    }
    
    // Create new message
    const newMessage = {
      userId,
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
    
    // Add user details to the message
    const user = await User.findById(userId).select('username profilePic');
    const messageWithUser = {
      ...savedMessage.toObject(),
      user: {
        _id: userId,
        username: user ? user.username : 'Unknown User',
        profilePic: user ? user.profilePic : ''
      }
    };
    
    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      circleMessage: messageWithUser
    });
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not send message',
      error: error.message
    });
  }
};

/**
 * ✅ Get messages from a circle
 * - With pagination
 * - Optionally filtered by topic
 */
const getMessages = async (req, res) => {
  const { circleId } = req.params;
  const userId = req.user.userId;
  const { 
    page = 1, 
    limit = 50,
    topicId = null,
    before = null,
    after = null
  } = req.query;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a member
    if (!circle.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only members can view circle messages'
      });
    }
    
    // Filter messages
    let filteredMessages = circle.messages.filter(msg => !msg.isDeleted);
    
    // Apply time-based filters if provided
    if (before) {
      const beforeDate = new Date(before);
      filteredMessages = filteredMessages.filter(msg => msg.createdAt < beforeDate);
    }
    
    if (after) {
      const afterDate = new Date(after);
      filteredMessages = filteredMessages.filter(msg => msg.createdAt > afterDate);
    }
    
    // If topic ID provided, filter messages by time range of that topic
    if (topicId) {
      const topic = circle.weeklyTopics.find(t => t._id.toString() === topicId);
      if (topic) {
        filteredMessages = filteredMessages.filter(
          msg => msg.createdAt >= topic.activeFrom && msg.createdAt <= topic.activeTo
        );
      }
    }
    
    // Sort by most recent first
    filteredMessages.sort((a, b) => b.createdAt - a.createdAt);
    
    // Apply pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedMessages = filteredMessages.slice(startIndex, endIndex);
    
    // Populate user data for messages
    const userIds = [...new Set(paginatedMessages.map(msg => msg.userId))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('username profilePic')
      .lean();
    
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });
    
    const messagesWithUsers = paginatedMessages.map(msg => {
      const user = userMap[msg.userId.toString()];
      return {
        ...msg.toObject(),
        user: {
          _id: msg.userId,
          username: user ? user.username : 'Unknown User',
          profilePic: user ? user.profilePic : ''
        }
      };
    });
    
    return res.status(200).json({
      success: true,
      messages: messagesWithUsers,
      pagination: {
        total: filteredMessages.length,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(filteredMessages.length / Number(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch messages',
      error: error.message
    });
  }
};

/**
 * ✅ React to a message
 */
const reactToMessage = async (req, res) => {
  const { circleId, messageId } = req.params;
  const userId = req.user.userId;
  const { reactionType } = req.body;
  
  if (!['supportive', 'insightful', 'thankful'].includes(reactionType)) {
    return res.status(400).json({
      success: false,
      message: 'Reaction type must be "supportive", "insightful", or "thankful"'
    });
  }
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Check if user is a member
    if (!circle.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only members can react to messages'
      });
    }
    
    // Find the message
    const messageIndex = circle.messages.findIndex(
      msg => msg._id.toString() === messageId
    );
    
    if (messageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    const message = circle.messages[messageIndex];
    
    // Check if user already reacted
    const existingReactionIndex = message.reactedBy.findIndex(
      r => r.userId.toString() === userId
    );
    
    if (existingReactionIndex !== -1) {
      // User already reacted, check if it's the same reaction
      const existingType = message.reactedBy[existingReactionIndex].reactionType;
      
      if (existingType === reactionType) {
        // Remove reaction (toggle off)
        message.reactions[existingType] -= 1;
        message.reactedBy.splice(existingReactionIndex, 1);
      } else {
        // Change reaction type
        message.reactions[existingType] -= 1;
        message.reactions[reactionType] += 1;
        message.reactedBy[existingReactionIndex].reactionType = reactionType;
      }
    } else {
      // Add new reaction
      message.reactions[reactionType] += 1;
      message.reactedBy.push({
        userId,
        reactionType
      });
      
      // Notify message author if it's not their own message
      if (message.userId.toString() !== userId) {
        await Notification.create({
          userId: message.userId,
          type: 'circle_message_reaction',
          message: `Someone reacted to your message in "${circle.name}"`,
          reference: {
            type: 'circle_message',
            id: message._id,
            parentId: circle._id
          },
          isRead: false
        });
      }
    }
    
    await circle.save();
    
    return res.status(200).json({
      success: true,
      reactions: message.reactions,
      message: 'Reaction updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error reacting to message:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update reaction',
      error: error.message
    });
  }
};

/**
 * ✅ Delete a message
 * - Users can delete their own messages
 * - Moderators can delete any message
 */
const deleteMessage = async (req, res) => {
  const { circleId, messageId } = req.params;
  const userId = req.user.userId;
  
  try {
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Find the message
    const messageIndex = circle.messages.findIndex(
      msg => msg._id.toString() === messageId
    );
    
    if (messageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    const message = circle.messages[messageIndex];
    
    // Check if user is the message author or a moderator
    const isModerator = circle.isModerator(userId);
    const isAuthor = message.userId.toString() === userId;
    
    if (!isAuthor && !isModerator) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }
    
    // Soft delete the message
    circle.messages[messageIndex].isDeleted = true;
    circle.messages[messageIndex].content = 'This message has been deleted';
    circle.messages[messageIndex].attachments = [];
    
    await circle.save();
    
    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not delete message',
      error: error.message
    });
  }
};

/**
 * ✅ Get categories for circles
 */
const getCategories = async (req, res) => {
  try {
    // Get all categories from existing circles
    const categories = await SupportCircle.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    return res.status(200).json({
      success: true,
      categories: categories.map(c => ({
        name: c._id,
        count: c.count
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch categories',
      error: error.message
    });
  }
};

// Helper function to notify circle moderators
const notifyModerators = async (circle, triggerUserId, notificationType) => {
  const moderatorIds = circle.members
    .filter(m => (m.role === 'moderator' || m.role === 'admin') && m.userId.toString() !== triggerUserId)
    .map(m => m.userId);
  
  const triggerUser = await User.findById(triggerUserId).select('username');
  const username = triggerUser ? triggerUser.username : 'A user';
  
  let message = '';
  
  switch (notificationType) {
    case 'circle_new_member':
      message = `${username} joined your circle "${circle.name}"`;
      break;
    case 'circle_join_request':
      message = `${username} requested to join your circle "${circle.name}"`;
      break;
    case 'circle_moderator_left':
      message = `${username} (a moderator) left your circle "${circle.name}"`;
      break;
    default:
      message = `New activity in your circle "${circle.name}"`;
  }
  
  const notifications = moderatorIds.map(modId => ({
    userId: modId,
    type: notificationType,
    message,
    reference: {
      type: 'circle',
      id: circle._id
    },
    isRead: false
  }));
  
  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

// Helper function to generate access code
const generateAccessCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

module.exports = {
  getPublicCircles,
  getUserCircles,
  getCircleDetails,
  createCircle,
  updateCircle,
  joinCircle,
  leaveCircle,
  handleJoinRequest,
  getJoinRequests,
  changeMemberRole,
  addWeeklyTopic,
  sendMessage,
  getMessages,
  reactToMessage,
  deleteMessage,
  getCategories
};