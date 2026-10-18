'use strict';

/**
 * backend/src/modules/goals/goals.service.js
 *
 * Core business logic and progress evaluation engine for FocusFlow Goals.
 * Strictly scopes personal goals to the authenticated user's ID.
 * Calculates focus-time progress from completed TimerSession records and
 * task-completion progress from completed Task records.
 * Uses the user's configured IANA timezone for accurate day/week boundaries.
 */

const { getPrisma } = require('../../../db/prisma');
const {
    NotFoundError,
    ForbiddenError,
    BadRequestError,
} = require('../../shared/errors/AppError');

/**
 * Calculates start of day in a specific IANA timeZone as a UTC Date.
 * Handles daylight saving and arbitrary timezone offsets safely.
 */
function getStartOfDayInTimezone(date, timeZone = 'UTC') {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const dateStr = formatter.format(date); // YYYY-MM-DD in user's timezone
        const [year, month, day] = dateStr.split('-').map(Number);

        // Approximate UTC timestamp for midnight on that date
        const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        // Compute timezone offset differential
        const invUtc = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
        const invTarget = new Date(utcMidnight.toLocaleString('en-US', { timeZone }));
        const diffMs = invUtc.getTime() - invTarget.getTime();

        return new Date(utcMidnight.getTime() + diffMs);
    } catch (err) {
        // Fallback to UTC start of day if timezone is invalid
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }
}

/**
 * Calculates the period bounds [start, end] for DAILY or WEEKLY goals in the user's timezone.
 * Week starts on Monday per FocusFlow project conventions.
 */
function getPeriodBounds(period, timeZone = 'UTC', refDate = new Date()) {
    const dayStart = getStartOfDayInTimezone(refDate, timeZone);

    if (period === 'DAILY') {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        return { start: dayStart, end: dayEnd };
    }

    // WEEKLY: Monday start
    let weekday = 'Mon';
    try {
        weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(refDate);
    } catch (e) {
        // Fallback
    }

    const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const daysSinceMonday = weekdayMap[weekday] !== undefined ? weekdayMap[weekday] : 0;

    // Shift to Monday midday to avoid daylight saving edge skips, then get start of that day
    const mondayApprox = new Date(dayStart.getTime() - daysSinceMonday * 86400000 + 43200000);
    const weekStart = getStartOfDayInTimezone(mondayApprox, timeZone);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1);

    return { start: weekStart, end: weekEnd };
}

/**
 * Verifies active team membership for team-scoped operations.
 */
async function verifyActiveMembership(prisma, teamId, userId) {
    const membership = await prisma.teamMembership.findFirst({
        where: {
            teamId,
            userId,
            status: 'ACTIVE',
        },
    });
    if (!membership) {
        throw new ForbiddenError('You are not an active member of this team');
    }
    return membership;
}

/**
 * Calculates progress for a goal based on authoritative database records.
 * - FOCUS_TIME: aggregated durationSeconds from COMPLETED TimerSession records (converted to minutes).
 * - TASK_COMPLETION: count of COMPLETED Task records with completedAt timestamp in period bounds.
 */
async function calculateGoalProgress(prisma, goal, userId, timeZone = 'UTC', refDate = new Date()) {
    const { start: periodStart, end: periodEnd } = getPeriodBounds(goal.period, timeZone, refDate);

    // Bound by goal start and optional end
    const effectiveStart = goal.startsAt > periodStart ? goal.startsAt : periodStart;
    const effectiveEnd = goal.endsAt && goal.endsAt < periodEnd ? goal.endsAt : periodEnd;

    // If the goal is not active in this period window
    if (effectiveStart > effectiveEnd) {
        return {
            ...goal,
            currentValue: 0,
            progressPercentage: 0,
            isCompleted: false,
            periodBounds: {
                start: effectiveStart.toISOString(),
                end: effectiveEnd.toISOString(),
            },
        };
    }

    let currentValue = 0;

    if (goal.type === 'FOCUS_TIME') {
        const sessionWhere = {
            status: 'COMPLETED',
            endedAt: {
                gte: effectiveStart,
                lte: effectiveEnd,
            },
        };

        if (goal.teamId) {
            // Team goal: sum completed focus sessions on tasks belonging to this team
            sessionWhere.task = {
                teamId: goal.teamId,
            };
        } else {
            // Personal goal: user's personal task sessions
            sessionWhere.userId = userId;
            sessionWhere.task = {
                scope: 'PERSONAL',
            };
        }

        const sessions = await prisma.timerSession.findMany({
            where: sessionWhere,
            select: {
                durationSeconds: true,
            },
        });

        const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
        currentValue = Math.round(totalSeconds / 60); // In minutes
    } else if (goal.type === 'TASK_COMPLETION') {
        const taskWhere = {
            status: 'COMPLETED',
            completedAt: {
                gte: effectiveStart,
                lte: effectiveEnd,
            },
        };

        if (goal.teamId) {
            // Team goal: completed tasks belonging to this team
            taskWhere.teamId = goal.teamId;
            taskWhere.scope = 'TEAM';
        } else {
            // Personal goal: completed tasks owned by user with PERSONAL scope
            taskWhere.ownerId = userId;
            taskWhere.scope = 'PERSONAL';
        }

        currentValue = await prisma.task.count({
            where: taskWhere,
        });
    }

    const progressPercentage = goal.targetValue > 0
        ? Math.min(100, Math.round((currentValue / goal.targetValue) * 100))
        : 0;

    const isCompleted = currentValue >= goal.targetValue;

    return {
        ...goal,
        currentValue,
        progressPercentage,
        isCompleted,
        periodBounds: {
            start: effectiveStart.toISOString(),
            end: effectiveEnd.toISOString(),
        },
    };
}

