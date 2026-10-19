'use strict';

/**
 * backend/src/modules/tasks/tasks.validation.js
 *
 * Zod validation schemas for Task Management endpoints.
 * Conforms strictly to docs/API_CONTRACTS.md and database check constraints.
 */

const { z } = require('zod');

// Enums matching schema.prisma
const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const TaskStatusEnum = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'MISSED', 'CANCELLED']);
const ScheduleTypeEnum = z.enum(['FIXED', 'FLEXIBLE']);
const ScopeEnum = z.enum(['PERSONAL', 'TEAM']);

/**
 * Task Creation Schema (POST /api/v1/tasks)
 */
const createTaskSchema = z.object({
    title: z.string().trim().min(1, 'Title is required').max(200, 'Title must not exceed 200 characters'),
    description: z.string().trim().max(2000, 'Description must not exceed 2000 characters').optional().nullable(),
    scope: ScopeEnum.default('PERSONAL'),
    teamId: z.string().cuid().optional().nullable(),
    projectId: z.string().cuid().optional().nullable(),
    startAt: z.string().datetime({ offset: true }).optional().nullable(),
    endAt: z.string().datetime({ offset: true }).optional().nullable(),
    deadlineAt: z.string().datetime({ offset: true }).optional().nullable(),
    estimatedDurationMinutes: z.coerce.number({
        invalid_type_error: 'Please enter a valid number of minutes',
    }).int({
        message: 'Duration must be a whole number of minutes',
    }).min(1, 'Please enter a duration greater than 0 minutes').default(30),
    priority: PriorityEnum.default('MEDIUM'),
    scheduleType: ScheduleTypeEnum.default('FLEXIBLE'),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
}).refine((data) => {
    // Database check constraint: endAt must be > startAt if both are defined
    if (data.startAt && data.endAt) {
        return new Date(data.endAt) > new Date(data.startAt);
    }
    return true;
}, {
    message: 'The task end time must be after its start time.',
    path: ['endAt'],
}).refine((data) => {
    // Database check constraint: scope PERSONAL must not have teamId, scope TEAM requires teamId
    if (data.scope === 'PERSONAL' && data.teamId) {
        return false;
    }
    if (data.scope === 'TEAM' && !data.teamId) {
        return false;
    }
    return true;
}, {
    message: 'Personal tasks cannot have a teamId, and team tasks require a teamId.',
    path: ['teamId'],
});

/**
 * Task Update Schema (PATCH /api/v1/tasks/:taskId)
 */
const updateTaskSchema = z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    projectId: z.string().cuid().optional().nullable(),
    startAt: z.string().datetime({ offset: true }).optional().nullable(),
    endAt: z.string().datetime({ offset: true }).optional().nullable(),
    deadlineAt: z.string().datetime({ offset: true }).optional().nullable(),
    estimatedDurationMinutes: z.coerce.number({
        invalid_type_error: 'Please enter a valid number of minutes',
    }).int({
        message: 'Duration must be a whole number of minutes',
    }).min(1, 'Please enter a duration greater than 0 minutes').optional(),
    priority: PriorityEnum.optional(),
    status: TaskStatusEnum.optional(),
    scheduleType: ScheduleTypeEnum.optional(),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
    version: z.coerce.number().int().min(1, 'Version is required for concurrency control').optional(),
}).refine((data) => {
    if (data.startAt && data.endAt) {
        return new Date(data.endAt) > new Date(data.startAt);
    }
    return true;
}, {
    message: 'The task end time must be after its start time.',
    path: ['endAt'],
});

/**
 * Task Complete Schema (POST /api/v1/tasks/:taskId/complete)
 */
const completeTaskSchema = z.object({
    actualDurationMinutes: z.coerce.number().int().min(0, 'Actual duration must be non-negative').optional().nullable(),
    completionNotes: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Query parameters for Listing Tasks (GET /api/v1/tasks)
 */
const listTasksQuerySchema = z.object({
    scope: ScopeEnum.default('PERSONAL'),
    teamId: z.string().optional(),
    status: z.string().optional(), // Can be comma-separated or single status
    priority: PriorityEnum.optional(),
    scheduleType: ScheduleTypeEnum.optional(),
    search: z.string().trim().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    sortBy: z.enum(['createdAt', 'startAt', 'deadlineAt', 'priority', 'title']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Task ID Parameter Schema (:taskId)
 */
const taskIdParamSchema = z.object({
    taskId: z.string().min(1, 'Task ID is required'),
});

module.exports = {
    createTaskSchema,
    updateTaskSchema,
    completeTaskSchema,
    listTasksQuerySchema,
    taskIdParamSchema,
};
