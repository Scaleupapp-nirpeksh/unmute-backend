const Match = require('../models/Match');
const User = require('../models/User');
const Vent = require('../models/Vent');
const mongoose = require('mongoose');
const { updateMatchesForUser } = require('../services/matchScoringService');
const { connectUsers, removeUserConnection, findUserMatches, getUserConnections } = require('../services/neo4jService');

/**
 * ✅ Get direct match suggestions for a user
 * - Fetches the best **pending matches**
 */
const getMatchSuggestions = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
      status: 'pending',
      matchScore: { $gte: 0.6 }
    }).populate('user1 user2 ventMatches.vent1 ventMatches.vent2');

    res.json({ success: true, matches });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching matches', error });
  }
};

/**
 * ✅ Get Recommended Matches (Friends-of-Friends)
 * - Uses **Neo4j Social Graph**
 */
const getRecommendedMatches = async (req, res) => {
  try {
    const userId = req.user.userId;
    const recommendations = await getUserConnections(userId, { recommended: true });

    res.status(200).json({ success: true, recommendations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching recommended matches', error });
  }
};

/**
 * ✅ Accept a match request
 * - Updates MongoDB **& Neo4j**
 */
const acceptMatch = async (req, res) => {
  const userId = req.user.userId;
  const { matchId } = req.body;

  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    // Identify which user is accepting
    if (match.user1.toString() === userId) {
      match.user1Accepted = true;
    } else if (match.user2.toString() === userId) {
      match.user2Accepted = true;
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized action' });
    }

    // If both users accepted, change status to accepted
    if (match.user1Accepted && match.user2Accepted) {
      match.status = 'accepted';

      // 🔹 Store relationship in Neo4j
      await connectUsers(match.user1.toString(), match.user2.toString(), match.matchScore, match.commonEmotions);
    }

    await match.save();
    return res.status(200).json({ success: true, message: 'Match updated successfully', match });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error accepting match', error });
  }
};



/**
 * ✅ Reject a match request (Now removes it from both users)
 */
const rejectMatch = async (req, res) => {
  const userId = req.user.userId;
  const { matchId } = req.body;

  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    // Once rejected, it should be inactive for both users
    match.status = 'rejected';
    match.user1Accepted = false;
    match.user2Accepted = false;
    await match.save();

    // 🔥 Remove connection from Neo4j to prevent it from appearing again
    await removeUserConnection(match.user1.toString(), match.user2.toString());

    return res.status(200).json({ success: true, message: 'Match rejected and removed for both users' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rejecting match', error });
  }
};




/**
 * ✅ Unmatch a user (Removes from MongoDB & Neo4j)
 */
const unmatchUser = async (req, res) => {
  const userId = req.user.userId;
  const { matchId } = req.body;

  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    // Ensure the requesting user is part of the match
    if (match.user1.toString() === userId || match.user2.toString() === userId) {
      match.status = 'unmatched';
      match.user1Accepted = false;
      match.user2Accepted = false;

      await match.save();

      // 🔹 Remove connection from Neo4j
      await removeUserConnection(match.user1.toString(), match.user2.toString());

      return res.status(200).json({ success: true, message: 'User unmatched' });
    }
    return res.status(403).json({ success: false, message: 'Unauthorized action' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error unmatching user', error });
  }
};


/**
 * ✅ Refresh matches manually
 * - Recalculates matches for a user
 */
const refreshMatches = async (req, res) => {
  try {
    const userId = req.user.userId;
    await updateMatchesForUser(userId);
    return res.status(200).json({ success: true, message: 'Matches updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating matches', error });
  }
};

/**
 * ✅ Get full match insights
 * - Includes **vent matches, emotions & similarity scores**
 */
const getMatchDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }]
    }).populate('user1 user2 ventMatches.vent1 ventMatches.vent2');

    const matchDetails = matches.map(match => ({
      id: match._id,
      user1: match.user1.username,
      user2: match.user2.username,
      matchScore: match.matchScore,
      commonEmotions: match.commonEmotions,
      ventMatches: match.ventMatches.map(v => ({
        vent1: v.vent1.text,
        vent2: v.vent2.text,
        matchScore: v.matchScore
      }))
    }));

    res.status(200).json({ success: true, matchDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching match details', error });
  }
};


/**
 * ✅ Get Pending Matches (Received & Sent Separately)
 * - Shows matches user received **to accept/reject** and matches sent **still pending**
 */
const getPendingMatches = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Matches the user has received (Needs to accept/reject)
    const receivedMatches = await Match.find({
      user2: userId,
      status: 'pending'
    }).populate('user1', 'username');

    // Matches the user has sent (Waiting for user2 to accept/reject)
    const sentMatches = await Match.find({
      user1: userId,
      status: 'pending'
    }).populate('user2', 'username');

    res.status(200).json({
      success: true,
      receivedMatches: receivedMatches.map(m => ({
        matchId: m._id,
        from: m.user1.username,
        matchScore: m.matchScore,
        status: m.status
      })),
      sentMatches: sentMatches.map(m => ({
        matchId: m._id,
        to: m.user2.username,
        matchScore: m.matchScore,
        status: m.status
      }))
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching pending matches', error });
  }
};


/**
 * ✅ Get Match History (Accepted & Rejected)
 * - Shows all matches the user has accepted or rejected
 */
const getMatchHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch matches that were accepted or rejected
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
      status: { $in: ['accepted', 'rejected'] }
    }).populate('user1 user2');

    const history = matches.map(m => ({
      matchId: m._id,
      user1: m.user1.username,
      user2: m.user2.username,
      matchScore: m.matchScore,
      status: m.status,
      timestamp: m.updatedAt
    }));

    res.status(200).json({ success: true, history });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching match history', error });
  }
};


module.exports = { 
  getMatchSuggestions, 
  getRecommendedMatches,
  acceptMatch, 
  rejectMatch, 
  unmatchUser, 
  refreshMatches,
  getMatchDetails,
  getPendingMatches,
  getMatchHistory
};
