'use strict';

/**
 * backend/src/modules/timer/timer.service.js
 *
 * Core service for FocusFlow Server-Authoritative Focus Timer:
 *  - Calculates elapsed active seconds from server segment timestamps
 *  - Disregards paused duration completely
 *  - Enforces database partial unique constraint: exactly one active timer per user
 *  - Provides atomic state transitions (start, pause, resume, finish, discard)
 *  - Provides paginated session history and task-specific session metrics
 */

const { getPrisma } = require('../../../db/prisma');
const {
    AppError,
    NotFoundError,
    BadRequestError,
} = require('../../shared/errors/AppError');

/**
 * Server-authoritative calculation of elapsed active focus seconds.
 * Walks through chronological event segments.
 * Only the intervals between (START/RESUME) and (PAUSE/FINISH/DISCARD) count as active focus.
 * Paused intervals are strictly ignored.
 */
function calculateElapsedSeconds(segments, currentStatus = 'COMPLETED', referenceTime = null) {
    if (!segments || segments.length === 0) return 0;

    const sorted = [...segments].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );

    let totalMs = 0;
    let activeStartTime = null;

    for (let i = 0; i < sorted.length; i++) {
        const seg = sorted[i];
        const segTime = new Date(seg.occurredAt).getTime();

        if (seg.eventType === 'START' || seg.eventType === 'RESUME') {
            activeStartTime = segTime;
        } else if (
            seg.eventType === 'PAUSE' ||
            seg.eventType === 'FINISH' ||
            seg.eventType === 'DISCARD'
        ) {
            if (activeStartTime !== null) {
                totalMs += Math.max(0, segTime - activeStartTime);
                activeStartTime = null;
            }
        }
    }

    // If currently running, accumulate active interval up to referenceTime (or now)
    if (activeStartTime !== null && currentStatus === 'RUNNING') {
        const now = referenceTime ? new Date(referenceTime).getTime() : Date.now();
        totalMs += Math.max(0, now - activeStartTime);
    }

    return Math.floor(totalMs / 1000);
}

/**
 * Server-authoritative calculation of total accumulated focus seconds for a task
 * across all completed focus sessions belonging to the user.
 */
async function getTaskAccumulatedFocusSeconds(userId, taskId) {
    const prisma = await getPrisma();
    const aggregate = await prisma.timerSession.aggregate({
        where: {
            userId,
            taskId,
            status: 'COMPLETED',
        },
        _sum: { durationSeconds: true },
    });
    return aggregate._sum.durationSeconds || 0;
}

/**
 * Start a new focus timer session for a task.
 * Enforces single active session per user.
 */
async function startSession(userId, taskId) {
    const prisma = await getPrisma();

    // 1. Verify task exists and is owned by/accessible to the user
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { ownerId: userId },
                {
                    team: {
                        memberships: {
                            some: { userId, status: 'ACTIVE' },
                        },
                    },
                },
            ],
        },
        select: {
            id: true,
            title: true,
            status: true,
            scheduleType: true,
            estimatedDurationMinutes: true,
            actualDurationMinutes: true,
        },
    });

    if (!task) {
        throw new NotFoundError('Task not found or access denied');
    }

    // 2. Pre-check for existing active or paused session
    const existingActive = await prisma.timerSession.findFirst({
        where: {
            userId,
            status: { in: ['RUNNING', 'PAUSED'] },
        },
        select: { id: true, taskId: true, status: true },
    });

    if (existingActive) {
        throw new AppError(
            'An active focus session already exists for this user',
            409,
            'ACTIVE_SESSION_EXISTS'
        );
    }

    const now = new Date();

    try {
        // 3. Atomically create session and initial START segment
        const session = await prisma.$transaction(async (tx) => {
            const createdSession = await tx.timerSession.create({
                data: {
                    userId,
                    taskId,
                    status: 'RUNNING',
                    startedAt: now,
                    durationSeconds: 0,
                    segments: {
                        create: {
                            eventType: 'START',
                            occurredAt: now,
                        },
                    },
                },
                include: {
                    task: {
                        select: {
                            id: true,
                            title: true,
                            status: true,
                            scheduleType: true,
                            estimatedDurationMinutes: true,
                            actualDurationMinutes: true,
                        },
                    },
                    segments: {
                        orderBy: { occurredAt: 'asc' },
                    },
                },
            });

            return createdSession;
        });

        const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, taskId);

        return {
            id: session.id,
            taskId: session.taskId,
            status: session.status,
            startedAt: session.startedAt,
            elapsedSeconds: 0,
            accumulatedFocusSeconds,
            totalTaskFocusSeconds: accumulatedFocusSeconds,
            task: session.task,
        };
    } catch (err) {
        // Concurrency catch: trapped by database partial unique index 'unique_active_timer_per_user'
        if (err.code === 'P2002' || (err.message && err.message.includes('unique_active_timer_per_user'))) {
            throw new AppError(
                'An active focus session already exists for this user',
                409,
                'ACTIVE_SESSION_EXISTS'
            );
        }
        throw err;
    }
}

