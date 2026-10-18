'use strict';

/**
 * backend/src/modules/tasks/tasks.service.js
 *
 * Task business logic and data access layer.
 * Strictly scopes personal task queries and mutations to the authenticated user's ID.
 * Strictly enforces team membership and role permissions for team tasks.
 */

const { getPrisma } = require('../../../db/prisma');
const {
    NotFoundError,
    ForbiddenError,
    BadRequestError,
    ConflictError,
} = require('../../shared/errors/AppError');

/**
 * Helper to check active team membership.
 */
async function getActiveMembership(prisma, teamId, userId) {
    return prisma.teamMembership.findFirst({
        where: {
            teamId,
            userId,
            status: 'ACTIVE',
        },
    });
}

/**
 * Creates a new personal or team task.
 * Enforces ownership: ownerId is ALWAYS the authenticated user's ID.
 */
async function createTask(userId, taskData) {
    const prisma = await getPrisma();

    const isTeam = taskData.scope === 'TEAM';
    let teamId = null;
    let projectId = null;

    if (isTeam) {
        if (!taskData.teamId) {
            throw new BadRequestError('teamId is required for team tasks');
        }
        teamId = taskData.teamId;

        // Verify caller is an active member of the team
        const membership = await getActiveMembership(prisma, teamId, userId);
        if (!membership) {
            throw new ForbiddenError('You are not an active member of this team');
        }

        // If project specified, verify it belongs to this team
        if (taskData.projectId) {
            const project = await prisma.project.findFirst({
                where: { id: taskData.projectId, teamId },
            });
            if (!project) {
                throw new BadRequestError('Project does not belong to this team');
            }
            projectId = taskData.projectId;
        }

        // If assignees specified, verify all are active members of the team
        if (taskData.assigneeUserIds && taskData.assigneeUserIds.length > 0) {
            const activeMemberCount = await prisma.teamMembership.count({
                where: {
                    teamId,
                    userId: { in: taskData.assigneeUserIds },
                    status: 'ACTIVE',
                },
            });
            if (activeMemberCount !== taskData.assigneeUserIds.length) {
                throw new BadRequestError('All task assignees must be active members of the team');
            }
        }
    } else {
        // Personal task
        if (taskData.projectId) {
            const project = await prisma.project.findFirst({
                where: { id: taskData.projectId, ownerId: userId, scope: 'PERSONAL' },
            });
            if (!project) {
                throw new BadRequestError('Personal project not found');
            }
            projectId = taskData.projectId;
        }
    }

    const task = await prisma.task.create({
        data: {
            title: taskData.title,
            description: taskData.description || null,
            scope: isTeam ? 'TEAM' : 'PERSONAL',
            ownerId: userId, // Server-derived, never trust client
            teamId,
            projectId,
            startAt: taskData.startAt ? new Date(taskData.startAt) : null,
            endAt: taskData.endAt ? new Date(taskData.endAt) : null,
            deadlineAt: taskData.deadlineAt ? new Date(taskData.deadlineAt) : null,
            estimatedDurationMinutes: taskData.estimatedDurationMinutes ?? 30,
            priority: taskData.priority || 'MEDIUM',
            scheduleType: taskData.scheduleType || 'FLEXIBLE',
            status: 'PENDING',
            assignees: isTeam && taskData.assigneeUserIds && taskData.assigneeUserIds.length > 0
                ? {
                    create: taskData.assigneeUserIds.map((assigneeId) => ({
                        userId: assigneeId,
                        assignedById: userId,
                    })),
                }
                : undefined,
        },
        include: {
            assignees: {
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            },
            project: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true, email: true } },
        },
    });

    return task;
}

/**
 * Retrieves paginated list of tasks for the authenticated user or team.
 */
