const User = require('../models/User');
const SupportCircle = require('../models/SupportCircles');
const mongoose = require('mongoose');

/**
 * ✅ Get user's notification settings
 */
const getNotificationSettings = async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const user = await User.findById(userId)
      .select('notifications')
      .lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      settings: user.notifications || {}
    });
    
  } catch (error) {
    console.error('❌ Error fetching notification settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch notification settings',
      error: error.message
    });
  }
};

/**
 * ✅ Update general notification settings
 */
const updateGeneralSettings = async (req, res) => {
  const userId = req.user.userId;
  const {
    enabled,
    pushEnabled,
    emailEnabled,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd
  } = req.body;
  
  try {
    const updateFields = {};
    
    if (enabled !== undefined) updateFields['notifications.enabled'] = enabled;
    if (pushEnabled !== undefined) updateFields['notifications.pushEnabled'] = pushEnabled;
    if (emailEnabled !== undefined) updateFields['notifications.emailEnabled'] = emailEnabled;
    if (quietHoursEnabled !== undefined) updateFields['notifications.quietHoursEnabled'] = quietHoursEnabled;
    if (quietHoursStart) updateFields['notifications.quietHoursStart'] = quietHoursStart;
    if (quietHoursEnd) updateFields['notifications.quietHoursEnd'] = quietHoursEnd;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select('notifications');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully',
      settings: user.notifications
    });
    
  } catch (error) {
    console.error('❌ Error updating notification settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update notification settings',
      error: error.message
    });
  }
};

/**
 * ✅ Update circle notification settings
 */
const updateCircleSettings = async (req, res) => {
  const userId = req.user.userId;
  const {
    newMessage,
    mentions,
    newTopic,
    joinRequests,
    memberJoined,
    messageReactions,
    roleChanges,
    circleUpdates
  } = req.body;
  
  try {
    const updateFields = {};
    
    if (newMessage !== undefined) updateFields['notifications.circles.newMessage'] = newMessage;
    if (mentions !== undefined) updateFields['notifications.circles.mentions'] = mentions;
    if (newTopic !== undefined) updateFields['notifications.circles.newTopic'] = newTopic;
    if (joinRequests !== undefined) updateFields['notifications.circles.joinRequests'] = joinRequests;
    if (memberJoined !== undefined) updateFields['notifications.circles.memberJoined'] = memberJoined;
    if (messageReactions !== undefined) updateFields['notifications.circles.messageReactions'] = messageReactions;
    if (roleChanges !== undefined) updateFields['notifications.circles.roleChanges'] = roleChanges;
    if (circleUpdates !== undefined) updateFields['notifications.circles.circleUpdates'] = circleUpdates;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select('notifications.circles');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Circle notification settings updated successfully',
      settings: user.notifications.circles
    });
    
  } catch (error) {
    console.error('❌ Error updating circle notification settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update circle notification settings',
      error: error.message
    });
  }
};

/**
 * ✅ Update circle-specific notification settings
 */
