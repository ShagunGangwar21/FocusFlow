'use strict';

/**
 * backend/src/modules/achievements/achievements.service.js
 *
 * Achievement definition seeding, automatic milestone evaluation, and persistence.
 * Uses the existing Prisma Achievement & UserAchievement models.
 * Protected against duplicate awards via database unique constraint @@unique([userId, achievementId]).
 */

const { getPrisma } = require('../../../db/prisma');
const { getStreakSummary } = require('../streaks/streaks.service');

const DEFAULT_ACHIEVEMENTS = [
    {
        code: 'FIRST_FLOW_SESSION',
        name: 'First Flow Session',
        description: 'Completed your first focus session.',
        badgeIcon: 'zap',
        criteria: { type: 'SESSION_COUNT', count: 1 },
    },
    {
        code: 'FIRST_FLOW_HOUR',
        name: 'Hour of Power',
        description: 'Logged at least 60 minutes of total focus time.',
        badgeIcon: 'clock',
        criteria: { type: 'FOCUS_MINUTES', minutes: 60 },
    },
    {
        code: 'DEEP_WORK_MASTER',
        name: 'Deep Work Diver',
        description: 'Completed a single focus session of 45+ minutes.',
        badgeIcon: 'compass',
        criteria: { type: 'SINGLE_SESSION_MINUTES', minutes: 45 },
    },
    {
        code: 'TASK_CRUSHER_5',
        name: 'Task Crusher',
        description: 'Completed 5 personal tasks.',
        badgeIcon: 'check-circle',
        criteria: { type: 'TASK_COUNT', count: 5 },
    },
    {
        code: 'TASK_CRUSHER_25',
        name: 'Productivity Master',
        description: 'Completed 25 personal tasks.',
        badgeIcon: 'award',
        criteria: { type: 'TASK_COUNT', count: 25 },
    },
    {
        code: 'STREAK_3_DAYS',
        name: 'Momentum Builder',
        description: 'Achieved a 3-day focus streak.',
        badgeIcon: 'flame',
        criteria: { type: 'STREAK_DAYS', days: 3 },
    },
    {
        code: 'STREAK_7_DAYS',
        name: 'Unstoppable Flow',
        description: 'Achieved a 7-day focus streak.',
        badgeIcon: 'trophy',
        criteria: { type: 'STREAK_DAYS', days: 7 },
    },
    {
        code: 'GOAL_ACHIEVER',
        name: 'Goal Getter',
        description: 'Completed a daily or weekly goal.',
        badgeIcon: 'target',
        criteria: { type: 'GOAL_COUNT', count: 1 },
    },
];

let isSeeded = false;

/**
 * Idempotently seeds default achievements into the database.
 */
async function seedAchievements(prisma) {
    if (isSeeded) return;
    for (const def of DEFAULT_ACHIEVEMENTS) {
        await prisma.achievement.upsert({
            where: { code: def.code },
            update: {
                name: def.name,
                description: def.description,
                badgeIcon: def.badgeIcon,
                criteria: def.criteria,
            },
            create: {
                code: def.code,
                name: def.name,
                description: def.description,
                badgeIcon: def.badgeIcon,
                criteria: def.criteria,
            },
        });
    }
    isSeeded = true;
}

/**
 * Evaluates all achievement criteria for a user against authoritative records.
 * Idempotently records newly unlocked achievements in UserAchievement.
 */