/**
 * Retrieve the current active or paused session for the user.
 * Returns null if no active session exists.
 */
async function getActiveSession(userId) {
    const prisma = await getPrisma();

    const session = await prisma.timerSession.findFirst({
        where: {
            userId,
            status: { in: ['RUNNING', 'PAUSED'] },
        },
        include: {
            task: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    scheduleType: true,
                    estimatedDurationMinutes: true,
                    actualDurationMinutes: true,
                },
            },
            segments: {
                orderBy: { occurredAt: 'asc' },
            },
        },
    });

    if (!session) {
        return null;
    }

    const elapsedSeconds = calculateElapsedSeconds(session.segments, session.status);
    const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);

    return {
        id: session.id,
        taskId: session.taskId,
        status: session.status,
        startedAt: session.startedAt,
        elapsedSeconds,
        accumulatedFocusSeconds,
        totalTaskFocusSeconds: accumulatedFocusSeconds + elapsedSeconds,
        task: session.task,
    };
}

/**
 * Pause an active focus timer session.
 */
async function pauseSession(userId, sessionId) {
    const prisma = await getPrisma();

    const session = await prisma.timerSession.findFirst({
        where: { id: sessionId, userId },
        include: {
            task: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    scheduleType: true,
                    estimatedDurationMinutes: true,
                },
            },
            segments: {
                orderBy: { occurredAt: 'asc' },
            },
        },
    });

    if (!session) {
        throw new NotFoundError('Focus session not found');
    }

    // Idempotent: already paused
    if (session.status === 'PAUSED') {
        const elapsedSeconds = calculateElapsedSeconds(session.segments, 'PAUSED');
        const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);
        return {
            id: session.id,
            taskId: session.taskId,
            status: session.status,
            startedAt: session.startedAt,
            elapsedSeconds,
            accumulatedFocusSeconds,
            totalTaskFocusSeconds: accumulatedFocusSeconds + elapsedSeconds,
            task: session.task,
        };
    }

    if (session.status !== 'RUNNING') {
        throw new BadRequestError(
            `Cannot pause session with status '${session.status}'. Must be 'RUNNING'.`
        );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
        // Record PAUSE event segment
        await tx.timerSegment.create({
            data: {
                sessionId: session.id,
                eventType: 'PAUSE',
                occurredAt: now,
            },
        });

        const allSegments = [...session.segments, { eventType: 'PAUSE', occurredAt: now }];
        const elapsedSeconds = calculateElapsedSeconds(allSegments, 'PAUSED', now);

        const updatedSession = await tx.timerSession.update({
            where: { id: session.id },
            data: {
                status: 'PAUSED',
                durationSeconds: elapsedSeconds,
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        scheduleType: true,
                        estimatedDurationMinutes: true,
                    },
                },
            },
        });

        return { ...updatedSession, elapsedSeconds };
    });

    const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);

    return {
        id: updated.id,
        taskId: updated.taskId,
        status: updated.status,
        startedAt: updated.startedAt,
        elapsedSeconds: updated.elapsedSeconds,
        accumulatedFocusSeconds,
        totalTaskFocusSeconds: accumulatedFocusSeconds + updated.elapsedSeconds,
        task: updated.task,
    };
}

