'use strict';

/**
 * backend/src/modules/scheduling/scheduling.service.js
 *
 * Deterministic Scheduling & Conflict Recovery Engine:
 *  - Detects schedule overlaps, overruns, and deadline conflicts
 *  - Generates safe recovery proposals respecting user working hours and buffers
 *  - Enforces the core invariant: FIXED tasks are NEVER moved automatically
 *  - Provides atomic transaction application with optimistic concurrency version checks
 *  - Records complete audit trails in ScheduleChange table
 */

const { getPrisma } = require('../../../db/prisma');
const {
    AppError,
    NotFoundError,
    BadRequestError,
    ConflictError,
    ForbiddenError,
} = require('../../shared/errors/AppError');

/**
 * Detect all conflicts within a given time window.
 */
async function detectConflicts(userId, { from, to, scope = 'PERSONAL', teamId = null } = {}) {
    const prisma = await getPrisma();

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const where = {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [
            { startAt: { lte: toDate }, endAt: { gte: fromDate } },
            { deadlineAt: { gte: fromDate, lte: toDate } },
        ],
    };

    if (scope === 'TEAM') {
        if (!teamId) throw new ForbiddenError('teamId is required for team scope');
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

    const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ startAt: 'asc' }, { priority: 'desc' }],
    });

    const conflicts = [];
    const now = Date.now();

    // 1. Check for missed tasks (scheduled in the past, not completed)
    for (const task of tasks) {
        if (task.endAt && new Date(task.endAt).getTime() < now && task.status === 'PENDING') {
            conflicts.push({
                type: 'MISSED',
                severity: task.scheduleType === 'FIXED' ? 'HIGH' : 'MEDIUM',
                taskId: task.id,
                taskTitle: task.title,
                scheduleType: task.scheduleType,
                startAt: task.startAt,
                endAt: task.endAt,
                message: `Task "${task.title}" ended in the past without completion and needs rescheduling or completion.`,
            });
        }

        // 2. Deadline exceeded
        if (task.deadlineAt && task.endAt) {
            if (new Date(task.endAt).getTime() > new Date(task.deadlineAt).getTime()) {
                conflicts.push({
                    type: 'DEADLINE_EXCEEDED',
                    severity: 'HIGH',
                    taskId: task.id,
                    taskTitle: task.title,
                    scheduleType: task.scheduleType,
                    endAt: task.endAt,
                    deadlineAt: task.deadlineAt,
                    message: `Task "${task.title}" is scheduled past its deadline (${new Date(task.deadlineAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`,
                });
            }
        }
    }

    // 3. Direct overlaps
    const scheduled = tasks.filter((t) => t.startAt && t.endAt);
    for (let i = 0; i < scheduled.length; i++) {
        for (let j = i + 1; j < scheduled.length; j++) {
            const a = scheduled[i];
            const b = scheduled[j];

            const aStart = new Date(a.startAt).getTime();
            const aEnd = new Date(a.endAt).getTime();
            const bStart = new Date(b.startAt).getTime();
            const bEnd = new Date(b.endAt).getTime();

            if (aStart < bEnd && aEnd > bStart) {
                const overlapStart = new Date(Math.max(aStart, bStart));
                const overlapEnd = new Date(Math.min(aEnd, bEnd));
                const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

                conflicts.push({
                    type: 'OVERLAP',
                    severity: a.scheduleType === 'FIXED' || b.scheduleType === 'FIXED' ? 'HIGH' : 'MEDIUM',
                    taskIds: [a.id, b.id],
                    taskTitles: [a.title, b.title],
                    overlapMinutes,
                    overlapStart: overlapStart.toISOString(),
                    overlapEnd: overlapEnd.toISOString(),
                    message: `Overlap Conflict: "${a.title}" overlaps with "${b.title}" by ${overlapMinutes} minutes.`,
                    involvesFixedTask: a.scheduleType === 'FIXED' || b.scheduleType === 'FIXED',
                });
            }
        }
    }

    return {
        conflicts,
        totalConflicts: conflicts.length,
        tasks,
    };
}

/**
 * Diagnostic schedule analysis for a specific date.
 */
