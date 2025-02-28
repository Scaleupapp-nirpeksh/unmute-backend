const { sendOTP, verifyOTP } = require('../services/twilioService');
const User = require('../models/User');
const Vent = require('../models/Vent');
const Match = require('../models/Match');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const natural = require('natural');
const { updateMatchesForUser } = require('../services/matchScoringService'); 
const { storeVentEmbedding, findSimilarVents } = require('../services/pineconeService');
const { connectUsers } = require('../services/neo4jService');
const tokenizer = new natural.WordTokenizer();
const Report = require('../models/Report');

dotenv.config();

/**
 * ✅ Create a new vent
 * - Saves vent in MongoDB
 * - Stores vector embedding in Pinecone
 * - Finds & Updates Matches
 */
const createVent = async (req, res) => {
    const userId = req.user.userId;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is missing' });
    }

    const { title, text, emotion, hashtags = [], issueType = "" } = req.body;
    if (!title || !text || !emotion) {
        return res.status(400).json({ success: false, message: 'Title, text, and emotion are required' });
    }

    try {
        // ✅ Save Vent in MongoDB first
        const newVent = new Vent({ userId, title, text, emotion, hashtags, issueType });
        await newVent.save();

        try {
            // ✅ Store Vent Embedding in Pinecone (Handle Errors)
            await storeVentEmbedding(newVent._id, text, { userId, emotion });
        } catch (pineconeError) {
            console.error("⚠️ Pinecone Storage Failed:", pineconeError);
            // Continue without failing vent creation
        }

        // ✅ Find & Update Matches
        const similarVents = await findSimilarVents(text);
        console.log("🔍 Pinecone found similar vents:", similarVents);
        if (!similarVents || similarVents.length === 0) {
            console.warn("⚠️ No similar vents found, skipping match updates.");
        }
        for (const match of similarVents) {
            const matchUserId = match.metadata.userId;
            if (matchUserId !== userId) {
                await connectUsers(userId, matchUserId, match.score, [emotion]);
                await updateMatchesForUser(matchUserId);
            }
        }
        await updateMatchesForUser(userId);


        res.status(201).json({ success: true, vent: newVent });
    } catch (error) {
        console.error("❌ Error in createVent:", error);
        res.status(500).json({ success: false, message: 'Error creating vent', error });
    }
};


/**
 * ✅ Get all vents (Newest first)
 */
const getVents = async (req, res) => {
    const { sort = 'recent', page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    try {
        let sortQuery = {};

        if (sort === 'trending') {
            sortQuery = { "reactions.heart": -1, "reactions.hug": -1, "reactions.listen": -1 };
        } else { // Default: Recent
            sortQuery = { createdAt: -1 };
        }

        const vents = await Vent.find()
            .sort(sortQuery)
            .skip(skip)
            .limit(Number(limit));

        return res.status(200).json({ success: true, vents });

    } catch (error) {
        console.error("❌ Error fetching vents:", error);
        return res.status(500).json({ success: false, message: 'Error fetching vents', error });
    }
};

/**
 * ✅ Add reaction to a vent
 * - Supports reactions: ['hug', 'heart', 'listen']
 */
const reactToVent = async (req, res) => {
    const userId = req.user.userId;
    const { ventId, reactionType } = req.body;

    if (!ventId || !reactionType || !['hug', 'heart', 'listen'].includes(reactionType)) {
        return res.status(400).json({ success: false, message: 'Invalid reaction type or missing ventId' });
    }

    try {
        const vent = await Vent.findById(ventId);
        if (!vent) {
            return res.status(404).json({ success: false, message: 'Vent not found' });
        }

        // ✅ Increment reaction count atomically
        await Vent.updateOne({ _id: ventId }, { $inc: { [`reactions.${reactionType}`]: 1 } });

        return res.status(200).json({ success: true, message: 'Reaction added' });
    } catch (error) {
        console.error("❌ Error reacting to vent:", error);
        return res.status(500).json({ success: false, message: 'Error reacting to vent', error });
    }
};

/**
 * ✅ Delete a vent & remove its matches
 */
const deleteVent = async (req, res) => {
    const userId = req.user.userId;
    const { ventId } = req.params;

    try {
        const vent = await Vent.findOneAndDelete({ _id: ventId, userId });

        if (!vent) {
            return res.status(404).json({ success: false, message: 'Vent not found or unauthorized' });
        }

        // 🔥 Recalculate matches after deleting a vent
        await updateMatchesForUser(userId);

        return res.status(200).json({ success: true, message: 'Vent deleted successfully' });
    } catch (error) {
        console.error("❌ Error deleting vent:", error);
        return res.status(500).json({ success: false, message: 'Error deleting vent', error });
    }
};

/**
 * ✅ Search vents using MongoDB text search (Optimized)
 */
const searchVents = async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ success: false, message: 'Search query is required' });

    try {
        const vents = await Vent.find({
            $text: { $search: query } // 🔹 Use MongoDB full-text search
        }).sort({ createdAt: -1 });

        return res.status(200).json({ success: true, vents });
    } catch (error) {
        console.error("❌ Error searching vents:", error);
        return res.status(500).json({ success: false, message: 'Error searching vents', error });
    }
};

