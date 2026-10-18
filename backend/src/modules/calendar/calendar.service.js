'use strict';

/**
 * backend/src/modules/calendar/calendar.service.js
 *
 * Core service for FocusFlow Calendar:
 *  - Queries scheduled tasks and recurring occurrences within [from, to] window
 *  - Enforces privacy boundaries (personal vs team scope)
 *  - Computes direct schedule overlaps and deadline conflicts
 *  - Formats tasks with full scheduling metadata and completion status
 */

const { getPrisma } = require('../../../db/prisma');
const { ForbiddenError } = require('../../shared/errors/AppError');

/**
 * Fetch calendar data for a user within a specified datetime window.
 * Scoped to personal tasks or team tasks with membership verification.
 */
async function getCalendarData(userId, { from, to, scope = 'PERSONAL', teamId = null }) {
    const prisma = await getPrisma();
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const where = {};

    if (scope === 'TEAM') {
        if (!teamId) {
            throw new ForbiddenError('teamId is required for TEAM scope calendar queries');
        }
        // Verify user is an active member of this team
        const membership = await prisma.teamMembership.findFirst({
            where: { teamId, userId, status: 'ACTIVE' },
        });
        if (!membership) {
            throw new ForbiddenError('Access denied: You are not an active member of this team');
        }
        where.teamId = teamId;
        where.scope = 'TEAM';
    } else {
        where.ownerId = userId;
        where.scope = 'PERSONAL';
    }

    // Match tasks that:
    // 1. Have startAt/endAt overlapping the requested window
    // 2. Or have deadlineAt falling in the requested window
    // 3. Or are unscheduled/pending tasks created within window
    where.OR = [
        // Scheduled interval overlaps [fromDate, toDate]
        {
            startAt: { lte: toDate },
            endAt: { gte: fromDate },
        },
        // Single startAt point within window
        {
            startAt: { gte: fromDate, lte: toDate },
            endAt: null,
        },
        // Deadline within window
        {
            deadlineAt: { gte: fromDate, lte: toDate },
        },
    ];

    const tasks = await prisma.task.findMany({
        where,
        orderBy: [
            { startAt: 'asc' },
            { priority: 'desc' },
            { createdAt: 'asc' },
        ],
        include: {
            timerSessions: {
                where: { status: 'COMPLETED' },
                select: { durationSeconds: true },
            },
        },
    });

    // Detect conflicts within the returned scheduled tasks
    const conflicts = [];
    const scheduledTasks = tasks.filter((t) => t.startAt && t.endAt && t.status !== 'CANCELLED');

    for (let i = 0; i < scheduledTasks.length; i++) {
        const taskA = scheduledTasks[i];
        const aStart = new Date(taskA.startAt).getTime();
        const aEnd = new Date(taskA.endAt).getTime();

        // 1. Deadline conflict: scheduled end exceeds task deadline
        if (taskA.deadlineAt) {
            const aDeadline = new Date(taskA.deadlineAt).getTime();
            if (aEnd > aDeadline) {
                conflicts.push({
                    type: 'DEADLINE_EXCEEDED',
                    severity: 'HIGH',
                    taskId: taskA.id,
                    taskTitle: taskA.title,
                    message: `Task "${taskA.title}" is scheduled to end after its deadline.`,
                    scheduledEnd: taskA.endAt,
                    deadlineAt: taskA.deadlineAt,
                });
            }
        }

        // 2. Direct schedule overlap between tasks for the same person
        for (let j = i + 1; j < scheduledTasks.length; j++) {
            const taskB = scheduledTasks[j];
            const bStart = new Date(taskB.startAt).getTime();
            const bEnd = new Date(taskB.endAt).getTime();

            // Check if intervals [aStart, aEnd] and [bStart, bEnd] overlap
            if (aStart < bEnd && aEnd > bStart) {
                const overlapStart = new Date(Math.max(aStart, bStart));
                const overlapEnd = new Date(Math.min(aEnd, bEnd));
                const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

                conflicts.push({
                    type: 'OVERLAP',
                    severity: taskA.scheduleType === 'FIXED' || taskB.scheduleType === 'FIXED' ? 'HIGH' : 'MEDIUM',
                    taskIds: [taskA.id, taskB.id],
                    taskTitles: [taskA.title, taskB.title],
                    overlapMinutes,
                    overlapStart: overlapStart.toISOString(),
                    overlapEnd: overlapEnd.toISOString(),
                    message: `Conflict: "${taskA.title}" overlaps with "${taskB.title}" by ${overlapMinutes} minutes.`,
                    involvesFixedTask: taskA.scheduleType === 'FIXED' || taskB.scheduleType === 'FIXED',
                });
            }
        }
    }

    // Format tasks with accumulatedFocusSeconds and clean response
    const formattedTasks = tasks.map((task) => {
        const totalDuration = (task.timerSessions || []).reduce(
            (sum, s) => sum + (s.durationSeconds || 0),
            0
        );
        const { timerSessions, ...rest } = task;
        return {
            ...rest,
            accumulatedFocusSeconds: totalDuration,
            actualDurationMinutes: task.actualDurationMinutes || (totalDuration > 0 ? Math.round(totalDuration / 60) : null),
        };
    });

    const summary = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t.status === 'COMPLETED').length,
        pendingTasks: tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
        fixedTasks: tasks.filter((t) => t.scheduleType === 'FIXED').length,
        flexibleTasks: tasks.filter((t) => t.scheduleType === 'FLEXIBLE').length,
        conflictCount: conflicts.length,
    };

    return {
        window: { from, to },
        tasks: formattedTasks,
        conflicts,
        summary,
    };
}

module.exports = {
    getCalendarData,
};