async function analyzeSchedule(userId, { date, timezone = 'UTC', scope = 'PERSONAL', teamId = null }) {
    const prisma = await getPrisma();

    // Fetch user preferences for working hours & buffers
    const userPref = await prisma.userPreference.findUnique({
        where: { userId },
    });

    let workingHours = { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
    if (userPref && userPref.workingHours) {
        try {
            workingHours = typeof userPref.workingHours === 'string'
                ? JSON.parse(userPref.workingHours)
                : userPref.workingHours;
        } catch (e) {
            // Keep default
        }
    }

    const recoveryBufferMinutes = userPref?.recoveryBufferMinutes || 15;

    // Build day bounds [startOfDay, endOfDay]
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const { conflicts, tasks } = await detectConflicts(userId, {
        from: dayStart.toISOString(),
        to: dayEnd.toISOString(),
        scope,
        teamId,
    });

    // Calculate total scheduled minutes on this date
    const dayScheduledTasks = tasks.filter((t) => {
        if (!t.startAt) return false;
        const d = new Date(t.startAt).toISOString().split('T')[0];
        return d === date;
    });

    const totalScheduledMinutes = dayScheduledTasks.reduce((sum, t) => {
        if (t.startAt && t.endAt) {
            return sum + Math.round((new Date(t.endAt) - new Date(t.startAt)) / 60000);
        }
        return sum + (t.estimatedDurationMinutes || 30);
    }, 0);

    return {
        date,
        timezone,
        workingHours,
        recoveryBufferMinutes,
        totalScheduledMinutes,
        tasksCount: dayScheduledTasks.length,
        conflicts,
        hasConflicts: conflicts.length > 0,
        recommendation: conflicts.length > 0
            ? 'Schedule conflicts or missed tasks detected. Generate a recovery plan to redistribute flexible tasks.'
            : 'Schedule is clear with no overlapping commitments.',
    };
}

/**
 * Generates a deterministic schedule recovery proposal.
 * Rule: Fixed tasks are NEVER moved automatically.
 * Rule: Flexible tasks are moved to available non-conflicting slots within working hours.
 */
async function generateProposal(userId, { overrunTaskId = null, extensionMinutes = null, date = null, conflictTaskIds = [], reason = null }) {
    const prisma = await getPrisma();

    // Fetch user preference
    const userPref = await prisma.userPreference.findUnique({ where: { userId } });
    let workingHours = { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
    if (userPref?.workingHours) {
        try {
            workingHours = typeof userPref.workingHours === 'string' ? JSON.parse(userPref.workingHours) : userPref.workingHours;
        } catch (e) {
            // Default
        }
    }
    const bufferMinutes = userPref?.recoveryBufferMinutes || 15;

    let targetDateStr = date;
    let overrunTask = null;

    if (overrunTaskId) {
        overrunTask = await prisma.task.findFirst({
            where: { id: overrunTaskId, ownerId: userId },
        });
        if (!overrunTask) {
            throw new NotFoundError('Overrun task not found');
        }
        if (overrunTask.startAt) {
            targetDateStr = new Date(overrunTask.startAt).toISOString().split('T')[0];
        }
    }

    if (!targetDateStr) {
        targetDateStr = new Date().toISOString().split('T')[0];
    }

    // Load all tasks for the target date
    const dayStart = new Date(`${targetDateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${targetDateStr}T23:59:59.999Z`);

    const allDayTasks = await prisma.task.findMany({
        where: {
            ownerId: userId,
            scope: 'PERSONAL',
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            OR: [
                { startAt: { lte: dayEnd }, endAt: { gte: dayStart } },
                { deadlineAt: { gte: dayStart, lte: dayEnd } },
                { id: { in: conflictTaskIds } },
            ],
        },
        orderBy: [{ startAt: 'asc' }, { priority: 'desc' }],
    });

    const proposalItemsData = [];
    const now = new Date();

    // Working hours parsed in minutes from midnight
    const [workStartH, workStartM] = (workingHours.start || '09:00').split(':').map(Number);
    const [workEndH, workEndM] = (workingHours.end || '17:00').split(':').map(Number);
    const workStartMinutes = workStartH * 60 + workStartM;
    const workEndMinutes = workEndH * 60 + workEndM;

    // Helper: Build Date object for targetDateStr at specific minute of day
    const makeDateAtMinutes = (minutes) => {
        const d = new Date(dayStart);
        d.setUTCMinutes(minutes);
        return d;
    };

    // Scenario A: Specific Task Overrun (e.g. current focus task extended by N minutes)
    if (overrunTask && extensionMinutes) {
        const oldStart = overrunTask.startAt ? new Date(overrunTask.startAt) : new Date();
        const oldEnd = overrunTask.endAt ? new Date(overrunTask.endAt) : new Date(oldStart.getTime() + (overrunTask.estimatedDurationMinutes || 30) * 60000);
        const newEnd = new Date(oldEnd.getTime() + extensionMinutes * 60000);

        proposalItemsData.push({
            taskId: overrunTask.id,
            oldStartAt: overrunTask.startAt,
            oldEndAt: overrunTask.endAt,
            newStartAt: oldStart,
            newEndAt: newEnd,
            reason: `Extended by ${extensionMinutes} minutes to account for focus overrun.`,
            isFixed: overrunTask.scheduleType === 'FIXED',
            requiresConsent: false, // User explicitly requested this overrun extension
        });

        // Any tasks scheduled after overrunTask that now collide with [oldStart, newEnd + buffer]
        let nextAvailableTime = new Date(newEnd.getTime() + bufferMinutes * 60000);

        const followingTasks = allDayTasks.filter((t) => t.id !== overrunTask.id && t.startAt && new Date(t.startAt) >= oldStart);

        for (const nextTask of followingTasks) {
            const nextStart = new Date(nextTask.startAt);
            const duration = nextTask.estimatedDurationMinutes || Math.max(15, Math.round((new Date(nextTask.endAt) - nextStart) / 60000));

            // If the next task collides with the extended time + buffer
            if (nextStart < nextAvailableTime) {
                const proposedStart = new Date(nextAvailableTime);
                const proposedEnd = new Date(proposedStart.getTime() + duration * 60000);

                const isFixed = nextTask.scheduleType === 'FIXED';
                proposalItemsData.push({
                    taskId: nextTask.id,
                    oldStartAt: nextTask.startAt,
                    oldEndAt: nextTask.endAt,
                    newStartAt: proposedStart,
                    newEndAt: proposedEnd,
                    reason: isFixed
                        ? `Fixed commitment collision with extended task. Manual user confirmation strictly required to shift.`
                        : `Shifted by ${Math.round((proposedStart - nextStart) / 60000)} minutes to preserve ${bufferMinutes}m recovery buffer.`,
                    isFixed,
                    requiresConsent: isFixed,
                });

                nextAvailableTime = new Date(proposedEnd.getTime() + bufferMinutes * 60000);
            } else {
                nextAvailableTime = new Date(new Date(nextTask.endAt).getTime() + bufferMinutes * 60000);
            }
        }
    } else {
        // Scenario B: General Conflict Recovery & Missed Tasks Resolution
        // Collect fixed tasks as unmovable anchor blocks
        const fixedAnchors = allDayTasks
            .filter((t) => t.scheduleType === 'FIXED' && t.startAt && t.endAt)
            .map((t) => ({
                id: t.id,
                title: t.title,
                startMinutes: new Date(t.startAt).getUTCHours() * 60 + new Date(t.startAt).getUTCMinutes(),
                endMinutes: new Date(t.endAt).getUTCHours() * 60 + new Date(t.endAt).getUTCMinutes(),
            }))
            .sort((a, b) => a.startMinutes - b.startMinutes);

        // Flexible tasks needing scheduling or conflict resolution
        const flexibleToSchedule = allDayTasks.filter((t) => {
            if (t.scheduleType === 'FIXED') return false;
            if (conflictTaskIds.length > 0) {
                return conflictTaskIds.includes(t.id);
            }
            return true;
        });

        // Place flexible tasks sequentially into available time slots
        let currentSlotMinutes = workStartMinutes;

        for (const flexTask of flexibleToSchedule) {
            const duration = flexTask.estimatedDurationMinutes || 30;
            let placed = false;

            while (!placed && currentSlotMinutes + duration <= 24 * 60) {
                // Check if [currentSlotMinutes, currentSlotMinutes + duration] collides with any fixed anchor
                const slotStart = currentSlotMinutes;
                const slotEnd = slotStart + duration;

                const collision = fixedAnchors.find((anchor) => {
                    return slotStart < (anchor.endMinutes + bufferMinutes) && slotEnd > (anchor.startMinutes - bufferMinutes);
                });

                if (collision) {
                    // Jump after the fixed anchor + buffer
                    currentSlotMinutes = collision.endMinutes + bufferMinutes;
                } else {
                    // Valid open slot found!
                    const proposedStart = makeDateAtMinutes(slotStart);
                    const proposedEnd = makeDateAtMinutes(slotEnd);

                    const hasMoved = !flexTask.startAt ||
                        new Date(flexTask.startAt).getTime() !== proposedStart.getTime() ||
                        new Date(flexTask.endAt).getTime() !== proposedEnd.getTime();

                    if (hasMoved) {
                        proposalItemsData.push({
                            taskId: flexTask.id,
                            oldStartAt: flexTask.startAt,
                            oldEndAt: flexTask.endAt,
                            newStartAt: proposedStart,
                            newEndAt: proposedEnd,
                            reason: `Rescheduled to open non-conflicting slot (${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}) preserving ${bufferMinutes}m buffer.`,
                            isFixed: false,
                            requiresConsent: false,
                        });
                    }

                    currentSlotMinutes = slotEnd + bufferMinutes;
                    placed = true;
                }
            }
        }
    }

    if (proposalItemsData.length === 0) {
        throw new BadRequestError('No schedule changes required. Current schedule has no resolvable conflicts.');
    }

    const proposalReason = reason || (overrunTaskId
        ? `Overrun recovery for "${overrunTask?.title || 'task'}" (+${extensionMinutes}m)`
        : `Schedule conflict recovery plan for ${targetDateStr}`);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute validity window

    // Save proposal and proposal items in database
    const proposal = await prisma.scheduleProposal.create({
        data: {
            userId,
            reason: proposalReason,
            status: 'PENDING',
            expiresAt,
            items: {
                create: proposalItemsData.map((item) => ({
                    taskId: item.taskId,
                    oldStartAt: item.oldStartAt ? new Date(item.oldStartAt) : null,
                    oldEndAt: item.oldEndAt ? new Date(item.oldEndAt) : null,
                    newStartAt: item.newStartAt,
                    newEndAt: item.newEndAt,
                    reason: item.reason,
                    isFixed: item.isFixed,
                    requiresConsent: item.requiresConsent,
                })),
            },
        },
        include: {
            items: {
                include: {
                    task: {
                        select: {
                            id: true,
                            title: true,
                            scheduleType: true,
                            priority: true,
                            version: true,
                        },
                    },
                },
            },
        },
    });

    return proposal;
}

/**
 * Retrieve a proposal by ID.
 */
async function getProposalById(userId, proposalId) {
    const prisma = await getPrisma();

    const proposal = await prisma.scheduleProposal.findFirst({
        where: { id: proposalId, userId },
        include: {
            items: {
                include: {
                    task: {
                        select: {
                            id: true,
                            title: true,
                            scheduleType: true,
                            priority: true,
                            version: true,
                        },
                    },
                },
            },
        },
    });

    if (!proposal) {
        throw new NotFoundError('Schedule proposal not found');
    }

    return proposal;
}

/**
 * Atomically accept a schedule proposal with optimistic concurrency and fixed-task safety.
 */
async function acceptProposal(userId, proposalId, { taskVersions = [], acceptedFixedTaskIds = [] } = {}) {
    const prisma = await getPrisma();

    return await prisma.$transaction(async (tx) => {
        // 1. Fetch proposal
        const proposal = await tx.scheduleProposal.findFirst({
            where: { id: proposalId, userId },
            include: {
                items: {
                    include: {
                        task: true,
                    },
                },
            },
        });

        if (!proposal) {
            throw new NotFoundError('Schedule proposal not found');
        }

        if (proposal.status !== 'PENDING') {
            throw new BadRequestError(`Cannot accept proposal with status '${proposal.status}'. Must be 'PENDING'.`);
        }

        // 2. Expiration check
        if (new Date() > new Date(proposal.expiresAt)) {
            await tx.scheduleProposal.update({
                where: { id: proposal.id },
                data: { status: 'EXPIRED' },
            });
            throw new BadRequestError('This schedule proposal has expired. Please generate a fresh recovery plan.');
        }

        // Map submitted task versions by taskId
        const versionMap = {};
        for (const tv of taskVersions) {
            versionMap[tv.taskId] = tv.version;
        }

        const taskIds = proposal.items.map((i) => i.taskId);
        const liveTasks = await tx.task.findMany({
            where: { id: { in: taskIds } },
        });

        // 3. Optimistic concurrency check: verify versions have not drifted
        for (const liveTask of liveTasks) {
            const expectedVersion = versionMap[liveTask.id];
            if (expectedVersion !== undefined && liveTask.version !== expectedVersion) {
                throw new ConflictError(
                    `STALE_PROPOSAL: Task "${liveTask.title}" was modified in another session (v${liveTask.version} vs v${expectedVersion}). Please generate a fresh proposal.`
                );
            }

            // 4. Invariant check: FIXED tasks cannot be moved without explicit user consent
            const item = proposal.items.find((i) => i.taskId === liveTask.id);
            if (item && liveTask.scheduleType === 'FIXED') {
                if (!acceptedFixedTaskIds.includes(liveTask.id)) {
                    throw new AppError(
                        `Task "${liveTask.title}" is a FIXED commitment and cannot be rescheduled without explicit confirmation.`,
                        422,
                        'FIXED_TASK_CONFIRMATION_REQUIRED',
                        [{ field: 'acceptedFixedTaskIds', taskId: liveTask.id }]
                    );
                }
            }
        }

        const now = new Date();
        const updatedTasks = [];

        // 5. Apply changes and log audit records
        for (const item of proposal.items) {
            const updated = await tx.task.update({
                where: { id: item.taskId },
                data: {
                    startAt: item.newStartAt,
                    endAt: item.newEndAt,
                    version: { increment: 1 },
                },
                select: {
                    id: true,
                    title: true,
                    startAt: true,
                    endAt: true,
                    scheduleType: true,
                    priority: true,
                    status: true,
                    version: true,
                },
            });

            updatedTasks.push(updated);

            // Audit log
            await tx.scheduleChange.create({
                data: {
                    taskId: item.taskId,
                    actorId: userId,
                    proposalId: proposal.id,
                    oldStartAt: item.oldStartAt,
                    oldEndAt: item.oldEndAt,
                    newStartAt: item.newStartAt,
                    newEndAt: item.newEndAt,
                    reason: item.reason,
                    createdAt: now,
                },
            });
        }

        // 6. Mark proposal as ACCEPTED
        const acceptedProposal = await tx.scheduleProposal.update({
            where: { id: proposal.id },
            data: {
                status: 'ACCEPTED',
                acceptedAt: now,
            },
        });

        return {
            proposal: acceptedProposal,
            updatedTasks,
        };
    });
}

/**
 * Reject a schedule proposal.
 */
async function rejectProposal(userId, proposalId) {
    const prisma = await getPrisma();

    const proposal = await prisma.scheduleProposal.findFirst({
        where: { id: proposalId, userId },
    });

    if (!proposal) {
        throw new NotFoundError('Schedule proposal not found');
    }

    if (proposal.status !== 'PENDING') {
        throw new BadRequestError(`Cannot reject proposal with status '${proposal.status}'.`);
    }

    const updated = await prisma.scheduleProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' },
    });

    return updated;
}

module.exports = {
    detectConflicts,
    analyzeSchedule,
    generateProposal,
    getProposalById,
    acceptProposal,
    rejectProposal,
};
