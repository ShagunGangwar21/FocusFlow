'use strict';

/**
 * backend/src/modules/scheduling/scheduling.controller.js
 *
 * Controller handling HTTP requests for the Scheduling & Conflict Recovery module.
 */

const schedulingService = require('./scheduling.service');

async function getConflicts(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await schedulingService.detectConflicts(userId, req.query);

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

async function analyzeSchedule(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await schedulingService.analyzeSchedule(userId, req.body);

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

async function createProposal(req, res, next) {
    try {
        const userId = req.user.id;
        const proposal = await schedulingService.generateProposal(userId, req.body);

        return res.status(201).json({
            data: { proposal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function getProposal(req, res, next) {
    try {
        const userId = req.user.id;
        const { proposalId } = req.params;
        const proposal = await schedulingService.getProposalById(userId, proposalId);

        return res.status(200).json({
            data: { proposal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function acceptProposal(req, res, next) {
    try {
        const userId = req.user.id;
        const { proposalId } = req.params;
        const result = await schedulingService.acceptProposal(userId, proposalId, req.body);

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

async function rejectProposal(req, res, next) {
    try {
        const userId = req.user.id;
        const { proposalId } = req.params;
        const proposal = await schedulingService.rejectProposal(userId, proposalId);

        return res.status(200).json({
            data: { proposal },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getConflicts,
    analyzeSchedule,
    createProposal,
    getProposal,
    acceptProposal,
    rejectProposal,
};
