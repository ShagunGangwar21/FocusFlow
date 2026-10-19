'use strict';

/**
 * backend/src/modules/analytics/analytics.controller.js
 */

const analyticsService = require('./analytics.service');

async function getSummary(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const summary = await analyticsService.getAnalyticsSummary(userId, timezone, req.query);

        return res.status(200).json({
            data: { summary },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getWeeklyReview(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const review = await analyticsService.getWeeklyReview(userId, timezone, req.query);

        return res.status(200).json({
            data: { review },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getSummary,
    getWeeklyReview,
};
