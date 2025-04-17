const Notification = require('../models/Notification');
const User = require('../models/User');
const SupportCircle = require('../models/SupportCircles');

/**
 * ✅ Send a notification respecting user preferences
 * - Handles notification filtering based on user settings
 * - Supports multiple notification types and contexts
 */
const sendNotification = async (options) => {
  const {
    userId,
    type,
    message,
    reference,
    data = {},
    fromUserId = null,
    circleId = null
  } = options;
  
  try {
    // Get user notification preferences
    const user = await User.findById(userId).select('notifications');
    
    if (!user) {
      console.error(`❌ Cannot send notification: User ${userId} not found`);
      return null;
    }
    
    // Check if notifications are enabled at all
    if (!user.notifications || !user.notifications.enabled) {
      console.log(`ℹ️ Notification skipped: Notifications disabled for user ${userId}`);
      return null;
    }
    
    // Check if user is in quiet hours
    if (user.notifications.quietHoursEnabled) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;
      
      const start = user.notifications.quietHoursStart;
      const end = user.notifications.quietHoursEnd;
      
      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      const isInQuietHours = (start <= end) 
        ? (currentTime >= start && currentTime <= end)
        : (currentTime >= start || currentTime <= end);
      
      if (isInQuietHours) {
        console.log(`ℹ️ Notification skipped: User ${userId} is in quiet hours`);
        return null;
      }
    }
    
    // Check if user is in a temporary mute period
    if (user.notifications.mutedUntil && new Date() < new Date(user.notifications.mutedUntil)) {
      console.log(`ℹ️ Notification skipped: User ${userId} has muted all notifications temporarily`);
      return null;
    }
    
    // Filter notification based on type
    let shouldSend = true;
    
    // Journal notifications
    if (type.startsWith('journal_')) {
      if (type === 'journal_reminder' && !user.notifications.journalReminders) {
        shouldSend = false;
      } else if (type === 'journal_streak' && !user.notifications.streakAlerts) {
        shouldSend = false;
      } else if (type === 'journal_insight' && !user.notifications.journalInsights) {
        shouldSend = false;
      }
    }
    
    // Circle notifications
    else if (type.startsWith('circle_')) {
      // If no circle settings, skip circle notifications
      if (!user.notifications.circles) {
        shouldSend = false;
      } else {
        // Check circle-specific settings first if this notification is for a specific circle
        let circleSpecificSettings = null;
        
        if (circleId) {
          circleSpecificSettings = user.notifications.circles.circleSpecific?.find(
            cs => cs.circleId.toString() === circleId
          );
        }
        
        // If circle is muted, skip notification
        if (circleSpecificSettings && circleSpecificSettings.muted) {
          shouldSend = false;
        }
        // If mentions only mode is on, only allow mention notifications
        else if (circleSpecificSettings && circleSpecificSettings.mentionsOnly && type !== 'circle_mention') {
          shouldSend = false;
        }
        // If this circle has custom settings that override defaults
        else if (circleSpecificSettings && circleSpecificSettings.overrideDefaults) {
          switch (type) {
            case 'circle_new_message':
              shouldSend = circleSpecificSettings.settings?.newMessage ?? true;
              break;
            case 'circle_mention':
              shouldSend = circleSpecificSettings.settings?.mentions ?? true;
              break;
            case 'circle_new_topic':
              shouldSend = circleSpecificSettings.settings?.newTopic ?? true;
              break;
            case 'circle_message_reaction':
              shouldSend = circleSpecificSettings.settings?.messageReactions ?? true;
              break;
          }
        }
        // Otherwise, use the global circle notification settings
        else {
          switch (type) {
            case 'circle_new_message':
              shouldSend = user.notifications.circles.newMessage;
              break;
            case 'circle_mention':
              shouldSend = user.notifications.circles.mentions;
              break;
            case 'circle_new_topic':
              shouldSend = user.notifications.circles.newTopic;
              break;
            case 'circle_join_request':
              shouldSend = user.notifications.circles.joinRequests;
              break;
            case 'circle_new_member':
              shouldSend = user.notifications.circles.memberJoined;
              break;
            case 'circle_message_reaction':
              shouldSend = user.notifications.circles.messageReactions;
              break;
            case 'circle_role_change':
              shouldSend = user.notifications.circles.roleChanges;
              break;
            case 'circle_update':
              shouldSend = user.notifications.circles.circleUpdates;
              break;
          }
        }
      }
    }
    
    // If notification should not be sent based on preferences, skip it
    if (!shouldSend) {
      console.log(`ℹ️ Notification skipped: User ${userId} has disabled ${type} notifications`);
      return null;
    }
    
    // Create and save the notification
    const notification = new Notification({
      userId,
      type,
      message,
      reference,
      data,
      fromUserId,
      isRead: false
    });
    
    await notification.save();
    
    // Return the created notification
    return notification;
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return null;
  }
};