/**
 * Creates a new personal or team goal.
 */
async function createGoal(userId, goalData, userTimezone = 'UTC') {
    const prisma = await getPrisma();

    if (goalData.teamId) {
        await verifyActiveMembership(prisma, goalData.teamId, userId);
    }

    const startsAt = goalData.startsAt ? new Date(goalData.startsAt) : new Date();
    const endsAt = goalData.endsAt ? new Date(goalData.endsAt) : null;

    if (endsAt && endsAt <= startsAt) {
        throw new BadRequestError('Goal end date must be after the start date');
    }

    const goal = await prisma.goal.create({
        data: {
            userId,
            teamId: goalData.teamId || null,
            type: goalData.type,
            targetValue: goalData.targetValue,
            period: goalData.period,
            startsAt,
            endsAt,
        },
    });

    return calculateGoalProgress(prisma, goal, userId, userTimezone);
}

/**
 * Lists goals with calculated progress.
 * Enforces strict personal data privacy: personal queries never return other users' or team data.
 */
async function listGoals(userId, userTimezone = 'UTC', query = {}) {
    const prisma = await getPrisma();
    const where = {};

    if (query.teamId) {
        await verifyActiveMembership(prisma, query.teamId, userId);
        where.teamId = query.teamId;
    } else {
        // Personal scope: owned by this user and NOT tied to any team
        where.userId = userId;
        where.teamId = null;
    }

    if (query.period) {
        where.period = query.period;
    }

    const goals = await prisma.goal.findMany({
        where,
        orderBy: {
            createdAt: 'desc',
        },
    });

    const goalsWithProgress = await Promise.all(
        goals.map((g) => calculateGoalProgress(prisma, g, userId, userTimezone))
    );

    return goalsWithProgress;
}

/**
 * Fetches a single goal by ID with progress, enforcing authorization.
 */
async function getGoalById(userId, goalId, userTimezone = 'UTC') {
    const prisma = await getPrisma();

    const goal = await prisma.goal.findUnique({
        where: { id: goalId },
    });

    if (!goal) {
        throw new NotFoundError('Goal not found');
    }

    if (goal.teamId) {
        await verifyActiveMembership(prisma, goal.teamId, userId);
    } else if (goal.userId !== userId) {
        // Strict cross-user privacy: do not reveal existence of another user's goal
        throw new NotFoundError('Goal not found');
    }

    return calculateGoalProgress(prisma, goal, userId, userTimezone);
}

/**
 * Updates an owned goal.
 */
async function updateGoal(userId, goalId, updateData, userTimezone = 'UTC') {
    const prisma = await getPrisma();

    const existing = await prisma.goal.findUnique({
        where: { id: goalId },
    });

    if (!existing) {
        throw new NotFoundError('Goal not found');
    }

    if (existing.teamId) {
        const membership = await verifyActiveMembership(prisma, existing.teamId, userId);
        // Team goals can only be modified by team OWNER, ADMIN, or the creator
        if (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && existing.userId !== userId) {
            throw new ForbiddenError('You do not have permission to update this team goal');
        }
    } else if (existing.userId !== userId) {
        throw new NotFoundError('Goal not found');
    }

    const startsAt = updateData.startsAt !== undefined
        ? (updateData.startsAt ? new Date(updateData.startsAt) : existing.startsAt)
        : existing.startsAt;

    const endsAt = updateData.endsAt !== undefined
        ? (updateData.endsAt ? new Date(updateData.endsAt) : null)
        : existing.endsAt;

    if (endsAt && endsAt <= startsAt) {
        throw new BadRequestError('Goal end date must be after the start date');
    }

    const updated = await prisma.goal.update({
        where: { id: goalId },
        data: {
            type: updateData.type || undefined,
            targetValue: updateData.targetValue !== undefined ? updateData.targetValue : undefined,
            period: updateData.period || undefined,
            startsAt: updateData.startsAt !== undefined ? startsAt : undefined,
            endsAt: updateData.endsAt !== undefined ? endsAt : undefined,
        },
    });

    return calculateGoalProgress(prisma, updated, userId, userTimezone);
}

/**
 * Deletes an owned goal.
 */
async function deleteGoal(userId, goalId) {
    const prisma = await getPrisma();

    const existing = await prisma.goal.findUnique({
        where: { id: goalId },
    });

    if (!existing) {
        throw new NotFoundError('Goal not found');
    }

    if (existing.teamId) {
        const membership = await verifyActiveMembership(prisma, existing.teamId, userId);
        if (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && existing.userId !== userId) {
            throw new ForbiddenError('You do not have permission to delete this team goal');
        }
    } else if (existing.userId !== userId) {
        throw new NotFoundError('Goal not found');
    }

    await prisma.goal.delete({
        where: { id: goalId },
    });

    return {
        id: goalId,
        deleted: true,
    };
}

module.exports = {
    getPeriodBounds,
    getStartOfDayInTimezone,
    calculateGoalProgress,
    createGoal,
    listGoals,
    getGoalById,
    updateGoal,
    deleteGoal,
};
