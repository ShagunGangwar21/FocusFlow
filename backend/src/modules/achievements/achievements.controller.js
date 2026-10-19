'use strict';

/**
 * backend/src/modules/achievements/achievements.controller.js
 */

const achievementsService = require('./achievements.service');

async function listAchievements(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const achievements = await achievementsService.getUserAchievements(userId, timezone);

        return res.status(200).json({
            data: { achievements },
            meta: {
                total: achievements.length,
                unlockedCount: achievements.filter((a) => a.unlocked).length,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listAchievements,
};