const updateSpecificCircleSettings = async (req, res) => {
  const userId = req.user.userId;
  const { circleId } = req.params;
  const {
    muted,
    mentionsOnly,
    overrideDefaults,
    settings
  } = req.body;
  
  try {
    // Verify circle exists
    const circle = await SupportCircle.findById(circleId);
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    // Verify user is a member of the circle
    const isMember = circle.members.some(
      m => m.userId.toString() === userId && m.status === 'active'
    );
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of the circle to update notification settings'
      });
    }
    
    // Check if the user already has specific settings for this circle
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Initialize circles notifications if needed
    if (!user.notifications) {
      user.notifications = {};
    }
    if (!user.notifications.circles) {
      user.notifications.circles = {
        circleSpecific: []
      };
    }
    if (!user.notifications.circles.circleSpecific) {
      user.notifications.circles.circleSpecific = [];
    }
    
    // Find existing settings for this circle
    const circleSettingsIndex = user.notifications.circles.circleSpecific.findIndex(
      cs => cs.circleId.toString() === circleId
    );
    
    if (circleSettingsIndex === -1) {
      // Create new circle-specific settings
      const newCircleSettings = {
        circleId: mongoose.Types.ObjectId(circleId),
        muted: muted !== undefined ? muted : false,
        mentionsOnly: mentionsOnly !== undefined ? mentionsOnly : false,
        overrideDefaults: overrideDefaults !== undefined ? overrideDefaults : false
      };
      
      // Add custom settings if provided
      if (settings) {
        newCircleSettings.settings = {
          newMessage: settings.newMessage !== undefined ? settings.newMessage : true,
          mentions: settings.mentions !== undefined ? settings.mentions : true,
          newTopic: settings.newTopic !== undefined ? settings.newTopic : true,
          messageReactions: settings.messageReactions !== undefined ? settings.messageReactions : true
        };
      }
      
      user.notifications.circles.circleSpecific.push(newCircleSettings);
    } else {
      // Update existing circle-specific settings
      if (muted !== undefined) {
        user.notifications.circles.circleSpecific[circleSettingsIndex].muted = muted;
      }
      if (mentionsOnly !== undefined) {
        user.notifications.circles.circleSpecific[circleSettingsIndex].mentionsOnly = mentionsOnly;
      }
      if (overrideDefaults !== undefined) {
        user.notifications.circles.circleSpecific[circleSettingsIndex].overrideDefaults = overrideDefaults;
      }
      
      // Update custom settings if provided
      if (settings) {
        if (!user.notifications.circles.circleSpecific[circleSettingsIndex].settings) {
          user.notifications.circles.circleSpecific[circleSettingsIndex].settings = {};
        }
        
        if (settings.newMessage !== undefined) {
          user.notifications.circles.circleSpecific[circleSettingsIndex].settings.newMessage = settings.newMessage;
        }
        if (settings.mentions !== undefined) {
          user.notifications.circles.circleSpecific[circleSettingsIndex].settings.mentions = settings.mentions;
        }
        if (settings.newTopic !== undefined) {
          user.notifications.circles.circleSpecific[circleSettingsIndex].settings.newTopic = settings.newTopic;
        }
        if (settings.messageReactions !== undefined) {
          user.notifications.circles.circleSpecific[circleSettingsIndex].settings.messageReactions = settings.messageReactions;
        }
      }
    }
    
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'Circle-specific notification settings updated successfully',
      settings: user.notifications.circles.circleSpecific.find(cs => cs.circleId.toString() === circleId)
    });
    
  } catch (error) {
    console.error('❌ Error updating circle-specific notification settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update circle-specific notification settings',
      error: error.message
    });
  }
};

/**
 * ✅ Remove circle-specific settings
 */
const removeCircleSpecificSettings = async (req, res) => {
  const userId = req.user.userId;
  const { circleId } = req.params;
  
  try {
    // Update user document to remove the circle-specific settings
    const result = await User.updateOne(
      { _id: userId },
      { $pull: { 'notifications.circles.circleSpecific': { circleId: mongoose.Types.ObjectId(circleId) } } }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No settings found for this circle'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Circle-specific notification settings removed successfully'
    });
    
  } catch (error) {
    console.error('❌ Error removing circle-specific notification settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not remove circle-specific notification settings',
      error: error.message
    });
  }
};

/**
 * ✅ Mute all notifications for a specified duration
 */
const muteAllNotifications = async (req, res) => {
  const userId = req.user.userId;
  const { duration } = req.body; // Duration in minutes
  
  if (!duration || isNaN(duration) || duration <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid duration (in minutes) is required'
    });
  }
  
  try {
    // Calculate end time of mute period
    const muteUntil = new Date(Date.now() + duration * 60 * 1000);
    
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          'notifications.mutedUntil': muteUntil,
          'notifications.enabled': false 
        } 
      },
      { new: true }
    ).select('notifications');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: `All notifications muted for ${duration} minutes`,
      mutedUntil: muteUntil
    });
    
  } catch (error) {
    console.error('❌ Error muting notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not mute notifications',
      error: error.message
    });
  }
};

/**
 * ✅ Unmute all notifications
 */
const unmuteAllNotifications = async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 'notifications.enabled': true },
        $unset: { 'notifications.mutedUntil': "" }
      },
      { new: true }
    ).select('notifications');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Notifications unmuted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error unmuting notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not unmute notifications',
      error: error.message
    });
  }
};

module.exports = {
  getNotificationSettings,
  updateGeneralSettings,
  updateCircleSettings,
  updateSpecificCircleSettings,
  removeCircleSpecificSettings,
  muteAllNotifications,
  unmuteAllNotifications
};