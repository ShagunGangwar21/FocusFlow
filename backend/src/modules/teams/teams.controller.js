'use strict';

/**
 * backend/src/modules/teams/teams.controller.js
 *
 * Controllers for Teams, Invitations, Members, and Projects.
 */

const teamsService = require('./teams.service');

async function createTeam(req, res, next) {
    try {
        const team = await teamsService.createTeam(req.user.id, req.body);
        return res.status(201).json({
            data: team,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function listTeams(req, res, next) {
    try {
        const teams = await teamsService.listTeams(req.user.id);
        return res.status(200).json({
            data: teams,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function getTeamById(req, res, next) {
    try {
        const team = await teamsService.getTeamById(req.user.id, req.params.teamId);
        return res.status(200).json({
            data: team,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function updateTeam(req, res, next) {
    try {
        const updated = await teamsService.updateTeam(req.user.id, req.params.teamId, req.body);
        return res.status(200).json({
            data: updated,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function deleteTeam(req, res, next) {
    try {
        const result = await teamsService.deleteTeam(req.user.id, req.params.teamId);
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function createInvitation(req, res, next) {
    try {
        const invitation = await teamsService.createInvitation(req.user.id, req.params.teamId, req.body);
        return res.status(201).json({
            data: invitation,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function getInvitationByToken(req, res, next) {
    try {
        const invitation = await teamsService.getInvitationByToken(req.params.token);
        return res.status(200).json({
            data: invitation,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function acceptInvitation(req, res, next) {
    try {
        const result = await teamsService.acceptInvitation(req.user.id, req.params.token);
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function revokeInvitation(req, res, next) {
    try {
        const result = await teamsService.revokeInvitation(
            req.user.id,
            req.params.teamId,
            req.params.invitationId
        );
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function updateMemberRole(req, res, next) {
    try {
        const updated = await teamsService.updateMemberRole(
            req.user.id,
            req.params.teamId,
            req.params.userId,
            req.body.role
        );
        return res.status(200).json({
            data: updated,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function removeMember(req, res, next) {
    try {
        const result = await teamsService.removeMember(
            req.user.id,
            req.params.teamId,
            req.params.userId
        );
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function createProject(req, res, next) {
    try {
        const project = await teamsService.createProject(
            req.user.id,
            req.params.teamId,
            req.body
        );
        return res.status(201).json({
            data: project,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function listProjects(req, res, next) {
    try {
        const projects = await teamsService.listProjects(req.user.id, req.params.teamId);
        return res.status(200).json({
            data: projects,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function getProjectById(req, res, next) {
    try {
        const project = await teamsService.getProjectById(req.user.id, req.params.projectId);
        return res.status(200).json({
            data: project,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function updateProject(req, res, next) {
    try {
        const updated = await teamsService.updateProject(
            req.user.id,
            req.params.projectId,
            req.body
        );
        return res.status(200).json({
            data: updated,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function deleteProject(req, res, next) {
    try {
        const result = await teamsService.deleteProject(req.user.id, req.params.projectId);
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
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
