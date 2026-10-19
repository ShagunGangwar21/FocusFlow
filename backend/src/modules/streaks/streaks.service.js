'use strict';

/**
 * backend/src/modules/streaks/streaks.service.js
 *
 * Server-authoritative streak calculation engine.
 * Computes consecutive active days, longest streak, and current status using the user's
 * configured IANA timezone and persisted TimerSession & Task completion records.
 */

const { getPrisma } = require('../../../db/prisma');
const { getStartOfDayInTimezone } = require('../goals/goals.service');

/**
 * Converts a UTC Date into a YYYY-MM-DD string in the specified timezone.
 */
function getLocalDateString(date, timeZone = 'UTC') {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    } catch (e) {
        return new Date(date).toISOString().split('T')[0];
    }
}

/**
 * Adds or subtracts days to a YYYY-MM-DD string in calendar time.
 */
function shiftDateString(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

/**
 * Calculates streaks for a user.
 * Definition of an active day:
 * - At least one completed TimerSession (durationSeconds > 0), OR
 * - At least one completed Task (completedAt on that date in user's timezone).
 */
async function getStreakSummary(userId, timeZone = 'UTC', refDate = new Date()) {
    const prisma = await getPrisma();

    const todayStr = getLocalDateString(refDate, timeZone);
    const yesterdayStr = shiftDateString(todayStr, -1);

    // 1. Fetch completed personal sessions
    const sessions = await prisma.timerSession.findMany({
        where: {
            userId,
            status: 'COMPLETED',
            durationSeconds: { gt: 0 },
            endedAt: { not: null },
        },
        select: {
            endedAt: true,
        },
    });

    // 2. Fetch completed personal tasks
    const tasks = await prisma.task.findMany({
        where: {
            ownerId: userId,
            scope: 'PERSONAL',
            status: 'COMPLETED',
            completedAt: { not: null },
        },
        select: {
            completedAt: true,
        },
    });

    // 3. Aggregate unique active local dates
    const activeDatesSet = new Set();
    sessions.forEach((s) => {
        if (s.endedAt) {
            activeDatesSet.add(getLocalDateString(s.endedAt, timeZone));
        }
    });
    tasks.forEach((t) => {
        if (t.completedAt) {
            activeDatesSet.add(getLocalDateString(t.completedAt, timeZone));
        }
    });

    if (activeDatesSet.size === 0) {
        return {
            currentStreakDays: 0,
            longestStreakDays: 0,
            lastActiveDate: null,
            isActiveToday: false,
            streakCriteria: 'Complete at least one focus session or task per day',
            totalActiveDays: 0,
        };
    }

    const sortedDates = Array.from(activeDatesSet).sort();
    const lastActiveDate = sortedDates[sortedDates.length - 1];
    const isActiveToday = activeDatesSet.has(todayStr);

    // 4. Calculate Current Streak
    let currentStreakDays = 0;
    let checkDate = null;

    if (isActiveToday) {
        checkDate = todayStr;
    } else if (activeDatesSet.has(yesterdayStr)) {
        // Streak is still alive if completed yesterday; user has today to continue it
        checkDate = yesterdayStr;
    }

    if (checkDate) {
        while (activeDatesSet.has(checkDate)) {
            currentStreakDays++;
            checkDate = shiftDateString(checkDate, -1);
        }
    }

    // 5. Calculate Longest Streak in history
    let longestStreakDays = 0;
    let tempStreak = 0;
    let prevDate = null;

    for (const d of sortedDates) {
        if (!prevDate) {
            tempStreak = 1;
        } else {
            const expectedNext = shiftDateString(prevDate, 1);
            if (d === expectedNext) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
        }
        prevDate = d;
        if (tempStreak > longestStreakDays) {
            longestStreakDays = tempStreak;
        }
    }

    return {
        currentStreakDays,
        longestStreakDays,
        lastActiveDate,
        isActiveToday,
        streakCriteria: 'Complete at least one focus session or task per day',
        totalActiveDays: activeDatesSet.size,
    };
}

module.exports = {
    getLocalDateString,
    shiftDateString,
    getStreakSummary,
};
