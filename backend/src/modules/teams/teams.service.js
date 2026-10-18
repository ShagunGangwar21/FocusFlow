'use strict';

/**
 * backend/src/modules/teams/teams.service.js
 *
 * Team collaboration business logic, role-based authorization,
 * invitation lifecycle, project management, and privacy enforcement.
 */

const crypto = require('crypto');
const { getPrisma } = require('../../../db/prisma');
const {
    NotFoundError,
    ForbiddenError,
    BadRequestError,
    ConflictError,
} = require('../../shared/errors/AppError');

/**
 * Helper: get active membership of a user in a team.
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
 * Create a new team. Caller becomes OWNER.
 */
async function createTeam(userId, data) {
    const prisma = await getPrisma();

    return prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
            data: {
                name: data.name,
                ownerId: userId,
            },
        });

        const membership = await tx.teamMembership.create({
            data: {
                teamId: team.id,
                userId,
                role: 'OWNER',
                status: 'ACTIVE',
            },
        });

        return {
            ...team,
            myRole: membership.role,
        };
    });
}

/**
 * List all teams the authenticated user belongs to.
 */
async function listTeams(userId) {
    const prisma = await getPrisma();

    const teams = await prisma.team.findMany({
        where: {
            memberships: {
                some: {
                    userId,
                    status: 'ACTIVE',
                },
            },
        },
        orderBy: { createdAt: 'desc' },
        include: {
            owner: {
                select: { id: true, name: true, email: true },
            },
            memberships: {
                where: { status: 'ACTIVE' },
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            },
            projects: {
                select: { id: true },
            },
            tasks: {
                where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
                select: { id: true },
            },
        },
    });

    return teams.map((team) => {
        const myMembership = team.memberships.find((m) => m.userId === userId);
        return {
            id: team.id,
            name: team.name,
            ownerId: team.ownerId,
            owner: team.owner,
            createdAt: team.createdAt,
            updatedAt: team.updatedAt,
            memberCount: team.memberships.length,
            projectCount: team.projects.length,
            activeTaskCount: team.tasks.length,
            myRole: myMembership ? myMembership.role : 'MEMBER',
            members: team.memberships.map((m) => ({
                id: m.id,
                userId: m.userId,
                role: m.role,
                joinedAt: m.joinedAt,
                user: m.user,
            })),
        };
    });
}

/**
 * Get detailed team information, including members and projects.
 * Restricted to active team members.
 */
async function getTeamById(userId, teamId) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
            owner: {
                select: { id: true, name: true, email: true },
            },
            memberships: {
                where: { status: 'ACTIVE' },
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
                orderBy: { joinedAt: 'asc' },
            },
            projects: {
                orderBy: { createdAt: 'desc' },
                include: {
                    tasks: {
                        select: { id: true, status: true },
                    },
                },
            },
            tasks: {
                where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
                select: { id: true, priority: true, status: true },
            },
        },
    });

    if (!team) {
        throw new NotFoundError('Team not found');
    }

    // Pending invitations are only visible to OWNER or ADMIN
    let invitations = [];
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
        invitations = await prisma.teamInvitation.findMany({
            where: {
                teamId,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    const projectsWithMetrics = team.projects.map((proj) => {
        const totalTasks = proj.tasks.length;
        const completedTasks = proj.tasks.filter((t) => t.status === 'COMPLETED').length;
        const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        return {
            id: proj.id,
            name: proj.name,
            description: proj.description,
            createdAt: proj.createdAt,
            updatedAt: proj.updatedAt,
            totalTasks,
            completedTasks,
            progressPercentage,
        };
    });

    return {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        owner: team.owner,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
        myRole: membership.role,
        memberCount: team.memberships.length,
        members: team.memberships.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            user: m.user,
        })),
        projects: projectsWithMetrics,
        invitations: invitations.map((inv) => ({
            id: inv.id,
            invitedEmail: inv.invitedEmail,
            role: inv.role,
            expiresAt: inv.expiresAt,
            createdAt: inv.createdAt,
            createdBy: inv.createdBy,
        })),
        activeTaskCount: team.tasks.length,
    };
}

