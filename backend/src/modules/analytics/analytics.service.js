'use strict';

/**
 * backend/src/modules/analytics/analytics.service.js
 *
 * Core service for FocusFlow Dashboard & Personal/Team Productivity Analytics.
 * Generates server-authoritative summaries, planned vs actual focus metrics,
 * weekly review datasets, planning accuracy, and goal progress.
 */

const { getPrisma } = require('../../../db/prisma');
const { ForbiddenError } = require('../../shared/errors/AppError');
const { getStreakSummary, getLocalDateString, shiftDateString } = require('../streaks/streaks.service');
const { getPeriodBounds, getStartOfDayInTimezone, listGoals } = require('../goals/goals.service');

/**
 * Helper to verify team membership.
 */
async function verifyActiveMembership(prisma, teamId, userId) {
    const membership = await prisma.teamMembership.findFirst({
        where: { teamId, userId, status: 'ACTIVE' },
    });
    if (!membership) {
        throw new ForbiddenError('You are not an active member of this team');
    }
    return membership;
}

/**
 * Comprehensive summary analytics for dashboard and overview widgets.
 */
async function getAnalyticsSummary(userId, timeZone = 'UTC', query = {}) {
    const prisma = await getPrisma();
    const scope = query.scope === 'TEAM' ? 'TEAM' : 'PERSONAL';

    let teamId = null;
    if (scope === 'TEAM') {
        if (!query.teamId) {
            throw new ForbiddenError('teamId is required for TEAM scope analytics');
        }
        teamId = query.teamId;
        await verifyActiveMembership(prisma, teamId, userId);
    }

    // Default time window: start of current week to end of today
    const { start: weekStart, end: weekEnd } = getPeriodBounds('WEEKLY', timeZone, new Date());
    const fromDate = query.from ? new Date(query.from) : weekStart;
    const toDate = query.to ? new Date(query.to) : new Date();

    // 1. Task query
    const taskWhere = {
        scope,
        status: { not: 'CANCELLED' },
    };

    if (scope === 'TEAM') {
        taskWhere.teamId = teamId;
    } else {
        taskWhere.ownerId = userId;
    }

    taskWhere.OR = [
        {
            startAt: { gte: fromDate, lte: toDate },
        },
        {
            completedAt: { gte: fromDate, lte: toDate },
        },
        {
            createdAt: { gte: fromDate, lte: toDate },
        },
    ];

    const tasks = await prisma.task.findMany({
        where: taskWhere,
        select: {
            id: true,
            status: true,
            estimatedDurationMinutes: true,
            actualDurationMinutes: true,
            completedAt: true,
            startAt: true,
            scheduleType: true,
        },
    });

    const totalTasksCount = tasks.length;
    const completedTasks = tasks.filter(
        (t) => t.status === 'COMPLETED' && t.completedAt && t.completedAt >= fromDate && t.completedAt <= toDate
    );
    const completedTasksCount = completedTasks.length;

    const plannedMinutes = tasks.reduce((sum, t) => sum + (t.estimatedDurationMinutes || 0), 0);

    // Count overruns: tasks where actualDuration > estimatedDuration
    const overrunCount = tasks.filter(
        (t) => t.actualDurationMinutes && t.actualDurationMinutes > (t.estimatedDurationMinutes || 0)
    ).length;

    // 2. Completed focus sessions query
    const sessionWhere = {
        status: 'COMPLETED',
        endedAt: {
            gte: fromDate,
            lte: toDate,
        },
    };

    if (scope === 'TEAM') {
        sessionWhere.task = { teamId };
    } else {
        sessionWhere.userId = userId;
        sessionWhere.task = { scope: 'PERSONAL' };
    }

    const sessions = await prisma.timerSession.findMany({
        where: sessionWhere,
        select: {
            durationSeconds: true,
            endedAt: true,
        },
    });

    const totalFocusSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const actualFocusMinutes = Math.round(totalFocusSeconds / 60);

    const completionRate = totalTasksCount > 0
        ? parseFloat(((completedTasksCount / totalTasksCount) * 100).toFixed(1))
        : 0.0;

    const planningAccuracy = plannedMinutes > 0
        ? Math.min(100, Math.round((Math.min(actualFocusMinutes, plannedMinutes) / plannedMinutes) * 100))
        : null;

    // 3. Streaks
    const streakSummary = await getStreakSummary(userId, timeZone);

    return {
        scope,
        timeZone,
        window: {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
        },
        plannedMinutes,
        actualFocusMinutes,
        completedTasksCount,
        totalTasksCount,
        completionRate,
        overrunCount,
        planningAccuracy,
        currentStreakDays: streakSummary.currentStreakDays,
        longestStreakDays: streakSummary.longestStreakDays,
        lastActiveDate: streakSummary.lastActiveDate,
        totalFocusSessions: sessions.length,
    };
}

/**
 * Weekly review dataset with daily breakdowns (Monday to Sunday) and qualitative insights.
 */
