'use strict';

/**
 * backend/src/modules/scheduling/scheduling.validation.js
 *
 * Zod validation schemas for Scheduling & Conflict Recovery endpoints.
 */

const { z } = require('zod');

const conflictsQuerySchema = z.object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    scope: z.enum(['PERSONAL', 'TEAM']).default('PERSONAL'),
    teamId: z.string().cuid().optional().nullable(),
});

const analyzeScheduleSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    timezone: z.string().default('UTC'),
    scope: z.enum(['PERSONAL', 'TEAM']).default('PERSONAL'),
    teamId: z.string().cuid().optional().nullable(),
});

const createProposalSchema = z.object({
    overrunTaskId: z.string().cuid().optional().nullable(),
    extensionMinutes: z.coerce.number().int().min(5, 'Extension must be at least 5 minutes').max(480).optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional().nullable(),
    conflictTaskIds: z.array(z.string().cuid()).optional().default([]),
    reason: z.string().max(500).optional(),
}).refine((data) => {
    // Either overrunTaskId + extensionMinutes, or date / conflictTaskIds must be provided
    return Boolean((data.overrunTaskId && data.extensionMinutes) || data.date || (data.conflictTaskIds && data.conflictTaskIds.length > 0));
}, {
    message: 'Either overrunTaskId with extensionMinutes, or date/conflictTaskIds is required to generate a recovery proposal.',
});

const acceptProposalSchema = z.object({
    taskVersions: z.array(
        z.object({
            taskId: z.string().cuid('Each taskId must be a valid CUID'),
            version: z.coerce.number().int('version must be an integer'),
        })
    ).min(1, 'taskVersions must contain at least one task version entry'),
    acceptedFixedTaskIds: z.array(z.string().cuid()).default([]),
});

const proposalIdParamSchema = z.object({
    proposalId: z.string().cuid('proposalId must be a valid CUID'),
});

module.exports = {
    conflictsQuerySchema,
    analyzeScheduleSchema,
    createProposalSchema,
    acceptProposalSchema,
    proposalIdParamSchema,
};
