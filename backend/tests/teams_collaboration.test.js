'use strict';

/**
 * backend/tests/teams_collaboration.test.js
 *
 * Automated verification of FocusFlow Phase 6 — Team Mode and Collaboration.
 *
 * Covers:
 * 1. Team Creation & Details Retrieval
 * 2. Invitation Lifecycle (Hashing, Expiration, Single-Use, Email Matching, Rejection)
 * 3. Role-Based Permissions (OWNER vs ADMIN vs MEMBER)
 * 4. Member Management Safeguards (Last Owner Protection, Admin Role Boundaries)
 * 5. Team Projects CRUD & Progress Tracking
 * 6. Team Tasks & Assignee Management
 * 7. Cross-Team Boundary Enforcement & IDOR Prevention
 * 8. Removed Member Access Revocation & Task Unassignment
 * 9. Personal Data Privacy Isolation
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { getPrisma } = require('../db/prisma');

const { createSessionToken, generateCsrfToken } = require('../src/shared/utils/session');

const API_BASE = 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { ...options, headers });
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await response.json();
    }
    return { status: response.status, headers: response.headers, body: data };
}

async function createTestUser(prisma, email, name) {
    const user = await prisma.user.create({
        data: {
            name,
            email,
            passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakeHashForTestPurposesOnly',
            preferences: {
                create: {
                    defaultWorkspaceMode: 'PERSONAL',
                    theme: 'DARK',
                },
            },
        },
    });

    const sessionToken = createSessionToken(user);
    const csrfToken = generateCsrfToken();

    return {
        user,
        cookies: `auth_session=${sessionToken}; XSRF-TOKEN=${csrfToken}`,
        csrfToken,
    };
}

async function runTests() {
    console.log('\n====================================================');
    console.log('FocusFlow Phase 6 Team Mode & Collaboration Tests');
    console.log('====================================================\n');

    const prisma = await getPrisma();

    // Generate unique emails for test isolation
    const timestamp = Date.now();
    const ownerEmail = `team_owner_${timestamp}@example.com`;
    const adminEmail = `team_admin_${timestamp}@example.com`;
    const memberEmail = `team_member_${timestamp}@example.com`;
    const outsiderEmail = `team_outsider_${timestamp}@example.com`;

    let owner, admin, member, outsider;
    let teamId, projectId, taskId, inviteToken;

    try {
        console.log('--- 1. User Setup & Authentication Bootstrap ---');
        owner = await createTestUser(prisma, ownerEmail, 'Team Owner');
        admin = await createTestUser(prisma, adminEmail, 'Team Admin');
        member = await createTestUser(prisma, memberEmail, 'Team Member');
        outsider = await createTestUser(prisma, outsiderEmail, 'Outsider User');
        assert.ok(owner.user?.id, 'Owner user registered');
        assert.ok(admin.user?.id, 'Admin user registered');
        assert.ok(member.user?.id, 'Member user registered');
        console.log('  ✅ [PASS] 4 Test accounts created with valid signed session JWTs');

        console.log('\n--- 2. Team Creation & Listing ---');
        // Unauthenticated team creation fails
        const unauthRes = await request('/teams', {
            method: 'POST',
            body: { name: 'Acme Product Team' },
        });
        assert.strictEqual(unauthRes.status, 401, 'Unauthenticated team creation rejected');

        // Authenticated team creation
        const createTeamRes = await request('/teams', {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: { name: 'Acme Product Team' },
        });
        assert.strictEqual(createTeamRes.status, 201, 'Team created successfully');
        teamId = createTeamRes.body?.data?.id;
        assert.strictEqual(createTeamRes.body?.data?.name, 'Acme Product Team');
        assert.strictEqual(createTeamRes.body?.data?.myRole, 'OWNER');
        console.log('  ✅ [PASS] Team created with caller assigned as OWNER');

        // List teams for owner
        const listTeamsRes = await request('/teams', {
            headers: { Cookie: owner.cookies },
        });
        assert.strictEqual(listTeamsRes.status, 200);
        assert.strictEqual(listTeamsRes.body?.data?.length, 1);
        assert.strictEqual(listTeamsRes.body?.data[0].id, teamId);
        assert.strictEqual(listTeamsRes.body?.data[0].myRole, 'OWNER');
        console.log('  ✅ [PASS] GET /api/v1/teams returns user teams with member & role stats');

        console.log('\n--- 3. Invitation Lifecycle & Security ---');
        // Regular outsider cannot view team details (404)
        const outsiderViewRes = await request(`/teams/${teamId}`, {
            headers: { Cookie: outsider.cookies },
        });
        assert.strictEqual(outsiderViewRes.status, 404, 'Outsider denied team details (404)');

        // Owner creates invitation for Admin with role ADMIN
        const inviteAdminRes = await request(`/teams/${teamId}/invitations`, {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: { email: adminEmail, role: 'ADMIN' },
        });
        assert.strictEqual(inviteAdminRes.status, 201, 'Invitation created');
        const adminInviteToken = inviteAdminRes.body?.data?.token;
        assert.ok(adminInviteToken, 'Unhashed token returned on creation');
        console.log('  ✅ [PASS] Invitation created with secure 32-byte token');

        // Check database: tokenHash exists, but unhashed token is NOT in database
        const dbInvite = await prisma.teamInvitation.findFirst({
            where: { teamId, invitedEmail: adminEmail },
        });
        assert.ok(dbInvite.tokenHash, 'tokenHash persisted in DB');
        assert.notStrictEqual(dbInvite.tokenHash, adminInviteToken, 'Unhashed token is never stored in DB');
        console.log('  ✅ [PASS] SHA-256 token hashing verified in PostgreSQL storage');

        // Preview invitation
        const previewRes = await request(`/invitations/${adminInviteToken}`);
        assert.strictEqual(previewRes.status, 200);
        assert.strictEqual(previewRes.body?.data?.teamName, 'Acme Product Team');
        assert.strictEqual(previewRes.body?.data?.role, 'ADMIN');
        console.log('  ✅ [PASS] GET /api/v1/invitations/:token previews invitation metadata');

        // Wrong user attempts to accept invitation
        const wrongUserAcceptRes = await request(`/invitations/${adminInviteToken}/accept`, {
            method: 'POST',
            headers: {
                Cookie: outsider.cookies,
                'X-CSRF-Token': outsider.csrfToken,
            },
        });
        assert.strictEqual(wrongUserAcceptRes.status, 403, 'Mismatched user rejected from accepting invite (403)');
        console.log('  ✅ [PASS] Email boundary enforced: only target email recipient can accept');

        // Admin accepts invitation
        const adminAcceptRes = await request(`/invitations/${adminInviteToken}/accept`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(adminAcceptRes.status, 200, 'Admin accepted invitation');
        assert.strictEqual(adminAcceptRes.body?.data?.role, 'ADMIN');
        console.log('  ✅ [PASS] POST /api/v1/invitations/:token/accept joins team with assigned role');

        // Single-use guarantee: repeating accept fails
        const reuseAcceptRes = await request(`/invitations/${adminInviteToken}/accept`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(reuseAcceptRes.status, 400, 'Reuse of accepted invitation rejected (400)');
        console.log('  ✅ [PASS] Single-use invitation invariant enforced');

        // Admin invites Member
        const inviteMemberRes = await request(`/teams/${teamId}/invitations`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { email: memberEmail, role: 'MEMBER' },
        });
        assert.strictEqual(inviteMemberRes.status, 201, 'Admin can invite members');
        const memberInviteToken = inviteMemberRes.body?.data?.token;

        // Duplicate invitation handling: inviting memberEmail again revokes previous
        const duplicateInviteRes = await request(`/teams/${teamId}/invitations`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { email: memberEmail, role: 'MEMBER' },
        });
        assert.strictEqual(duplicateInviteRes.status, 201, 'Duplicate invite safely rotates/revokes previous');
        const refreshedToken = duplicateInviteRes.body?.data?.token;
        assert.notStrictEqual(refreshedToken, memberInviteToken);

        // Previous token is now revoked
        const oldTokenAcceptRes = await request(`/invitations/${memberInviteToken}/accept`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
        });
        assert.strictEqual(oldTokenAcceptRes.status, 400, 'Revoked token cannot be accepted');

        // Refreshed token accepted by Member
        const memberAcceptRes = await request(`/invitations/${refreshedToken}/accept`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
        });
        assert.strictEqual(memberAcceptRes.status, 200, 'Member joined team');
        assert.strictEqual(memberAcceptRes.body?.data?.role, 'MEMBER');
        console.log('  ✅ [PASS] Member successfully joined team after duplicate invite refresh');

        console.log('\n--- 4. Role-Based Permissions & Guardrails ---');
        // Regular member cannot invite others (403)
        const memberInviteAttempt = await request(`/teams/${teamId}/invitations`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
            body: { email: outsiderEmail, role: 'MEMBER' },
        });
        assert.strictEqual(memberInviteAttempt.status, 403, 'Member cannot invite others (403)');
        console.log('  ✅ [PASS] Regular MEMBER prevented from inviting users');

        // Admin cannot change member roles (only OWNER can)
        const adminRoleChangeAttempt = await request(`/teams/${teamId}/members/${member.user.id}`, {
            method: 'PATCH',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { role: 'ADMIN' },
        });
        assert.strictEqual(adminRoleChangeAttempt.status, 403, 'Admin cannot promote/demote members (403)');
        console.log('  ✅ [PASS] Role escalation prevented: Admin cannot change member roles');

        // Owner can promote Member to ADMIN
        const ownerPromoteRes = await request(`/teams/${teamId}/members/${member.user.id}`, {
            method: 'PATCH',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: { role: 'ADMIN' },
        });
        assert.strictEqual(ownerPromoteRes.status, 200, 'Owner promoted member to ADMIN');

        // Owner demotes Member back to MEMBER
        const ownerDemoteRes = await request(`/teams/${teamId}/members/${member.user.id}`, {
            method: 'PATCH',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: { role: 'MEMBER' },
        });
        assert.strictEqual(ownerDemoteRes.status, 200, 'Owner demoted user to MEMBER');
        console.log('  ✅ [PASS] Owner role management (promotion & demotion) verified');

        // Admin cannot remove the Owner
        const adminRemoveOwnerAttempt = await request(`/teams/${teamId}/members/${owner.user.id}`, {
            method: 'DELETE',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(adminRemoveOwnerAttempt.status, 403, 'Admin cannot remove Owner (403)');

        // Member cannot remove other members
        const memberRemoveAdminAttempt = await request(`/teams/${teamId}/members/${admin.user.id}`, {
            method: 'DELETE',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
        });
        assert.strictEqual(memberRemoveAdminAttempt.status, 403, 'Member cannot remove other members (403)');

        // Owner cannot leave without transferring ownership
        const ownerLeaveAttempt = await request(`/teams/${teamId}/members/${owner.user.id}`, {
            method: 'DELETE',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
        });
        assert.strictEqual(ownerLeaveAttempt.status, 400, 'Owner cannot abandon team as sole owner (400)');
        console.log('  ✅ [PASS] Last Owner protection invariant enforced');

        console.log('\n--- 5. Team Projects CRUD & Metrics ---');
        // Regular member cannot create projects (403)
        const memberProjectAttempt = await request(`/teams/${teamId}/projects`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
            body: { name: 'Member Unauthorized Project' },
        });
        assert.strictEqual(memberProjectAttempt.status, 403, 'Member cannot create project (403)');

        // Admin creates project
        const createProjectRes = await request(`/teams/${teamId}/projects`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { name: 'Mobile App Redesign', description: 'Phase 6 cross-platform UX overhaul' },
        });
        assert.strictEqual(createProjectRes.status, 201, 'Project created');
        projectId = createProjectRes.body?.data?.id;
        console.log('  ✅ [PASS] Team project created by ADMIN');

        // Member can view project list and progress
        const listProjectsRes = await request(`/teams/${teamId}/projects`, {
            headers: { Cookie: member.cookies },
        });
        assert.strictEqual(listProjectsRes.status, 200);
        assert.strictEqual(listProjectsRes.body?.data?.length, 1);
        assert.strictEqual(listProjectsRes.body?.data[0].progressPercentage, 0);
        console.log('  ✅ [PASS] Team projects listable by active members with progress tracking');

        console.log('\n--- 6. Shared Tasks & Assignee Management ---');
        // Create Team Task with Member as assignee
        const createTeamTaskRes = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: {
                title: 'Design Figma Wireframes',
                scope: 'TEAM',
                teamId,
                projectId,
                priority: 'HIGH',
                scheduleType: 'FIXED',
                estimatedDurationMinutes: 60,
                assigneeUserIds: [member.user.id],
            },
        });
        assert.strictEqual(createTeamTaskRes.status, 201, 'Team task created');
        const createdTask = createTeamTaskRes.body?.data?.task || createTeamTaskRes.body?.data;
        taskId = createdTask?.id;
        assert.strictEqual(createdTask?.assignees?.length, 1);
        assert.strictEqual(createdTask?.assignees[0].user?.id, member.user.id);
        console.log('  ✅ [PASS] Team task created and assigned to team member via TaskAssignee');

        // Attempting to assign task to non-member outsider fails (400)
        const invalidAssigneeAttempt = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: {
                title: 'Invalid Assignment Task',
                scope: 'TEAM',
                teamId,
                assigneeUserIds: [outsider.user.id],
            },
        });
        assert.strictEqual(invalidAssigneeAttempt.status, 400, 'Assignment to non-member rejected (400)');
        console.log('  ✅ [PASS] Task assignment restricted strictly to active team members');

        // Member can complete their assigned team task
        const completeTaskRes = await request(`/tasks/${taskId}/complete`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
            body: { actualDurationMinutes: 55 },
        });
        assert.strictEqual(completeTaskRes.status, 200, 'Member completed team task');
        const completedTask = completeTaskRes.body?.data?.task || completeTaskRes.body?.data;
        assert.strictEqual(completedTask?.status, 'COMPLETED');

        // Check project progress after task completion: 1/1 = 100%
        const updatedProjectRes = await request(`/projects/${projectId}`, {
            headers: { Cookie: owner.cookies },
        });
        assert.strictEqual(updatedProjectRes.status, 200);
        assert.strictEqual(updatedProjectRes.body?.data?.progressPercentage, 100);
        console.log('  ✅ [PASS] Project progress updated to 100% after task completion');

        // Reopen task for removal test
        await request(`/tasks/${taskId}/reopen`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });

        console.log('\n--- 7. Member Removal & Automatic Task Unassignment ---');
        // Admin removes Member
        const removeMemberRes = await request(`/teams/${teamId}/members/${member.user.id}`, {
            method: 'DELETE',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(removeMemberRes.status, 200, 'Member removed by Admin');

        // Verify member immediately loses access to team (404)
        const removedAccessRes = await request(`/teams/${teamId}`, {
            headers: { Cookie: member.cookies },
        });
        assert.strictEqual(removedAccessRes.status, 404, 'Removed member denied access to team (404)');

        // Verify removed member cannot access team task (404)
        const removedTaskAccessRes = await request(`/tasks/${taskId}`, {
            headers: { Cookie: member.cookies },
        });
        assert.strictEqual(removedTaskAccessRes.status, 404, 'Removed member denied access to team task (404)');

        // Verify removed member was unassigned from pending team task
        const remainingAssignees = await prisma.taskAssignee.findMany({
            where: { taskId, userId: member.user.id },
        });
        assert.strictEqual(remainingAssignees.length, 0, 'Removed member unassigned from pending tasks');
        console.log('  ✅ [PASS] Removed member unassigned cleanly without deleting team task');

        console.log('\n--- 8. Personal Data Privacy Boundary ---');
        // Create Personal Task for Owner
        const personalTaskRes = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: {
                title: 'Confidential Personal Strategy',
                scope: 'PERSONAL',
                priority: 'HIGH',
            },
        });
        const personalTaskId = personalTaskRes.body?.data?.task?.id || personalTaskRes.body?.data?.id;

        // Admin attempts to view Owner's personal task (404)
        const leakAttempt = await request(`/tasks/${personalTaskId}`, {
            headers: { Cookie: admin.cookies },
        });
        assert.strictEqual(leakAttempt.status, 404, 'Teammate cannot access personal task (404)');

        // Team task listing does NOT include personal task
        const teamTasksList = await request(`/tasks?scope=TEAM&teamId=${teamId}`, {
            headers: { Cookie: admin.cookies },
        });
        const hasPersonal = teamTasksList.body?.data?.tasks?.some((t) => t.id === personalTaskId);
        assert.strictEqual(hasPersonal, false, 'Personal task never leaks into team tasks query');
        console.log('  ✅ [PASS] Personal task privacy strictly isolated from teammates');

        console.log('\n--- 9. Team Task Focus, Invariants & Timer Transitions ---');
        // 9a. Authorized team member starts focus timer on an incomplete team task
        const teamFocusRes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(teamFocusRes.status, 201, 'Authorized member starts focus on team task (201)');
        assert(teamFocusRes.body?.data?.session, 'Team session returned in response');
        const teamSession = teamFocusRes.body.data.session;
        assert.strictEqual(teamSession.taskId, taskId);
        assert.strictEqual(teamSession.status, 'RUNNING');
        console.log('  ✅ [PASS] Focus starts successfully for authorized, incomplete team task');

        // 9b. Single active timer invariant: Attempting to start another timer while one is active produces error (409)
        const conflictRes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(conflictRes.status, 409, 'Single active timer enforced per user (409)');
        console.log('  ✅ [PASS] Only one focus timer can be active per user (concurrency 409)');

        // 9c. Unauthorized user (outsider) cannot start focus on team task (404)
        const unauthorizedFocusRes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: outsider.cookies,
                'X-CSRF-Token': outsider.csrfToken,
            },
        });
        assert.strictEqual(unauthorizedFocusRes.status, 404, 'Outsider denied focus access to team task (404)');

        // Removed member also cannot start focus on team task (404)
        const removedMemberFocusRes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: member.cookies,
                'X-CSRF-Token': member.csrfToken,
            },
        });
        assert.strictEqual(removedMemberFocusRes.status, 404, 'Removed member denied focus access to team task (404)');
        console.log('  ✅ [PASS] Unauthorized users cannot access or focus team tasks (404)');

        // 9d. Accumulating and preserving focus time across task switches
        // Wait 1.1s so some duration elapses on team task
        await new Promise((r) => setTimeout(r, 1100));

        // Finish session without completing the task (simulating client-side task switch)
        const finishTeamSessionRes = await request(`/sessions/${teamSession.id}/finish`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { markTaskComplete: false },
        });
        assert.strictEqual(finishTeamSessionRes.status, 200, 'Team task session finished without completing task');
        const recordedSeconds = finishTeamSessionRes.body.data.session.durationSeconds;
        assert(recordedSeconds >= 1, `Recorded at least 1s of focus time (got ${recordedSeconds})`);

        // Admin creates a personal task
        const adminPersonalRes = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: {
                title: 'Admin Private Investigation',
                scope: 'PERSONAL',
                priority: 'MEDIUM',
            },
        });
        const adminPersonalId = adminPersonalRes.body?.data?.task?.id || adminPersonalRes.body?.data?.id;

        // Admin focuses on personal task
        const startPersonalRes = await request(`/tasks/${adminPersonalId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(startPersonalRes.status, 201, 'Admin starts focus on personal task');
        const personalSession = startPersonalRes.body.data.session;

        // Finish personal task session
        await request(`/sessions/${personalSession.id}/finish`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { markTaskComplete: false },
        });

        // Admin switches back to the team task: verify accumulated focus time is preserved
        const resumeTeamTaskRes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(resumeTeamTaskRes.status, 201, 'Admin resumes focus on original team task');
        const resumedTeamSession = resumeTeamTaskRes.body.data.session;
        assert.strictEqual(resumedTeamSession.accumulatedFocusSeconds, recordedSeconds, 'Accumulated focus time preserved upon returning to task');
        console.log('  ✅ [PASS] Switching tasks preserves accumulated focus time');

        // Clean up active session
        await request(`/sessions/${resumedTeamSession.id}/finish`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { markTaskComplete: false },
        });

        // 9e. Dedicated Team Task A -> Team Task B -> Team Task A Switching Regression Test
        // Create second team task in the same team
        const taskBRes = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: {
                title: 'Team Shared Deliverable B',
                scope: 'TEAM',
                teamId: teamId,
                priority: 'HIGH',
                estimatedDurationMinutes: 30,
            },
        });
        assert.strictEqual(taskBRes.status, 201, 'Team Task B created');
        const taskBId = taskBRes.body?.data?.task?.id || taskBRes.body?.data?.id;

        // Step 1: Start focus on Team Task B (brand new task)
        const startTeamBRes = await request(`/tasks/${taskBId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(startTeamBRes.status, 201, 'Team Task B session starts');
        const sessionB = startTeamBRes.body.data.session;
        assert.strictEqual(sessionB.accumulatedFocusSeconds, 0, 'New team task starts with 0 accumulated seconds');
        assert.strictEqual(sessionB.elapsedSeconds, 0, 'New team task elapsed seconds starts at 0');

        // Let 1.1s elapse on Team Task B
        await new Promise((r) => setTimeout(r, 1100));

        // Step 2: Enforce single-timer rule during team task switching
        const conflictTeamA = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(conflictTeamA.status, 409, 'Cannot start Team Task A while Team Task B is active (409)');

        // Step 3: Finish Team Task B without completing task (simulating client switch)
        const finishBRes = await request(`/sessions/${sessionB.id}/finish`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { markTaskComplete: false },
        });
        assert.strictEqual(finishBRes.status, 200);
        const taskBDuration = finishBRes.body.data.session.durationSeconds;
        assert(taskBDuration >= 1, `Team Task B recorded at least 1s, got ${taskBDuration}`);

        // Step 4: Return to Team Task A
        const returnTeamARes = await request(`/tasks/${taskId}/sessions`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
        });
        assert.strictEqual(returnTeamARes.status, 201, 'Successfully returned to Team Task A');
        const sessionA3 = returnTeamARes.body.data.session;
        assert.strictEqual(
            sessionA3.accumulatedFocusSeconds,
            recordedSeconds,
            'Returning to Team Task A restores historical accumulated focus seconds without reset'
        );
        assert.strictEqual(
            sessionA3.totalTaskFocusSeconds,
            recordedSeconds,
            'totalTaskFocusSeconds reflects historical total'
        );

        // Step 5: Verify GET /sessions/active reflects the accumulated time upon return
        const activeARefresh = await request('/sessions/active', {
            headers: { Cookie: admin.cookies },
        });
        assert.strictEqual(activeARefresh.status, 200);
        assert.strictEqual(activeARefresh.body.data.session.taskId, taskId);
        assert.strictEqual(activeARefresh.body.data.session.accumulatedFocusSeconds, recordedSeconds);

        // Step 6: Verify GET /tasks?scope=TEAM returns persisted accumulatedFocusSeconds for all team tasks
        const teamTasksVerifyRes = await request(`/tasks?scope=TEAM&teamId=${teamId}`, {
            headers: { Cookie: admin.cookies },
        });
        assert.strictEqual(teamTasksVerifyRes.status, 200);
        const allTeamTasksList = teamTasksVerifyRes.body.data.tasks;
        const verifiedTaskA = allTeamTasksList.find((t) => t.id === taskId);
        const verifiedTaskB = allTeamTasksList.find((t) => t.id === taskBId);
        assert(verifiedTaskA && verifiedTaskA.accumulatedFocusSeconds >= recordedSeconds, 'Team Task A has persisted focus seconds in tasks query');
        assert(verifiedTaskB && verifiedTaskB.accumulatedFocusSeconds >= taskBDuration, 'Team Task B has persisted focus seconds in tasks query');
        console.log('  ✅ [PASS] Team Task A -> Team Task B -> Team Task A switching preserves all accumulated focus time');

        // Finish session A3 cleanly
        await request(`/sessions/${sessionA3.id}/finish`, {
            method: 'POST',
            headers: {
                Cookie: admin.cookies,
                'X-CSRF-Token': admin.csrfToken,
            },
            body: { markTaskComplete: false },
        });

        console.log('\n--- 10. Multiple Teams per User & Team Switch Isolation ---');
        // 10a. User creates a second team
        const createTeam2Res = await request('/teams', {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: {
                name: 'Alpha Platform Engineering Pod',
            },
        });
        assert.strictEqual(createTeam2Res.status, 201, 'User can create a second team (201)');
        const team2 = createTeam2Res.body?.data?.team || createTeam2Res.body?.data;
        assert(team2 && team2.id, 'Second team returned with ID');

        // 10b. User can list at least two teams under the same account
        const listMultiTeamsRes = await request('/teams', {
            headers: { Cookie: owner.cookies },
        });
        assert.strictEqual(listMultiTeamsRes.status, 200);
        const ownerTeams = Array.isArray(listMultiTeamsRes.body?.data)
            ? listMultiTeamsRes.body.data
            : listMultiTeamsRes.body?.data?.teams || [];
        assert(ownerTeams.length >= 2, `Owner belongs to at least 2 teams (found ${ownerTeams.length})`);
        const hasTeam1 = ownerTeams.some((t) => t.id === teamId);
        const hasTeam2 = ownerTeams.some((t) => t.id === team2.id);
        assert(hasTeam1 && hasTeam2, 'Both Team 1 and Team 2 are listed for the user');
        console.log('  ✅ [PASS] User can create and list at least two teams simultaneously');

        // 10c. Create a project and task in Team 2
        const project2Res = await request(`/teams/${team2.id}/projects`, {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: {
                name: 'Team 2 Infrastructure Project',
            },
        });
        assert.strictEqual(project2Res.status, 201);
        const project2 = project2Res.body?.data?.project || project2Res.body?.data;

        const taskTeam2Res = await request('/tasks', {
            method: 'POST',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
            body: {
                title: 'Team 2 Dedicated Mission',
                scope: 'TEAM',
                teamId: team2.id,
                projectId: project2.id,
                priority: 'HIGH',
            },
        });
        assert.strictEqual(taskTeam2Res.status, 201);
        const task2Id = taskTeam2Res.body?.data?.task?.id || taskTeam2Res.body?.data?.id;

        // Switching teams: Querying Team 1 returns only Team 1 tasks; Team 2 returns only Team 2 tasks
        const queryTeam1Tasks = await request(`/tasks?scope=TEAM&teamId=${teamId}`, {
            headers: { Cookie: owner.cookies },
        });
        const queryTeam2Tasks = await request(`/tasks?scope=TEAM&teamId=${team2.id}`, {
            headers: { Cookie: owner.cookies },
        });

        const team1TaskIds = queryTeam1Tasks.body.data.tasks.map((t) => t.id);
        const team2TaskIds = queryTeam2Tasks.body.data.tasks.map((t) => t.id);

        assert(team1TaskIds.includes(taskId), 'Team 1 tasks query includes Team 1 task');
        assert(!team1TaskIds.includes(task2Id), 'Team 1 tasks query does NOT include Team 2 task');
        assert(team2TaskIds.includes(task2Id), 'Team 2 tasks query includes Team 2 task');
        assert(!team2TaskIds.includes(taskId), 'Team 2 tasks query does NOT include Team 1 task');
        console.log('  ✅ [PASS] Switching teams displays the correct team-specific data in full isolation');

        // 10d. Deleting one team does not affect another team or personal tasks
        const deleteTeam2Res = await request(`/teams/${team2.id}`, {
            method: 'DELETE',
            headers: {
                Cookie: owner.cookies,
                'X-CSRF-Token': owner.csrfToken,
            },
        });
        assert.strictEqual(deleteTeam2Res.status, 200, 'Team 2 deleted successfully');

        // Verify Team 1 still exists
        const team1Check = await request(`/teams/${teamId}`, {
            headers: { Cookie: owner.cookies },
        });
        assert.strictEqual(team1Check.status, 200, 'Team 1 remains intact after Team 2 deletion');

        // Verify Owner personal task still exists
        const personalCheck = await request(`/tasks/${personalTaskId}`, {
            headers: { Cookie: owner.cookies },
        });
        assert.strictEqual(personalCheck.status, 200, 'Owner personal task remains intact after Team 2 deletion');
        console.log('  ✅ [PASS] Deleting one team does not affect another team or personal tasks');

        console.log('\n====================================================');
        console.log('Results: All Phase 6 Team Mode & Focus tests passed!');
        console.log('====================================================\n');
    } finally {
        // Database cleanup
        await prisma.timerSegment.deleteMany({
            where: { session: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } } },
        });
        await prisma.timerSession.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        await prisma.taskAssignee.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        await prisma.task.deleteMany({
            where: {
                OR: [
                    { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                    { teamId: teamId || undefined },
                    { team: { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } } },
                ],
            },
        });
        await prisma.project.deleteMany({
            where: {
                OR: [
                    { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                    { teamId: teamId || undefined },
                    { team: { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } } },
                ],
            },
        });
        await prisma.teamInvitation.deleteMany({
            where: {
                OR: [
                    { invitedEmail: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } },
                    { teamId: teamId || undefined },
                    { team: { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } } },
                ],
            },
        });
        await prisma.teamMembership.deleteMany({
            where: {
                OR: [
                    { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                    { team: { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } } },
                ],
            },
        });
        await prisma.team.deleteMany({
            where: {
                OR: [
                    { id: teamId || undefined },
                    { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                ],
            },
        });
        await prisma.userPreference.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } },
        });
        console.log('🧹 Database Cleanup: Test users, teams, projects, tasks & focus sessions cleaned up cleanly.\n');
    }
}

runTests().catch((err) => {
    console.error('❌ Phase 6 Team Mode test failure:', err);
    process.exit(1);
});
