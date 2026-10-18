'use strict';

/**
 * backend/src/modules/tasks/tasks.controller.js
 *
 * Controller handling HTTP requests for task management.
 * Formats responses in accordance with FocusFlow API envelopes.
 */

const tasksService = require('./tasks.service');

async function createTask(req, res, next) {
    try {
        const userId = req.user.id;
        const task = await tasksService.createTask(userId, req.body);

        return res.status(201).json({
            data: { task },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function listTasks(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await tasksService.listTasks(userId, req.query);

        return res.status(200).json({
            data: { tasks: result.tasks },
            meta: {
                pagination: result.pagination,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const task = await tasksService.getTaskById(userId, taskId);

        return res.status(200).json({
            data: { task },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function updateTask(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const task = await tasksService.updateTask(userId, taskId, req.body);

        return res.status(200).json({
            data: { task },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function completeTask(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const task = await tasksService.completeTask(userId, taskId, req.body);

        return res.status(200).json({
            data: { task },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function reopenTask(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const task = await tasksService.reopenTask(userId, taskId);

        return res.status(200).json({
            data: { task },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function deleteTask(req, res, next) {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const result = await tasksService.deleteTask(userId, taskId);

        return res.status(200).json({
            data: {
                message: 'Task deleted successfully',
                id: result.id,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createTask,
    listTasks,
    getTask,
    updateTask,
    completeTask,
    reopenTask,
    deleteTask,
};
