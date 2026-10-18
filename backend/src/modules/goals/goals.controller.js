'use strict';

/**
 * backend/src/modules/goals/goals.controller.js
 *
 * Controller handling HTTP requests for Goals.
 * Formats responses in accordance with FocusFlow standard API envelopes.
 */

const goalsService = require('./goals.service');

async function createGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const goal = await goalsService.createGoal(userId, req.body, timezone);

        return res.status(201).json({
            data: { goal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function listGoals(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const goals = await goalsService.listGoals(userId, timezone, req.query);

        return res.status(200).json({
            data: { goals },
            meta: {
                total: goals.length,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const { id } = req.params;
        const goal = await goalsService.getGoalById(userId, id, timezone);

        return res.status(200).json({
            data: { goal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function updateGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const timezone = req.user.timezone || 'UTC';
        const { id } = req.params;
        const goal = await goalsService.updateGoal(userId, id, req.body, timezone);

        return res.status(200).json({
            data: { goal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function deleteGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const result = await goalsService.deleteGoal(userId, id);

        return res.status(200).json({
            data: result,
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createGoal,
    listGoals,
    getGoal,
    updateGoal,
    deleteGoal,
};
