'use strict';

/**
 * backend/src/modules/calendar/calendar.routes.js
 *
 * Express router mounting calendar endpoints.
 */

const express = require('express');
const calendarController = require('./calendar.controller');
const { calendarQuerySchema } = require('./calendar.validation');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/calendar?from=...&to=...&scope=...&teamId=...
router.get(
    '/',
    validate(calendarQuerySchema, 'query'),
    calendarController.getCalendar
);

module.exports = router;
