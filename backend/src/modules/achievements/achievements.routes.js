'use strict';

/**
 * backend/src/modules/achievements/achievements.routes.js
 */

const express = require('express');
const achievementsController = require('./achievements.controller');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/achievements
router.get('/', achievementsController.listAchievements);

module.exports = router;