async function listTasks(userId, query) {
    const prisma = await getPrisma();

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};

    if (query.scope === 'TEAM' || query.teamId) {
        if (!query.teamId) {
            throw new BadRequestError('teamId is required when requesting team tasks');
        }
        // Verify caller is an active member of this team
        const membership = await getActiveMembership(prisma, query.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Team not found');
        }

        where.teamId = query.teamId;
        where.scope = 'TEAM';

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        if (query.assigneeId) {
            where.assignees = {
                some: { userId: query.assigneeId },
            };
        }
    } else {
        // PERSONAL scope: strictly user's own tasks
        where.ownerId = userId;
        where.scope = 'PERSONAL';
    }

    if (query.priority) {
        where.priority = query.priority;
    }

    if (query.scheduleType) {
        where.scheduleType = query.scheduleType;
    }

    // Support comma-separated statuses e.g. "PENDING,IN_PROGRESS"
    if (query.status) {
        const statuses = query.status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (statuses.length === 1) {
            where.status = statuses[0];
        } else if (statuses.length > 1) {
            where.status = { in: statuses };
        }
    }

    // Text search in title or description
    if (query.search) {
        where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
        ];
    }

    // Date range filter
    if (query.from || query.to) {
        where.startAt = {};
        if (query.from) {
            where.startAt.gte = new Date(query.from);
        }
        if (query.to) {
            where.startAt.lte = new Date(query.to);
        }
    }

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [tasks, total] = await Promise.all([
        prisma.task.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            include: {
                timerSessions: {
                    where: { status: 'COMPLETED' },
                    select: { durationSeconds: true },
                },
                assignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                project: { select: { id: true, name: true } },
                owner: { select: { id: true, name: true, email: true } },
            },
        }),
        prisma.task.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const tasksWithFocus = tasks.map((task) => {
        const sessionsTotalSeconds = (task.timerSessions || []).reduce(
            (sum, s) => sum + (s.durationSeconds || 0),
            0
        );
        const { timerSessions, ...rest } = task;
        return {
            ...rest,
            accumulatedFocusSeconds: sessionsTotalSeconds,
            actualDurationMinutes: task.actualDurationMinutes || (sessionsTotalSeconds > 0 ? Math.round(sessionsTotalSeconds / 60) : null),
        };
    });

    return {
        tasks: tasksWithFocus,
        pagination: {
            page,
            limit,
            total,
            totalPages,
        },
    };
}

/**
 * Retrieves a single task ensuring caller authorization.
 */
async function getTaskById(userId, taskId) {
    const prisma = await getPrisma();

    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
            timerSessions: {
                where: { status: 'COMPLETED' },
                select: { durationSeconds: true },
            },
            assignees: {
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            },
            project: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true, email: true } },
        },
    });

    if (!task) {
        throw new NotFoundError('Task not found');
    }

    if (task.scope === 'PERSONAL') {
        if (task.ownerId !== userId) {
            throw new NotFoundError('Task not found');
        }
    } else if (task.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, task.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Task not found');
        }
    }

    const sessionsTotalSeconds = (task.timerSessions || []).reduce(
        (sum, s) => sum + (s.durationSeconds || 0),
        0
    );
    const { timerSessions, ...rest } = task;

    return {
        ...rest,
        accumulatedFocusSeconds: sessionsTotalSeconds,
        actualDurationMinutes: task.actualDurationMinutes || (sessionsTotalSeconds > 0 ? Math.round(sessionsTotalSeconds / 60) : null),
    };
}

/**
 * Updates a task with optimistic concurrency protection.
 */