/**
 * ✅ Get Vent Feeds based on type
 * - `personalized` → Vents from users with similar emotions
 * - `trending` → Most reacted vents in the last 24 hours
 * - `recent` → Latest vents
 */
const getVentFeed = async (req, res) => {
    const userId = req.user.userId;
    const { type = 'personalized', page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    try {
        let vents = [];

        if (type === 'trending') {
            // 🔥 Get vents with most reactions in last 24 hours
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            vents = await Vent.find({ createdAt: { $gte: yesterday } })
                .sort({ "reactions.heart": -1, "reactions.hug": -1, "reactions.listen": -1 }) // Sort by highest reactions
                .skip(skip)
                .limit(Number(limit));
        } 
        
        else if (type === 'recent') {
            // ⏳ Get the most recent vents
            vents = await Vent.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit));
        } 
        
        else { // Default: Personalized Feed
            // 🔍 Get users with past matches & common emotions
            const matchedUsers = await Match.find({ 
                $or: [{ user1: userId }, { user2: userId }],
                status: "accepted"
            });

            const matchedUserIds = matchedUsers.flatMap(match => [match.user1.toString(), match.user2.toString()])
                                               .filter(id => id !== userId);

            // Fetch vents from matched users
            vents = await Vent.find({ userId: { $in: matchedUserIds } })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit));
        }

        return res.status(200).json({ success: true, vents });

    } catch (error) {
        console.error("❌ Error fetching vent feed:", error);
        return res.status(500).json({ success: false, message: 'Error fetching vent feed', error });
    }
};

/**
 * ✅ Report a vent
 */
const reportVent = async (req, res) => {
    const userId = req.user.userId;
    const { ventId, reason } = req.body;

    if (!ventId || !reason) {
        return res.status(400).json({ success: false, message: 'Vent ID and reason are required' });
    }

    try {
        // Check if the vent exists
        const vent = await Vent.findById(ventId);
        if (!vent) {
            return res.status(404).json({ success: false, message: 'Vent not found' });
        }

        // Prevent duplicate reports from the same user
        const existingReport = await Report.findOne({ reportedBy: userId, ventId });
        if (existingReport) {
            return res.status(400).json({ success: false, message: 'You have already reported this vent' });
        }

        // Save the report
        const newReport = new Report({ reportedBy: userId, ventId, reason });
        await newReport.save();

        return res.status(201).json({ success: true, message: 'Vent reported successfully' });

    } catch (error) {
        console.error("❌ Error reporting vent:", error);
        return res.status(500).json({ success: false, message: 'Error reporting vent', error });
    }
};


module.exports = { createVent, getVents, reactToVent, deleteVent, searchVents, getVentFeed, reportVent };

