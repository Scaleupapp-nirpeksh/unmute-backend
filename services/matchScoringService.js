const natural = require('natural');
const Vent = require('../models/Vent');
const Match = require('../models/Match');

const tokenizer = new natural.WordTokenizer();
const stopwords = new Set(natural.stopwords);

/**
 * ✅ Converts text into a TF-IDF vector representation.
 */
const textToVector = (text) => {
    const words = tokenizer.tokenize(text.toLowerCase()).filter(word => !stopwords.has(word));
    const wordFreq = {};
    words.forEach(word => wordFreq[word] = (wordFreq[word] || 0) + 1);
    return wordFreq;
};

/**
 * ✅ Computes cosine similarity between two TF-IDF vectors.
 */
const cosineSimilarity = (vecA, vecB) => {
    const intersection = Object.keys(vecA).filter(word => vecB[word]);
    const dotProduct = intersection.reduce((sum, word) => sum + (vecA[word] * vecB[word]), 0);
    const magnitudeA = Math.sqrt(Object.values(vecA).reduce((sum, val) => sum + val ** 2, 0));
    const magnitudeB = Math.sqrt(Object.values(vecB).reduce((sum, val) => sum + val ** 2, 0));

    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
};

/**
 * ✅ Updates match scores when a user creates or deletes a vent.
 */
const updateMatchesForUser = async (userId) => {
    console.log(`🔄 Updating matches for user: ${userId}`);

    if (!userId) {
        console.warn(`⚠️ Skipping match update due to missing userId`);
        return;
    }

    // Fetch user's vents
    const userVents = await Vent.find({ userId }).lean();
    if (userVents.length === 0) {
        console.log(`⚠️ User ${userId} has no vents. Clearing matches.`);
        await Match.deleteMany({ $or: [{ user1: userId }, { user2: userId }] });
        return;
    }

    // Fetch vents from all other users
    const allOtherUsersVents = await Vent.find({ userId: { $ne: userId } }).lean();
    if (allOtherUsersVents.length === 0) {
        console.log(`⚠️ No other vents found. Skipping match update.`);
        return;
    }

    const bulkOps = new Map(); // Prevent duplicate match updates

    for (const vent of userVents) {
        const ventVector = textToVector(vent.text);

        for (const otherVent of allOtherUsersVents) {
            const otherVentVector = textToVector(otherVent.text);
            const similarityScore = cosineSimilarity(ventVector, otherVentVector);

            if (similarityScore >= 0.3) {
                let matchUserId = otherVent.userId?.toString();
                if (!matchUserId || userId === matchUserId) continue;

                // 🔹 Ensure Consistent User Ordering
                const [user1, user2] = userId < matchUserId ? [userId, matchUserId] : [matchUserId, userId];
                const matchKey = `${user1}-${user2}`;

                if (!bulkOps.has(matchKey)) {
                    bulkOps.set(matchKey, {
                        updateOne: {
                            filter: { user1, user2 },
                            update: {
                                $setOnInsert: { status: 'pending' }, // Only set if document doesn't exist
                                $set: { updatedAt: new Date() }, // Update timestamp
                                $inc: { matchScore: similarityScore / 2 },
                                $addToSet: {
                                    commonEmotions: { $each: [vent.emotion, otherVent.emotion] },
                                    ventMatches: {
                                        $each: [
                                            {
                                                vent1: vent._id,
                                                vent2: otherVent._id,
                                                matchScore: similarityScore
                                            }
                                        ]
                                    }
                                }
                            },
                            upsert: true
                        }
                    });
                } else {
                    // Update existing match entry safely
                    const existingMatch = bulkOps.get(matchKey);
                
                    if (!existingMatch.updateOne.update.$addToSet) {
                        existingMatch.updateOne.update.$addToSet = {
                            ventMatches: { $each: [] },
                            commonEmotions: { $each: [] }
                        };
                    }
                
                    // Prevent duplicate vent matches
                    const existingVentPairs = existingMatch.updateOne.update.$addToSet.ventMatches.$each;
                    const isDuplicate = existingVentPairs.some(
                        (vm) => (vm.vent1.toString() === vent._id.toString() && vm.vent2.toString() === otherVent._id.toString()) ||
                                (vm.vent1.toString() === otherVent._id.toString() && vm.vent2.toString() === vent._id.toString())
                    );
                
                    if (!isDuplicate) {
                        existingMatch.updateOne.update.$addToSet.ventMatches.$each.push({
                            vent1: vent._id,
                            vent2: otherVent._id,
                            matchScore: similarityScore
                        });
                    }
                
                    existingMatch.updateOne.update.$inc.matchScore += similarityScore / 2;
                    existingMatch.updateOne.update.$addToSet.commonEmotions.$each.push(vent.emotion, otherVent.emotion);
                }
            }
        }
    }

    if (bulkOps.size > 0) {
        try {
            console.log(`🚀 Bulk writing ${bulkOps.size} match updates...`);
            await Match.bulkWrite([...bulkOps.values()]);
            console.log(`✅ Successfully updated ${bulkOps.size} matches.`);
        } catch (error) {
            console.error("❌ Error in bulk match update:", error);
        }
    } else {
        console.log("⚠️ No valid match operations found. Investigate why.");
    }
};

module.exports = { updateMatchesForUser };
