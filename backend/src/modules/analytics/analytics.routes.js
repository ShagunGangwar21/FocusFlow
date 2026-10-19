'use strict';

/**
 * backend/src/modules/analytics/analytics.routes.js
 */

const express = require('express');
const analyticsController = require('./analytics.controller');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

// 1. GET /api/v1/analytics/summary
router.get('/summary', analyticsController.getSummary);

// 2. GET /api/v1/analytics/weekly-review
router.get('/weekly-review', analyticsController.getWeeklyReview);

module.exports = router;