/**
 * ✅ Send notifications to circle members
 * - Filters by member roles and notification preferences
 */
const notifyCircleMembers = async (options) => {
  const {
    circleId,
    exceptUserId = null,
    type,
    message,
    reference,
    data = {},
    onlyModerators = false,
    fromUserId = null
  } = options;
  
  try {
    // Get the circle
    const circle = await SupportCircle.findById(circleId);
    
    if (!circle) {
      console.error(`❌ Cannot send circle notification: Circle ${circleId} not found`);
      return [];
    }
    
    // Filter members to notify
    let membersToNotify = circle.members.filter(member => 
      member.status === 'active' &&
      (exceptUserId === null || member.userId.toString() !== exceptUserId)
    );
    
    // If only notifying moderators, filter further
    if (onlyModerators) {
      membersToNotify = membersToNotify.filter(member => 
        member.role === 'moderator' || member.role === 'admin'
      );
    }
    
    // No members to notify
    if (membersToNotify.length === 0) {
      return [];
    }
    
    // Send notifications to each member
    const sentNotifications = [];
    
    for (const member of membersToNotify) {
      const notification = await sendNotification({
        userId: member.userId,
        type,
        message,
        reference,
        data,
        fromUserId,
        circleId
      });
      
      if (notification) {
        sentNotifications.push(notification);
      }
    }
    
    return sentNotifications;
  } catch (error) {
    console.error('❌ Error notifying circle members:', error);
    return [];
  }
};

/**
 * ✅ Mark notifications as read
 */
const markAsRead = async (userId, notificationIds) => {
  try {
    const result = await Notification.updateMany(
      { 
        _id: { $in: notificationIds },
        userId
      },
      { $set: { isRead: true, readAt: new Date() } }
    );
    
    return result.modifiedCount;
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
    return 0;
  }
};

/**
 * ✅ Delete notifications
 */
const deleteNotifications = async (userId, notificationIds) => {
  try {
    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      userId
    });
    
    return result.deletedCount;
  } catch (error) {
    console.error('❌ Error deleting notifications:', error);
    return 0;
  }
};

/**
 * ✅ Get unread notifications count
 */
const getUnreadCount = async (userId) => {
  try {
    const count = await Notification.countDocuments({
      userId,
      isRead: false
    });
    
    return count;
  } catch (error) {
    console.error('❌ Error getting unread notifications count:', error);
    return 0;
  }
};

/**
 * ✅ Get notifications with pagination
 */
const getNotifications = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = null
  } = options;
  
  try {
    // Build query
    const query = { userId };
    
    if (unreadOnly) {
      query.isRead = false;
    }
    
    if (type) {
      query.type = type;
    }
    
    // Execute query with pagination
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    // Get total count for pagination
    const total = await Notification.countDocuments(query);
    
    return {
      notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    return {
      notifications: [],
      pagination: {
        total: 0,
        page: Number(page),
        limit: Number(limit),
        pages: 0
      }
    };
  }
};

module.exports = {
  sendNotification,
  notifyCircleMembers,
  markAsRead,
  deleteNotifications,
  getUnreadCount,
  getNotifications
};