async function updateTask(userId, taskId, updateData) {
    const prisma = await getPrisma();

    const existing = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!existing) {
        throw new NotFoundError('Task not found');
    }

    if (existing.scope === 'PERSONAL') {
        if (existing.ownerId !== userId) {
            throw new NotFoundError('Task not found');
        }
    } else if (existing.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, existing.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Task not found');
        }
    }

    // Optimistic Concurrency Check if version provided
    if (updateData.version !== undefined && updateData.version !== existing.version) {
        throw new ConflictError('Task was modified by another operation. Please reload.', [
            { field: 'version', expected: existing.version, received: updateData.version },
        ]);
    }

    const dataToUpdate = {
        version: { increment: 1 },
    };

    if (updateData.title !== undefined) dataToUpdate.title = updateData.title;
    if (updateData.description !== undefined) dataToUpdate.description = updateData.description;
    if (updateData.projectId !== undefined) dataToUpdate.projectId = updateData.projectId;
    if (updateData.priority !== undefined) dataToUpdate.priority = updateData.priority;
    if (updateData.scheduleType !== undefined) dataToUpdate.scheduleType = updateData.scheduleType;
    if (updateData.estimatedDurationMinutes !== undefined) {
        dataToUpdate.estimatedDurationMinutes = updateData.estimatedDurationMinutes;
    }

    if (updateData.startAt !== undefined) {
        dataToUpdate.startAt = updateData.startAt ? new Date(updateData.startAt) : null;
    }
    if (updateData.endAt !== undefined) {
        dataToUpdate.endAt = updateData.endAt ? new Date(updateData.endAt) : null;
    }
    if (updateData.deadlineAt !== undefined) {
        dataToUpdate.deadlineAt = updateData.deadlineAt ? new Date(updateData.deadlineAt) : null;
    }

    if (updateData.status !== undefined) {
        dataToUpdate.status = updateData.status;
        if (updateData.status === 'COMPLETED' && !existing.completedAt) {
            dataToUpdate.completedAt = new Date();
        } else if (updateData.status === 'PENDING' && existing.completedAt) {
            dataToUpdate.completedAt = null;
        }
    }

    return prisma.$transaction(async (tx) => {
        // Handle assignees update for team tasks
        if (existing.scope === 'TEAM' && updateData.assigneeUserIds !== undefined) {
            if (updateData.assigneeUserIds.length > 0) {
                const count = await tx.teamMembership.count({
                    where: {
                        teamId: existing.teamId,
                        userId: { in: updateData.assigneeUserIds },
                        status: 'ACTIVE',
                    },
                });
                if (count !== updateData.assigneeUserIds.length) {
                    throw new BadRequestError('All assignees must be active team members');
                }
            }

            // Remove existing assignees and recreate
            await tx.taskAssignee.deleteMany({
                where: { taskId },
            });

            if (updateData.assigneeUserIds.length > 0) {
                await tx.taskAssignee.createMany({
                    data: updateData.assigneeUserIds.map((uid) => ({
                        taskId,
                        userId: uid,
                        assignedById: userId,
                    })),
                });
            }
        }

        const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: dataToUpdate,
            include: {
                assignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                project: { select: { id: true, name: true } },
            },
        });

        return updatedTask;
    });
}

/**
 * Marks a task as COMPLETED, records completion timestamp and actual duration,
 * and completes any active timer sessions on the task.
 */
async function completeTask(userId, taskId, completeData = {}) {
    const prisma = await getPrisma();

    const existing = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!existing) {
        throw new NotFoundError('Task not found');
    }

    if (existing.scope === 'PERSONAL') {
        if (existing.ownerId !== userId) {
            throw new NotFoundError('Task not found');
        }
    } else if (existing.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, existing.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Task not found');
        }
    }

    const completedAt = new Date();
    const actualDurationMinutes = completeData.actualDurationMinutes !== undefined
        ? completeData.actualDurationMinutes
        : existing.estimatedDurationMinutes;

    const [updatedTask] = await Promise.all([
        prisma.task.update({
            where: { id: taskId },
            data: {
                status: 'COMPLETED',
                completedAt,
                actualDurationMinutes,
                version: { increment: 1 },
            },
        }),
        // Complete any open timer sessions for this task
        prisma.timerSession.updateMany({
            where: {
                taskId,
                userId,
                status: { in: ['RUNNING', 'PAUSED'] },
            },
            data: {
                status: 'COMPLETED',
                endedAt: completedAt,
            },
        }),
    ]);

    return updatedTask;
}

/**
 * Reopens a completed task back to PENDING.
 */
async function reopenTask(userId, taskId) {
    const prisma = await getPrisma();

    const existing = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!existing) {
        throw new NotFoundError('Task not found');
    }

    if (existing.scope === 'PERSONAL') {
        if (existing.ownerId !== userId) {
            throw new NotFoundError('Task not found');
        }
    } else if (existing.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, existing.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Task not found');
        }
    }

    const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
            status: 'PENDING',
            completedAt: null,
            version: { increment: 1 },
        },
    });

    return updatedTask;
}

/**
 * Deletes a task ensuring caller is the task owner or team admin/owner.
 */
async function deleteTask(userId, taskId) {
    const prisma = await getPrisma();

    const existing = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!existing) {
        throw new NotFoundError('Task not found');
    }

    if (existing.scope === 'PERSONAL') {
        if (existing.ownerId !== userId) {
            throw new NotFoundError('Task not found');
        }
    } else if (existing.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, existing.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Task not found');
        }
        // Only OWNER, ADMIN, or task creator can delete a team task
        if (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && existing.ownerId !== userId) {
            throw new ForbiddenError('Only team owners, admins, or the task creator can delete this task');
        }
    }

    await prisma.task.delete({
        where: { id: taskId },
    });

    return { id: taskId, deleted: true };
}

module.exports = {
    createTask,
    listTasks,
    getTaskById,
    updateTask,
    completeTask,
    reopenTask,
    deleteTask,
};
