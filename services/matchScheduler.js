const cron = require('node-cron');
const User = require('../models/User');
const { updateMatchesForUser } = require('../services/matchScoringService');

// Function to process all users in parallel
const runMatchUpdateJob = async () => {
    console.log('🔄 Running daily match update job...');

    try {
        const users = await User.find({});
        console.log(`👥 Found ${users.length} users. Processing matches...`);

        // Process all users in parallel using Promise.all()
        const results = await Promise.allSettled(users.map(async (user) => {
            try {
                await updateMatchesForUser(user._id);
                console.log(`✅ Successfully updated matches for user: ${user._id}`);
                return { userId: user._id, status: 'success' };
            } catch (error) {
                console.error(`❌ Error updating matches for user ${user._id}:`, error);
                return { userId: user._id, status: 'failed', error };
            }
        }));

        // Log summary
        const failedUsers = results.filter(res => res.status === 'rejected');
        console.log(`📊 Match update job completed: ${users.length - failedUsers.length} successes, ${failedUsers.length} failures.`);

    } catch (error) {
        console.error('❌ Critical Error: Unable to fetch users for match update:', error);
    }
};

// Schedule job at 12:00 AM daily
cron.schedule('0 0 * * *', runMatchUpdateJob);
