'use strict';

/**
 * backend/src/modules/streaks/streaks.controller.js
 */

const streaksService = require('./streaks.service');

async function getStreakSummary(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const streak = await streaksService.getStreakSummary(userId, timezone);

        return res.status(200).json({
            data: { streak },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getStreakSummary,
};
