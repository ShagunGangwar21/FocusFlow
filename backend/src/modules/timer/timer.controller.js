'use strict';

/**
 * backend/src/modules/timer/timer.controller.js
 *
 * Controller handling HTTP requests for focus timers and session history.
 */

const timerService = require('./timer.service');

async function startTaskSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const session = await timerService.startSession(userId, taskId);

        return res.status(201).json({
            data: { session },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getActiveSession(req, res, next) {
    try {
        const userId = req.user.id;
        const session = await timerService.getActiveSession(userId);

        return res.status(200).json({
            data: { session },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function pauseSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const session = await timerService.pauseSession(userId, sessionId);

        return res.status(200).json({
            data: { session },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function resumeSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const session = await timerService.resumeSession(userId, sessionId);

        return res.status(200).json({
            data: { session },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function finishSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { markTaskComplete } = req.body || {};
        const result = await timerService.finishSession(userId, sessionId, {
            markTaskComplete: Boolean(markTaskComplete),
        });

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

async function discardSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const session = await timerService.discardSession(userId, sessionId);

        return res.status(200).json({
            data: { session },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function listSessions(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await timerService.listSessions(userId, req.query);

        return res.status(200).json({
            data: { sessions: result.sessions },
            meta: {
                pagination: result.pagination,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getTaskSessions(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const result = await timerService.getTaskSessions(userId, taskId, req.query);

        return res.status(200).json({
            data: result,
            meta: {
                pagination: result.pagination,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    startTaskSession,
    getActiveSession,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
    listSessions,
    getTaskSessions,
};