async function getWeeklyReview(userId, timeZone = 'UTC', query = {}) {
    const prisma = await getPrisma();
    const effectiveTimezone = query.timezone || timeZone;

    // Calculate current week bounds
    const now = new Date();
    const { start: weekStart, end: weekEnd } = getPeriodBounds('WEEKLY', effectiveTimezone, now);

    // 1. Fetch all tasks relevant to this week
    const tasks = await prisma.task.findMany({
        where: {
            ownerId: userId,
            scope: 'PERSONAL',
            OR: [
                { startAt: { gte: weekStart, lte: weekEnd } },
                { completedAt: { gte: weekStart, lte: weekEnd } },
                { createdAt: { gte: weekStart, lte: weekEnd } },
            ],
        },
        select: {
            id: true,
            title: true,
            status: true,
            startAt: true,
            completedAt: true,
            createdAt: true,
            estimatedDurationMinutes: true,
            actualDurationMinutes: true,
        },
    });

    // 2. Fetch completed focus sessions for this week
    const sessions = await prisma.timerSession.findMany({
        where: {
            userId,
            status: 'COMPLETED',
            endedAt: { gte: weekStart, lte: weekEnd },
            task: { scope: 'PERSONAL' },
        },
        select: {
            id: true,
            durationSeconds: true,
            endedAt: true,
        },
    });

    // 3. Build 7 days array (Mon to Sun)
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const days = [];

    let totalPlannedMinutes = 0;
    let totalActualMinutes = 0;
    let totalCompletedTasks = 0;

    const mondayStr = getLocalDateString(weekStart, effectiveTimezone);

    for (let i = 0; i < 7; i++) {
        const dateStr = shiftDateString(mondayStr, i);
        const dayLabel = dayNames[i];

        // Tasks scheduled or completed on this local date
        const dayTasks = tasks.filter((t) => {
            const taskScheduledDate = t.startAt ? getLocalDateString(t.startAt, effectiveTimezone) : null;
            const taskCreatedDate = t.createdAt ? getLocalDateString(t.createdAt, effectiveTimezone) : null;
            return taskScheduledDate === dateStr || (!t.startAt && taskCreatedDate === dateStr);
        });

        const dayPlannedMins = dayTasks.reduce((sum, t) => sum + (t.estimatedDurationMinutes || 0), 0);

        const dayCompletedTasks = tasks.filter((t) => {
            return t.status === 'COMPLETED' && t.completedAt && getLocalDateString(t.completedAt, effectiveTimezone) === dateStr;
        });

        // Sessions ended on this local date
        const daySessions = sessions.filter((s) => {
            return s.endedAt && getLocalDateString(s.endedAt, effectiveTimezone) === dateStr;
        });

        const dayActualMins = Math.round(
            daySessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60
        );

        totalPlannedMinutes += dayPlannedMins;
        totalActualMinutes += dayActualMins;
        totalCompletedTasks += dayCompletedTasks.length;

        const plannedHours = parseFloat((dayPlannedMins / 60).toFixed(1));
        const actualHours = parseFloat((dayActualMins / 60).toFixed(1));

        days.push({
            day: dayLabel,
            date: dateStr,
            planned: plannedHours,
            actual: actualHours,
            plannedHours,
            actualHours,
            plannedMinutes: dayPlannedMins,
            actualMinutes: dayActualMins,
            completedTasks: dayCompletedTasks.length,
            completedTasksCount: dayCompletedTasks.length,
            plannedTasks: dayTasks.length,
            sessionsCount: daySessions.length,
        });
    }

    const totalTasksCount = tasks.length;
    const completionRate = totalTasksCount > 0
        ? parseFloat(((totalCompletedTasks / totalTasksCount) * 100).toFixed(1))
        : 0.0;

    const planningAccuracy = totalPlannedMinutes > 0
        ? Math.min(100, Math.round((Math.min(totalActualMinutes, totalPlannedMinutes) / totalPlannedMinutes) * 100))
        : null;

    const streakSummary = await getStreakSummary(userId, effectiveTimezone);
    const weeklyGoals = await listGoals(userId, effectiveTimezone, { period: 'WEEKLY' });

    // 4. Generate intelligent, transparent insights
    const insights = [];
    const hasData = totalActualMinutes > 0 || totalCompletedTasks > 0 || totalPlannedMinutes > 0;

    if (!hasData) {
        insights.push('No weekly activity recorded yet. Start a focus session or schedule tasks to build your weekly review.');
    } else {
        if (totalActualMinutes > 0) {
            insights.push(`You completed ${parseFloat((totalActualMinutes / 60).toFixed(1))} hours of focused work across ${sessions.length} sessions.`);
        }
        if (totalCompletedTasks > 0) {
            insights.push(`Completed ${totalCompletedTasks} tasks this week with a completion rate of ${completionRate}%.`);
        }
        if (planningAccuracy !== null) {
            if (planningAccuracy >= 80) {
                insights.push(`High planning accuracy of ${planningAccuracy}% — your task estimates closely matched reality.`);
            } else {
                insights.push(`Planning accuracy is ${planningAccuracy}%. Adjusting your estimated task durations can help prevent overruns.`);
            }
        }
        if (streakSummary.currentStreakDays >= 3) {
            insights.push(`Active ${streakSummary.currentStreakDays}-day streak! Keep the flow going today.`);
        }
    }

    return {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        timeZone: effectiveTimezone,
        hasData,
        days,
        dailyBreakdown: days,
        summary: {
            totalPlannedMinutes,
            totalActualMinutes,
            actualFocusMinutes: totalActualMinutes,
            totalPlannedHours: parseFloat((totalPlannedMinutes / 60).toFixed(1)),
            totalActualHours: parseFloat((totalActualMinutes / 60).toFixed(1)),
            completedTasksCount: totalCompletedTasks,
            totalTasksCount,
            completionRate,
            planningAccuracy,
        },
        streak: streakSummary,
        weeklyGoals,
        insights,
    };
}

module.exports = {
    getAnalyticsSummary,
    getWeeklyReview,
};