/**
 * Update team settings (name). Restricted to team OWNER.
 */
async function updateTeam(userId, teamId, data) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    if (membership.role !== 'OWNER') {
        throw new ForbiddenError('Only the team owner can update team settings');
    }

    const updated = await prisma.team.update({
        where: { id: teamId },
        data: { name: data.name },
    });

    return updated;
}

/**
 * Delete a team. Restricted to team OWNER.
 */
async function deleteTeam(userId, teamId) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    if (membership.role !== 'OWNER') {
        throw new ForbiddenError('Only the team owner can delete the team');
    }

    await prisma.team.delete({
        where: { id: teamId },
    });

    return { success: true, message: 'Team deleted successfully' };
}

/**
 * Create a team invitation. Restricted to OWNER or ADMIN.
 * Generates an unhashed 32-byte hex token and stores its SHA-256 hash.
 */
async function createInvitation(userId, teamId, data) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        throw new ForbiddenError('Only team owners and admins can invite members');
    }

    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if target user is already an active member
    const existingActiveMember = await prisma.teamMembership.findFirst({
        where: {
            teamId,
            status: 'ACTIVE',
            user: { email: normalizedEmail },
        },
    });

    if (existingActiveMember) {
        throw new ConflictError('User is already an active member of this team');
    }

    // Revoke any previous active, unaccepted invitation for this email
    await prisma.teamInvitation.updateMany({
        where: {
            teamId,
            invitedEmail: normalizedEmail,
            acceptedAt: null,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

    const invitation = await prisma.teamInvitation.create({
        data: {
            teamId,
            invitedEmail: normalizedEmail,
            tokenHash,
            role: data.role || 'MEMBER',
            expiresAt,
            createdById: userId,
        },
        include: {
            team: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true, email: true } },
        },
    });

    return {
        id: invitation.id,
        teamId: invitation.teamId,
        teamName: invitation.team.name,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        createdBy: invitation.createdBy,
        token, // Unhashed token returned only upon creation
    };
}

/**
 * Preview an invitation by unhashed token.
 */
async function getInvitationByToken(token) {
    const prisma = await getPrisma();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const invitation = await prisma.teamInvitation.findUnique({
        where: { tokenHash },
        include: {
            team: {
                select: { id: true, name: true },
            },
            createdBy: {
                select: { id: true, name: true, email: true },
            },
        },
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
        throw new NotFoundError('Invitation not found or is no longer valid');
    }

    if (new Date(invitation.expiresAt) < new Date()) {
        throw new BadRequestError('Invitation has expired');
    }

    return {
        id: invitation.id,
        teamId: invitation.teamId,
        teamName: invitation.team.name,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdBy: invitation.createdBy,
    };
}

/**
 * Accept an invitation. Authenticated user must match the invited email.
 */
async function acceptInvitation(userId, token) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const invitation = await prisma.teamInvitation.findUnique({
        where: { tokenHash },
        include: { team: true },
    });

    if (!invitation) {
        throw new NotFoundError('Invitation not found');
    }

    if (invitation.revokedAt) {
        throw new BadRequestError('Invitation has been revoked');
    }

    if (invitation.acceptedAt) {
        throw new BadRequestError('Invitation has already been accepted');
    }

    if (new Date(invitation.expiresAt) < new Date()) {
        throw new BadRequestError('Invitation has expired');
    }

    // Security check: authenticated user email must match invitation target
    if (user.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
        throw new ForbiddenError(
            `This invitation was issued for ${invitation.invitedEmail}, but you are signed in as ${user.email}`
        );
    }

    // Check if user is already an active member
    const existingMembership = await prisma.teamMembership.findUnique({
        where: {
            teamId_userId: {
                teamId: invitation.teamId,
                userId,
            },
        },
    });

    if (existingMembership && existingMembership.status === 'ACTIVE') {
        throw new ConflictError('You are already an active member of this team');
    }

    return prisma.$transaction(async (tx) => {
        let membership;
        if (existingMembership) {
            membership = await tx.teamMembership.update({
                where: { id: existingMembership.id },
                data: {
                    status: 'ACTIVE',
                    role: invitation.role,
                    joinedAt: new Date(),
                },
            });
        } else {
            membership = await tx.teamMembership.create({
                data: {
                    teamId: invitation.teamId,
                    userId,
                    role: invitation.role,
                    status: 'ACTIVE',
                },
            });
        }

        await tx.teamInvitation.update({
            where: { id: invitation.id },
            data: { acceptedAt: new Date() },
        });

        return {
            teamId: invitation.teamId,
            teamName: invitation.team.name,
            role: membership.role,
            membershipId: membership.id,
        };
    });
}

