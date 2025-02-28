const Report = require('../models/Report');
const Vent = require('../models/Vent');
const User = require('../models/User');

const FLAG_THRESHOLD = 3;  // 🚨 Auto-flag vent after 3 reports

/**
 * ✅ Get all reports (Unreviewed first)
 * - Fetches reports on vents & chats
 */
const getReports = async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('reportedBy', 'username')  // Get reporting user's username
            .populate('ventId', 'text userId flagged')  // Fetch vent details
            .populate('chatId', 'messages participants')  // Fetch chat details
            .sort({ reviewedAt: 1, createdAt: -1 });  // Show unreviewed reports first

        return res.status(200).json({ success: true, reports });
    } catch (error) {
        console.error("❌ Error fetching reports:", error);
        return res.status(500).json({ success: false, message: 'Error fetching reports', error });
    }
};

/**
 * ✅ Review & resolve a report
 * - Dismiss or delete reported content (vent/chat)
 */
const reviewReport = async (req, res) => {
    const { reportId, action } = req.body;

    if (!reportId || !['dismiss', 'delete'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    try {
        const report = await Report.findById(reportId);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

        // Mark report as reviewed
        report.reviewedAt = new Date();
        await report.save();

        if (action === 'delete') {
            if (report.ventId) {
                await Vent.findByIdAndDelete(report.ventId);
            } else if (report.chatId) {
                await Chat.findByIdAndDelete(report.chatId);
            }
        }

        return res.status(200).json({ success: true, message: `Report ${action} successfully` });

    } catch (error) {
        console.error("❌ Error reviewing report:", error);
        return res.status(500).json({ success: false, message: 'Error reviewing report', error });
    }
};

/**
 * ✅ Auto-flag vents with multiple reports
 */
const autoFlagVents = async () => {
    try {
        const flaggedVents = await Report.aggregate([
            { $group: { _id: "$ventId", count: { $sum: 1 } } },
            { $match: { count: { $gte: FLAG_THRESHOLD } } }
        ]);

        const ventIds = flaggedVents.map(v => v._id);
        if (ventIds.length > 0) {
            await Vent.updateMany({ _id: { $in: ventIds } }, { $set: { flagged: true } });
            console.log(`🚨 Auto-flagged ${ventIds.length} vents for review.`);
        }
    } catch (error) {
        console.error("❌ Error auto-flagging vents:", error);
    }
};

/**
 * ✅ Get flagged vents (For Admin Review)
 */
const getFlaggedVents = async (req, res) => {
    try {
        const flaggedVents = await Vent.find({ flagged: true })
            .populate('userId', 'username');

        return res.status(200).json({ success: true, flaggedVents });
    } catch (error) {
        console.error("❌ Error fetching flagged vents:", error);
        return res.status(500).json({ success: false, message: 'Error fetching flagged vents', error });
    }
};

/**
 * ✅ Clear flagged status from a vent
 */
const clearFlaggedVent = async (req, res) => {
    const { ventId } = req.body;

    if (!ventId) {
        return res.status(400).json({ success: false, message: 'Vent ID is required' });
    }

    try {
        await Vent.findByIdAndUpdate(ventId, { $set: { flagged: false } });
        return res.status(200).json({ success: true, message: 'Vent unflagged successfully' });
    } catch (error) {
        console.error("❌ Error unflagging vent:", error);
        return res.status(500).json({ success: false, message: 'Error unflagging vent', error });
    }
};

module.exports = {
    getReports,
    reviewReport,
    autoFlagVents,
    getFlaggedVents,
    clearFlaggedVent
};
