'use strict';

/**
 * backend/src/modules/streaks/streaks.routes.js
 */

const express = require('express');
const streaksController = require('./streaks.controller');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/streaks/summary
router.get('/summary', streaksController.getStreakSummary);

module.exports = router;
