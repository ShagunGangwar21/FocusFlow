'use strict';

/**
 * backend/src/modules/scheduling/scheduling.routes.js
 *
 * Express router mounting scheduling and conflict recovery endpoints.
 */

const express = require('express');
const schedulingController = require('./scheduling.controller');
const {
    conflictsQuerySchema,
    analyzeScheduleSchema,
    createProposalSchema,
    acceptProposalSchema,
    proposalIdParamSchema,
} = require('./scheduling.validation');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { csrfProtection } = require('../../middleware/csrfProtection');

const router = express.Router();

router.use(authenticate);

// 1. Detect conflicts: GET /api/v1/scheduling/conflicts
router.get(
    '/conflicts',
    validate(conflictsQuerySchema, 'query'),
    schedulingController.getConflicts
);

// 2. Analyze schedule for a date: POST /api/v1/scheduling/analyze
router.post(
    '/analyze',
    csrfProtection,
    validate(analyzeScheduleSchema, 'body'),
    schedulingController.analyzeSchedule
);

// 3. Create schedule recovery proposal: POST /api/v1/scheduling/proposals
router.post(
    '/proposals',
    csrfProtection,
    validate(createProposalSchema, 'body'),
    schedulingController.createProposal
);

// 4. Get proposal details: GET /api/v1/scheduling/proposals/:proposalId
router.get(
    '/proposals/:proposalId',
    validate(proposalIdParamSchema, 'params'),
    schedulingController.getProposal
);

// 5. Accept proposal: POST /api/v1/scheduling/proposals/:proposalId/accept
router.post(
    '/proposals/:proposalId/accept',
    csrfProtection,
    validate(proposalIdParamSchema, 'params'),
    validate(acceptProposalSchema, 'body'),
    schedulingController.acceptProposal
);

// 6. Reject proposal: POST /api/v1/scheduling/proposals/:proposalId/reject
router.post(
    '/proposals/:proposalId/reject',
    csrfProtection,
    validate(proposalIdParamSchema, 'params'),
    schedulingController.rejectProposal
);

module.exports = router;
