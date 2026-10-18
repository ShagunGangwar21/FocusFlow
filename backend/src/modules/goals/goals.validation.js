'use strict';

/**
 * backend/src/modules/goals/goals.validation.js
 *
 * Zod validation schemas for FocusFlow Goal endpoints.
 * Conforms to Prisma schema enums (GoalType, GoalPeriod) and database check constraints.
 */

const { z } = require('zod');

const GoalTypeEnum = z.enum(['FOCUS_TIME', 'TASK_COMPLETION']);
const GoalPeriodEnum = z.enum(['DAILY', 'WEEKLY']);

/**
 * Goal ID param validation
 */
const goalIdParamSchema = z.object({
    id: z.string().min(1, 'Goal ID is required').trim(),
});

/**
 * Goal creation schema (POST /api/v1/goals)
 */
const createGoalSchema = z.object({
    type: GoalTypeEnum,
    targetValue: z.coerce
        .number({ invalid_type_error: 'Target value must be a number' })
        .int('Target value must be an integer')
        .positive('Target value must be a positive integer (> 0)'),
    period: GoalPeriodEnum,
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
    teamId: z.string().cuid().optional().nullable(),
}).refine(
    (data) => {
        if (data.startsAt && data.endsAt) {
            return new Date(data.endsAt) > new Date(data.startsAt);
        }
        return true;
    },
    {
        message: 'Goal end date must be after the start date',
        path: ['endsAt'],
    }
);

/**
 * Goal update schema (PATCH /api/v1/goals/:id)
 */
const updateGoalSchema = z.object({
    type: GoalTypeEnum.optional(),
    targetValue: z.coerce
        .number({ invalid_type_error: 'Target value must be a number' })
        .int('Target value must be an integer')
        .positive('Target value must be a positive integer (> 0)')
        .optional(),
    period: GoalPeriodEnum.optional(),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
}).refine(
    (data) => {
        if (data.startsAt && data.endsAt) {
            return new Date(data.endsAt) > new Date(data.startsAt);
        }
        return true;
    },
    {
        message: 'Goal end date must be after the start date',
        path: ['endsAt'],
    }
).refine(
    (data) => Object.keys(data).length > 0,
    {
        message: 'At least one field must be provided for update',
    }
);

/**
 * Query schema for listing goals (GET /api/v1/goals)
 */
const listGoalsQuerySchema = z.object({
    period: GoalPeriodEnum.optional(),
    teamId: z.string().cuid().optional(),
    scope: z.enum(['PERSONAL', 'TEAM']).optional(),
});

module.exports = {
    goalIdParamSchema,
    createGoalSchema,
    updateGoalSchema,
    listGoalsQuerySchema,
    GoalTypeEnum,
    GoalPeriodEnum,
};