/**
 * Revoke an active invitation. Restricted to OWNER or ADMIN.
 */
async function revokeInvitation(userId, teamId, invitationId) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        throw new ForbiddenError('Only team owners and admins can revoke invitations');
    }

    const invitation = await prisma.teamInvitation.findFirst({
        where: { id: invitationId, teamId },
    });

    if (!invitation) {
        throw new NotFoundError('Invitation not found');
    }

    if (invitation.revokedAt) {
        return { success: true, message: 'Invitation already revoked' };
    }

    await prisma.teamInvitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
    });

    return { success: true, message: 'Invitation revoked successfully' };
}

/**
 * Update member role (ADMIN / MEMBER). Restricted to team OWNER only.
 * Prevents unauthorized role escalation and changing primary owner's role.
 */
async function updateMemberRole(userId, teamId, targetUserId, newRole) {
    const prisma = await getPrisma();

    const callerMembership = await getActiveMembership(prisma, teamId, userId);
    if (!callerMembership) {
        throw new NotFoundError('Team not found');
    }

    if (callerMembership.role !== 'OWNER') {
        throw new ForbiddenError('Only the team owner can modify member roles');
    }

    if (userId === targetUserId) {
        throw new BadRequestError('Cannot change your own role directly');
    }

    const targetMembership = await getActiveMembership(prisma, teamId, targetUserId);
    if (!targetMembership) {
        throw new NotFoundError('Target user is not an active member of this team');
    }

    const updated = await prisma.teamMembership.update({
        where: { id: targetMembership.id },
        data: { role: newRole },
        include: {
            user: { select: { id: true, name: true, email: true } },
        },
    });

    return {
        id: updated.id,
        userId: updated.userId,
        role: updated.role,
        user: updated.user,
    };
}

/**
 * Remove a member from the team or voluntary leave.
 * Safeguards:
 * - Prevent removal of the last owner.
 * - Admins cannot remove other admins or owners.
 * - Regular members can only remove themselves (leave).
 * - Unassigns removed user from pending team tasks without deleting task records.
 */
async function removeMember(userId, teamId, targetUserId) {
    const prisma = await getPrisma();

    const callerMembership = await getActiveMembership(prisma, teamId, userId);
    if (!callerMembership) {
        throw new NotFoundError('Team not found');
    }

    const targetMembership = await getActiveMembership(prisma, teamId, targetUserId);
    if (!targetMembership) {
        throw new NotFoundError('Member not found');
    }

    const team = await prisma.team.findUnique({
        where: { id: teamId },
    });

    const isVoluntaryLeave = userId === targetUserId;

    if (isVoluntaryLeave) {
        // Prevent last owner from leaving without deleting team or transferring ownership
        if (team.ownerId === targetUserId) {
            throw new BadRequestError(
                'The team owner cannot leave the team without transferring ownership or deleting the team'
            );
        }
    } else {
        // Administrative removal checks
        if (callerMembership.role === 'MEMBER') {
            throw new ForbiddenError('Regular members cannot remove other members');
        }

        if (callerMembership.role === 'ADMIN') {
            if (targetMembership.role === 'OWNER' || targetMembership.role === 'ADMIN') {
                throw new ForbiddenError('Admins cannot remove the team owner or other admins');
            }
        }
    }

    return prisma.$transaction(async (tx) => {
        // Delete membership
        await tx.teamMembership.delete({
            where: { id: targetMembership.id },
        });

        // Unassign target user from pending/in-progress team tasks
        await tx.taskAssignee.deleteMany({
            where: {
                userId: targetUserId,
                task: {
                    teamId,
                    status: { in: ['PENDING', 'IN_PROGRESS'] },
                },
            },
        });

        return {
            success: true,
            message: isVoluntaryLeave ? 'You have left the team' : 'Member removed successfully',
        };
    });
}

