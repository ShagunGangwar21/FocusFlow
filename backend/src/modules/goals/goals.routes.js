'use strict';

/**
 * backend/src/modules/goals/goals.routes.js
 *
 * Express router mounting Goal endpoints with authentication,
 * CSRF protection, and Zod input validation.
 */

const express = require('express');
const goalsController = require('./goals.controller');
const {
    goalIdParamSchema,
    createGoalSchema,
    updateGoalSchema,
    listGoalsQuerySchema,
} = require('./goals.validation');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { csrfProtection } = require('../../middleware/csrfProtection');

const router = express.Router();

// All goal routes require authentication
router.use(authenticate);

// 1. List goals with calculated progress
router.get(
    '/',
    validate(listGoalsQuerySchema, 'query'),
    goalsController.listGoals
);

// 2. Create goal
router.post(
    '/',
    csrfProtection,
    validate(createGoalSchema, 'body'),
    goalsController.createGoal
);

// 3. Get single goal by ID
router.get(
    '/:id',
    validate(goalIdParamSchema, 'params'),
    goalsController.getGoal
);

// 4. Update goal
router.patch(
    '/:id',
    csrfProtection,
    validate(goalIdParamSchema, 'params'),
    validate(updateGoalSchema, 'body'),
    goalsController.updateGoal
);

// 5. Delete goal
router.delete(
    '/:id',
    csrfProtection,
    validate(goalIdParamSchema, 'params'),
    goalsController.deleteGoal
);

module.exports = router;
