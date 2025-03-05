const { sendOTP, verifyOTP } = require('../services/twilioService');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

dotenv.config();

const generateReadableUsername = () => {
  const adjectives = [
    'Peaceful', 'Hopeful', 'Serene', 'Cheerful', 'Bright',
    'Gentle', 'Joyful', 'Calm', 'Radiant', 'Lively',
    'Tranquil', 'Mellow', 'Blissful', 'Uplifting', 'Harmonious',
    'Zen', 'Balanced', 'Soothing', 'Rejuvenated', 'Ethereal'
  ];
  const nouns = [
    'Sunrise', 'Butterfly', 'Rainbow', 'Breeze', 'Meadow',
    'Blossom', 'Oasis', 'Harmony', 'Star', 'Wave',
    'Garden', 'Spirit', 'Journey', 'Solace', 'Haven',
    'Paradise', 'Aura', 'Cloud', 'Dawn', 'Serenity'
  ];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
};


const requestOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

  const response = await sendOTP(phone);
  if (!response.success) return res.status(500).json(response);

  return res.status(200).json({ success: true, message: 'OTP Sent' });
};

const verifyUserOTP = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone & OTP required' });

  const response = await verifyOTP(phone, otp);
  if (!response.success) return res.status(400).json(response);

  let user = await User.findOne({ phone });
  let isNewUser = false;

  // If user does not exist, create a new one
  if (!user) {
    isNewUser = true;  // ✅ Set flag for new user
    user = new User({ phone, username: generateReadableUsername() });
    await user.save();
  }

  // Generate JWT Token
  const token = jwt.sign({ userId: user._id, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: '7d' });

  return res.status(200).json({ 
    success: true, 
    message: 'OTP Verified', 
    token, 
    user, 
    isNewUser  // ✅ Add this flag in response
  });
};


const changeUsername = async (req, res) => {
  const { newUsername } = req.body;
  const userId = req.user.userId;
  if (!newUsername) return res.status(400).json({ success: false, message: 'New username is required' });

  const existingUser = await User.findOne({ username: newUsername });
  if (existingUser) return res.status(400).json({ success: false, message: 'Username already taken' });

  const user = await User.findByIdAndUpdate(userId, { username: newUsername }, { new: true });
  // Generate (or reuse) a valid token. For example, generate a new JWT:
 // const token = jwt.sign({ userId: user._id, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: '7d' });

  return res.status(200).json({ success: true, message: 'Username updated successfully', user });
};



const updateUserDetails = async (req, res) => {
  const userId = req.user.userId;
  const { bio, interests, likes, dislikes, preferences, allowComments } = req.body;

  try {
      const updateFields = {
          bio,
          interests,
          likes,
          dislikes,
          preferences
      };

      // ✅ Only update `allowComments` if provided in the request
      if (allowComments !== undefined) {
          updateFields.allowComments = allowComments;
      }

      const user = await User.findByIdAndUpdate(userId, updateFields, { new: true });

      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      return res.status(200).json({ 
          success: true, 
          message: 'User details updated successfully', 
          user 
      });

  } catch (error) {
      console.error("❌ Error updating user details:", error);
      return res.status(500).json({ success: false, message: 'Error updating user details', error });
  }
};



  const getUserDetails = async (req, res) => {
    const { userId } = req.params; // Can be a different userId or self
  
    try {
      const user = await User.findById(userId).select('-phone'); // Exclude phone for privacy
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  
      return res.status(200).json({ success: true, user });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Error fetching user details', error });
    }
  };

module.exports = { requestOTP, verifyUserOTP, changeUsername, updateUserDetails , getUserDetails};

