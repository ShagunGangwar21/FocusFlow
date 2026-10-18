'use strict';

/**
 * backend/src/modules/tasks/tasks.routes.js
 *
 * Express router mounting task endpoints with authentication,
 * CSRF protection, and Zod input validation.
 */

const express = require('express');
const tasksController = require('./tasks.controller');
const timerController = require('../timer/timer.controller');
const {
    createTaskSchema,
    updateTaskSchema,
    completeTaskSchema,
    listTasksQuerySchema,
    taskIdParamSchema,
} = require('./tasks.validation');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { csrfProtection } = require('../../middleware/csrfProtection');

const router = express.Router();

// All task routes require authentication
router.use(authenticate);

// 1. List tasks (with filters, search, pagination)
router.get(
    '/',
    validate(listTasksQuerySchema, 'query'),
    tasksController.listTasks
);

// 2. Create task
router.post(
    '/',
    csrfProtection,
    validate(createTaskSchema, 'body'),
    tasksController.createTask
);

// 3. Get single task by ID
router.get(
    '/:taskId',
    validate(taskIdParamSchema, 'params'),
    tasksController.getTask
);

// 4. Update task details
router.patch(
    '/:taskId',
    csrfProtection,
    validate(taskIdParamSchema, 'params'),
    validate(updateTaskSchema, 'body'),
    tasksController.updateTask
);

// 5. Complete task
router.post(
    '/:taskId/complete',
    csrfProtection,
    validate(taskIdParamSchema, 'params'),
    validate(completeTaskSchema, 'body'),
    tasksController.completeTask
);

// 6. Reopen task
router.post(
    '/:taskId/reopen',
    csrfProtection,
    validate(taskIdParamSchema, 'params'),
    tasksController.reopenTask
);

// 7. Delete task
router.delete(
    '/:taskId',
    csrfProtection,
    validate(taskIdParamSchema, 'params'),
    tasksController.deleteTask
);

// 8. Focus Timer: Start session for task
router.post(
    '/:taskId/sessions',
    csrfProtection,
    validate(taskIdParamSchema, 'params'),
    timerController.startTaskSession
);

// 9. Focus Timer: Get session history for task
router.get(
    '/:taskId/sessions',
    validate(taskIdParamSchema, 'params'),
    timerController.getTaskSessions
);

module.exports = router;