async function evaluateUserAchievements(userId, timeZone = 'UTC') {
    const prisma = await getPrisma();
    await seedAchievements(prisma);

    // 1. Calculate user metrics from database
    const completedSessions = await prisma.timerSession.findMany({
        where: {
            userId,
            status: 'COMPLETED',
            durationSeconds: { gt: 0 },
        },
        select: {
            durationSeconds: true,
        },
    });

    const sessionCount = completedSessions.length;
    const totalFocusMinutes = Math.round(
        completedSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
    );
    const maxSessionMinutes = Math.round(
        completedSessions.reduce((max, s) => Math.max(max, s.durationSeconds || 0), 0) / 60
    );

    const completedTasksCount = await prisma.task.count({
        where: {
            ownerId: userId,
            scope: 'PERSONAL',
            status: 'COMPLETED',
        },
    });

    const streakSummary = await getStreakSummary(userId, timeZone);
    const maxStreakDays = Math.max(streakSummary.longestStreakDays, streakSummary.currentStreakDays);

    // Check goals for at least one completed goal
    const goals = await prisma.goal.findMany({
        where: { userId, teamId: null },
    });
    const completedGoalsCount = goals.filter((g) => {
        // Simple check if goal target is met
        if (g.type === 'FOCUS_TIME') {
            return totalFocusMinutes >= g.targetValue;
        } else if (g.type === 'TASK_COMPLETION') {
            return completedTasksCount >= g.targetValue;
        }
        return false;
    }).length;

    const stats = {
        sessionCount,
        totalFocusMinutes,
        maxSessionMinutes,
        completedTasksCount,
        maxStreakDays,
        completedGoalsCount,
    };

    // 2. Fetch all achievement definitions
    const achievements = await prisma.achievement.findMany();

    // 3. Evaluate each achievement
    for (const ach of achievements) {
        const criteria = typeof ach.criteria === 'string' ? JSON.parse(ach.criteria) : ach.criteria;
        let earned = false;

        switch (criteria.type) {
            case 'SESSION_COUNT':
                earned = stats.sessionCount >= criteria.count;
                break;
            case 'FOCUS_MINUTES':
                earned = stats.totalFocusMinutes >= criteria.minutes;
                break;
            case 'SINGLE_SESSION_MINUTES':
                earned = stats.maxSessionMinutes >= criteria.minutes;
                break;
            case 'TASK_COUNT':
                earned = stats.completedTasksCount >= criteria.count;
                break;
            case 'STREAK_DAYS':
                earned = stats.maxStreakDays >= criteria.days;
                break;
            case 'GOAL_COUNT':
                earned = stats.completedGoalsCount >= criteria.count;
                break;
            default:
                break;
        }

        if (earned) {
            // Concurrent-safe duplicate award prevention
            await prisma.userAchievement.upsert({
                where: {
                    userId_achievementId: {
                        userId,
                        achievementId: ach.id,
                    },
                },
                create: {
                    userId,
                    achievementId: ach.id,
                    earnedAt: new Date(),
                },
                update: {},
            });
        }
    }

    return stats;
}

/**
 * Returns all achievements with user's earned status and progress.
 */
async function getUserAchievements(userId, timeZone = 'UTC') {
    const prisma = await getPrisma();
    await seedAchievements(prisma);

    const stats = await evaluateUserAchievements(userId, timeZone);

    const allAchievements = await prisma.achievement.findMany({
        include: {
            users: {
                where: { userId },
                select: { earnedAt: true },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    return allAchievements.map((ach) => {
        const criteria = typeof ach.criteria === 'string' ? JSON.parse(ach.criteria) : ach.criteria;
        const isEarned = ach.users.length > 0;
        const earnedAt = isEarned ? ach.users[0].earnedAt : null;

        let currentProgress = 0;
        let targetProgress = 1;

        switch (criteria.type) {
            case 'SESSION_COUNT':
                currentProgress = stats.sessionCount;
                targetProgress = criteria.count;
                break;
            case 'FOCUS_MINUTES':
                currentProgress = stats.totalFocusMinutes;
                targetProgress = criteria.minutes;
                break;
            case 'SINGLE_SESSION_MINUTES':
                currentProgress = stats.maxSessionMinutes;
                targetProgress = criteria.minutes;
                break;
            case 'TASK_COUNT':
                currentProgress = stats.completedTasksCount;
                targetProgress = criteria.count;
                break;
            case 'STREAK_DAYS':
                currentProgress = stats.maxStreakDays;
                targetProgress = criteria.days;
                break;
            case 'GOAL_COUNT':
                currentProgress = stats.completedGoalsCount;
                targetProgress = criteria.count;
                break;
            default:
                break;
        }

        return {
            id: ach.id,
            code: ach.code,
            name: ach.name,
            description: ach.description,
            badgeIcon: ach.badgeIcon,
            unlocked: isEarned,
            earnedAt,
            progress: {
                current: Math.min(currentProgress, targetProgress),
                target: targetProgress,
                percentage: Math.min(100, Math.round((currentProgress / targetProgress) * 100)),
            },
        };
    });
}

module.exports = {
    DEFAULT_ACHIEVEMENTS,
    seedAchievements,
    evaluateUserAchievements,
    getUserAchievements,
};
