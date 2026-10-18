'use strict';

/**
 * backend/src/modules/timer/timer.validation.js
 *
 * Zod validation schemas for Focus Timer and Session endpoints.
 */

const { z } = require('zod');

const sessionIdParamSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required').trim(),
});

const taskIdParamSchema = z.object({
    taskId: z.string().min(1, 'Task ID is required').trim(),
});

const finishSessionSchema = z.object({
    markTaskComplete: z.boolean().optional().default(false),
});

const listSessionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['RUNNING', 'PAUSED', 'COMPLETED', 'DISCARDED']).optional(),
    taskId: z.string().optional(),
});

module.exports = {
    sessionIdParamSchema,
    taskIdParamSchema,
    finishSessionSchema,
    listSessionsQuerySchema,
};
