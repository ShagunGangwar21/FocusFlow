'use strict';

/**
 * backend/src/modules/timer/timer.routes.js
 *
 * Express router mounting focus session endpoints with authentication,
 * CSRF protection, and Zod validation.
 */

const express = require('express');
const timerController = require('./timer.controller');
const {
    sessionIdParamSchema,
    finishSessionSchema,
    listSessionsQuerySchema,
} = require('./timer.validation');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { csrfProtection } = require('../../middleware/csrfProtection');

const router = express.Router();

router.use(authenticate);

// 1. Get current active/paused session
router.get('/active', timerController.getActiveSession);

// 2. List session history (paginated)
router.get(
    '/',
    validate(listSessionsQuerySchema, 'query'),
    timerController.listSessions
);

// 3. Pause active session
router.post(
    '/:sessionId/pause',
    csrfProtection,
    validate(sessionIdParamSchema, 'params'),
    timerController.pauseSession
);

// 4. Resume paused session
router.post(
    '/:sessionId/resume',
    csrfProtection,
    validate(sessionIdParamSchema, 'params'),
    timerController.resumeSession
);

// 5. Finish session
router.post(
    '/:sessionId/finish',
    csrfProtection,
    validate(sessionIdParamSchema, 'params'),
    validate(finishSessionSchema, 'body'),
    timerController.finishSession
);

// 6. Discard session
router.post(
    '/:sessionId/discard',
    csrfProtection,
    validate(sessionIdParamSchema, 'params'),
    timerController.discardSession
);

module.exports = router;