/**
 * Resume a paused focus timer session.
 */
async function resumeSession(userId, sessionId) {
    const prisma = await getPrisma();

    const session = await prisma.timerSession.findFirst({
        where: { id: sessionId, userId },
        include: {
            task: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    scheduleType: true,
                    estimatedDurationMinutes: true,
                },
            },
            segments: {
                orderBy: { occurredAt: 'asc' },
            },
        },
    });

    if (!session) {
        throw new NotFoundError('Focus session not found');
    }

    // Idempotent: already running
    if (session.status === 'RUNNING') {
        const elapsedSeconds = calculateElapsedSeconds(session.segments, 'RUNNING');
        const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);
        return {
            id: session.id,
            taskId: session.taskId,
            status: session.status,
            startedAt: session.startedAt,
            elapsedSeconds,
            accumulatedFocusSeconds,
            totalTaskFocusSeconds: accumulatedFocusSeconds + elapsedSeconds,
            task: session.task,
        };
    }

    if (session.status !== 'PAUSED') {
        throw new BadRequestError(
            `Cannot resume session with status '${session.status}'. Must be 'PAUSED'.`
        );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
        await tx.timerSegment.create({
            data: {
                sessionId: session.id,
                eventType: 'RESUME',
                occurredAt: now,
            },
        });

        const updatedSession = await tx.timerSession.update({
            where: { id: session.id },
            data: {
                status: 'RUNNING',
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        scheduleType: true,
                        estimatedDurationMinutes: true,
                    },
                },
            },
        });

        return updatedSession;
    });

    const allSegments = [...session.segments, { eventType: 'RESUME', occurredAt: now }];
    const elapsedSeconds = calculateElapsedSeconds(allSegments, 'RUNNING', now);
    const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);

    return {
        id: updated.id,
        taskId: updated.taskId,
        status: updated.status,
        startedAt: updated.startedAt,
        elapsedSeconds,
        accumulatedFocusSeconds,
        totalTaskFocusSeconds: accumulatedFocusSeconds + elapsedSeconds,
        task: updated.task,
    };
}

/**
 * Finish a focus session and calculate total focused duration.
 * Optionally marks the associated task as completed with actual duration.
 */
async function finishSession(userId, sessionId, { markTaskComplete = false } = {}) {
    const prisma = await getPrisma();

    const session = await prisma.timerSession.findFirst({
        where: { id: sessionId, userId },
        include: {
            task: true,
            segments: {
                orderBy: { occurredAt: 'asc' },
            },
        },
    });

    if (!session) {
        throw new NotFoundError('Focus session not found');
    }

    if (session.status === 'COMPLETED') {
        const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);
        return {
            session: {
                ...session,
                accumulatedFocusSeconds,
                totalTaskFocusSeconds: accumulatedFocusSeconds,
            },
            task: session.task,
        };
    }

    if (session.status === 'DISCARDED') {
        throw new BadRequestError('Cannot finish a discarded focus session');
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        // Record FINISH segment
        await tx.timerSegment.create({
            data: {
                sessionId: session.id,
                eventType: 'FINISH',
                occurredAt: now,
            },
        });

        const allSegments = [...session.segments, { eventType: 'FINISH', occurredAt: now }];
        const durationSeconds = calculateElapsedSeconds(allSegments, 'COMPLETED', now);

        // Update session to COMPLETED
        const completedSession = await tx.timerSession.update({
            where: { id: session.id },
            data: {
                status: 'COMPLETED',
                endedAt: now,
                durationSeconds,
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        scheduleType: true,
                        estimatedDurationMinutes: true,
                        actualDurationMinutes: true,
                        completedAt: true,
                    },
                },
            },
        });

        let updatedTask = completedSession.task;

        if (markTaskComplete && session.task) {
            // Calculate task actual duration (round up to nearest minute, min 1 min if any seconds)
            const trackedMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 0;
            const previousMinutes = session.task.actualDurationMinutes || 0;
            const totalMinutes = previousMinutes + trackedMinutes;

            updatedTask = await tx.task.update({
                where: { id: session.taskId },
                data: {
                    status: 'COMPLETED',
                    completedAt: now,
                    actualDurationMinutes: totalMinutes > 0 ? totalMinutes : 1,
                    version: { increment: 1 },
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    scheduleType: true,
                    estimatedDurationMinutes: true,
                    actualDurationMinutes: true,
                    completedAt: true,
                },
            });
        }

        return { session: completedSession, task: updatedTask };
    });

    const accumulatedFocusSeconds = await getTaskAccumulatedFocusSeconds(userId, session.taskId);

    try {
        const { evaluateUserAchievements } = require('../achievements/achievements.service');
        evaluateUserAchievements(userId).catch(() => {});
    } catch (_) {}

    return {
        session: {
            id: result.session.id,
            taskId: result.session.taskId,
            status: result.session.status,
            startedAt: result.session.startedAt,
            endedAt: result.session.endedAt,
            durationSeconds: result.session.durationSeconds,
            accumulatedFocusSeconds,
            totalTaskFocusSeconds: accumulatedFocusSeconds,
            task: result.task,
        },
        task: result.task,
    };
}

