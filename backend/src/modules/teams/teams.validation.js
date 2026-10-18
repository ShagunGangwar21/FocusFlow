'use strict';

/**
 * backend/src/modules/teams/teams.validation.js
 *
 * Validation schemas for Team Mode, Invitations, Roles, and Projects.
 * Conforms strictly to docs/API_CONTRACTS.md.
 */

const { z } = require('zod');

const TeamRoleEnum = z.enum(['ADMIN', 'MEMBER']);

const createTeamSchema = z.object({
    name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(80, 'Team name cannot exceed 80 characters'),
});

const updateTeamSchema = z.object({
    name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(80, 'Team name cannot exceed 80 characters'),
});

const createInvitationSchema = z.object({
    email: z.string().trim().email('Valid email address is required').toLowerCase(),
    role: TeamRoleEnum.default('MEMBER'),
});

const updateMemberRoleSchema = z.object({
    role: TeamRoleEnum,
});

const createProjectSchema = z.object({
    name: z.string().trim().min(1, 'Project name is required').max(100, 'Project name cannot exceed 100 characters'),
    description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().nullable(),
});

const updateProjectSchema = z.object({
    name: z.string().trim().min(1, 'Project name cannot be empty').max(100, 'Project name cannot exceed 100 characters').optional(),
    description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().nullable(),
});

module.exports = {
    createTeamSchema,
    updateTeamSchema,
    createInvitationSchema,
    updateMemberRoleSchema,
    createProjectSchema,
    updateProjectSchema,
};
