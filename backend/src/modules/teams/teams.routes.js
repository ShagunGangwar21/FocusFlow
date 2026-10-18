'use strict';

/**
 * backend/src/modules/teams/teams.routes.js
 *
 * Express routes for Teams, Invitations, and Projects.
 */

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { validate } = require('../../middleware/validate');
const teamsController = require('./teams.controller');
const {
    createTeamSchema,
    updateTeamSchema,
    createInvitationSchema,
    updateMemberRoleSchema,
    createProjectSchema,
    updateProjectSchema,
} = require('./teams.validation');

const teamsRouter = express.Router();
const invitationsRouter = express.Router();
const projectsRouter = express.Router();

// ----------------------------------------------------
// TEAMS ROUTES (/api/v1/teams)
// ----------------------------------------------------
teamsRouter.use(authenticate);

teamsRouter.post('/', validate(createTeamSchema), teamsController.createTeam);
teamsRouter.get('/', teamsController.listTeams);
teamsRouter.get('/:teamId', teamsController.getTeamById);
teamsRouter.patch('/:teamId', validate(updateTeamSchema), teamsController.updateTeam);
teamsRouter.delete('/:teamId', teamsController.deleteTeam);

// Team Members
teamsRouter.patch('/:teamId/members/:userId', validate(updateMemberRoleSchema), teamsController.updateMemberRole);
teamsRouter.delete('/:teamId/members/:userId', teamsController.removeMember);

// Team Invitations
teamsRouter.post('/:teamId/invitations', validate(createInvitationSchema), teamsController.createInvitation);
teamsRouter.delete('/:teamId/invitations/:invitationId', teamsController.revokeInvitation);

// Team Projects
teamsRouter.post('/:teamId/projects', validate(createProjectSchema), teamsController.createProject);
teamsRouter.get('/:teamId/projects', teamsController.listProjects);

// ----------------------------------------------------
// INVITATIONS ROUTES (/api/v1/invitations)
// ----------------------------------------------------
invitationsRouter.get('/:token', teamsController.getInvitationByToken);
invitationsRouter.post('/:token/accept', authenticate, teamsController.acceptInvitation);

// ----------------------------------------------------
// PROJECTS ROUTES (/api/v1/projects)
// ----------------------------------------------------
projectsRouter.use(authenticate);

projectsRouter.get('/:projectId', teamsController.getProjectById);
projectsRouter.patch('/:projectId', validate(updateProjectSchema), teamsController.updateProject);
projectsRouter.delete('/:projectId', teamsController.deleteProject);

module.exports = {
    teamsRouter,
    invitationsRouter,
    projectsRouter,
};