/**
 * Discard an in-progress focus session.
 */
async function discardSession(userId, sessionId) {
    const prisma = await getPrisma();

    const session = await prisma.timerSession.findFirst({
        where: { id: sessionId, userId },
        include: {
            segments: {
                orderBy: { occurredAt: 'asc' },
            },
        },
    });

    if (!session) {
        throw new NotFoundError('Focus session not found');
    }

    if (session.status === 'DISCARDED') {
        return session;
    }

    if (session.status === 'COMPLETED') {
        throw new BadRequestError('Cannot discard an already completed session');
    }

    const now = new Date();

    const discarded = await prisma.$transaction(async (tx) => {
        await tx.timerSegment.create({
            data: {
                sessionId: session.id,
                eventType: 'DISCARD',
                occurredAt: now,
            },
        });

        const allSegments = [...session.segments, { eventType: 'DISCARD', occurredAt: now }];
        const durationSeconds = calculateElapsedSeconds(allSegments, 'DISCARDED', now);

        return await tx.timerSession.update({
            where: { id: session.id },
            data: {
                status: 'DISCARDED',
                endedAt: now,
                durationSeconds,
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
    });

    return discarded;
}

/**
 * List session history for the authenticated user with pagination and optional filters.
 */
async function listSessions(userId, query = {}) {
    const prisma = await getPrisma();
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { userId };
    if (query.status) {
        where.status = query.status;
    }
    if (query.taskId) {
        where.taskId = query.taskId;
    }

    const [total, sessions] = await Promise.all([
        prisma.timerSession.count({ where }),
        prisma.timerSession.findMany({
            where,
            skip,
            take: limit,
            orderBy: { startedAt: 'desc' },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        scheduleType: true,
                        estimatedDurationMinutes: true,
                    },
                },
            },
        }),
    ]);

    return {
        sessions,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        },
    };
}

/**
 * Retrieve focus sessions and total focus time for a specific task.
 */
async function getTaskSessions(userId, taskId, query = {}) {
    const prisma = await getPrisma();

    // Verify task access
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { ownerId: userId },
                {
                    team: {
                        memberships: {
                            some: { userId, status: 'ACTIVE' },
                        },
                    },
                },
            ],
        },
        select: { id: true, title: true },
    });

    if (!task) {
        throw new NotFoundError('Task not found or access denied');
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { userId, taskId };

    const [total, sessions, sumAggregate] = await Promise.all([
        prisma.timerSession.count({ where }),
        prisma.timerSession.findMany({
            where,
            skip,
            take: limit,
            orderBy: { startedAt: 'desc' },
        }),
        prisma.timerSession.aggregate({
            where: { ...where, status: 'COMPLETED' },
            _sum: { durationSeconds: true },
        }),
    ]);

    const totalDurationSeconds = sumAggregate._sum.durationSeconds || 0;

    return {
        task,
        sessions,
        totalDurationSeconds,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        },
    };
}

module.exports = {
    calculateElapsedSeconds,
    startSession,
    getActiveSession,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
    listSessions,
    getTaskSessions,
};