// ----------------------------------------------------
// PROJECT MANAGEMENT
// ----------------------------------------------------

/**
 * Create a team project. Restricted to OWNER or ADMIN.
 */
async function createProject(userId, teamId, data) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        throw new ForbiddenError('Only team owners and admins can create projects');
    }

    const project = await prisma.project.create({
        data: {
            name: data.name,
            description: data.description || null,
            scope: 'TEAM',
            teamId,
            ownerId: userId,
        },
    });

    return project;
}

/**
 * List all projects for a team. Restricted to active team members.
 */
async function listProjects(userId, teamId) {
    const prisma = await getPrisma();

    const membership = await getActiveMembership(prisma, teamId, userId);
    if (!membership) {
        throw new NotFoundError('Team not found');
    }

    const projects = await prisma.project.findMany({
        where: {
            teamId,
            scope: 'TEAM',
        },
        orderBy: { createdAt: 'desc' },
        include: {
            tasks: {
                select: { id: true, status: true },
            },
        },
    });

    return projects.map((p) => {
        const totalTasks = p.tasks.length;
        const completedTasks = p.tasks.filter((t) => t.status === 'COMPLETED').length;
        const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        return {
            id: p.id,
            name: p.name,
            description: p.description,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            totalTasks,
            completedTasks,
            progressPercentage,
        };
    });
}

/**
 * Get project details with task list. Restricted to active team members.
 */
async function getProjectById(userId, projectId) {
    const prisma = await getPrisma();

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            tasks: {
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
                include: {
                    assignees: {
                        include: {
                            user: { select: { id: true, name: true, email: true } },
                        },
                    },
                },
            },
        },
    });

    if (!project) {
        throw new NotFoundError('Project not found');
    }

    if (project.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, project.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Project not found');
        }
    } else {
        if (project.ownerId !== userId) {
            throw new NotFoundError('Project not found');
        }
    }

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((t) => t.status === 'COMPLETED').length;
    const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
        id: project.id,
        name: project.name,
        description: project.description,
        scope: project.scope,
        teamId: project.teamId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        totalTasks,
        completedTasks,
        progressPercentage,
        tasks: project.tasks,
    };
}

/**
 * Update project. Restricted to team OWNER or ADMIN.
 */
async function updateProject(userId, projectId, data) {
    const prisma = await getPrisma();

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });

    if (!project) {
        throw new NotFoundError('Project not found');
    }

    if (project.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, project.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Project not found');
        }
        if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
            throw new ForbiddenError('Only team owners and admins can edit projects');
        }
    } else {
        if (project.ownerId !== userId) {
            throw new NotFoundError('Project not found');
        }
    }

    const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
            name: data.name !== undefined ? data.name : project.name,
            description: data.description !== undefined ? data.description : project.description,
        },
    });

    return updated;
}

/**
 * Delete / Archive project. Restricted to team OWNER or ADMIN.
 */
async function deleteProject(userId, projectId) {
    const prisma = await getPrisma();

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });

    if (!project) {
        throw new NotFoundError('Project not found');
    }

    if (project.scope === 'TEAM') {
        const membership = await getActiveMembership(prisma, project.teamId, userId);
        if (!membership) {
            throw new NotFoundError('Project not found');
        }
        if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
            throw new ForbiddenError('Only team owners and admins can delete projects');
        }
    } else {
        if (project.ownerId !== userId) {
            throw new NotFoundError('Project not found');
        }
    }

    await prisma.project.delete({
        where: { id: projectId },
    });

    return { success: true, message: 'Project deleted successfully' };
}

module.exports = {
    createTeam,
    listTeams,
    getTeamById,
    updateTeam,
    deleteTeam,
    createInvitation,
    getInvitationByToken,
    acceptInvitation,
    revokeInvitation,
    updateMemberRole,
    removeMember,
    createProject,
    listProjects,
    getProjectById,
    updateProject,
    deleteProject,
};
