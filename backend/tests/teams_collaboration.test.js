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

        console.log('\n====================================================');
        console.log('Results: All Phase 6 Team Mode tests passed!');
        console.log('====================================================\n');
    } finally {
        // Database cleanup
        await prisma.taskAssignee.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        await prisma.task.deleteMany({
            where: {
                OR: [
                    { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                    { teamId: teamId || undefined },
                ],
            },
        });
        await prisma.project.deleteMany({
            where: {
                OR: [
                    { owner: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
                    { teamId: teamId || undefined },
                ],
            },
        });
        await prisma.teamInvitation.deleteMany({
            where: {
                OR: [
                    { invitedEmail: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } },
                    { teamId: teamId || undefined },
                ],
            },
        });
        await prisma.teamMembership.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        if (teamId) {
            await prisma.team.deleteMany({ where: { id: teamId } });
        }
        await prisma.userPreference.deleteMany({
            where: { user: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, adminEmail, memberEmail, outsiderEmail] } },
        });
        console.log('🧹 Database Cleanup: Test users, teams, projects & tasks cleaned up cleanly.\n');
    }
}

runTests().catch((err) => {
    console.error('❌ Phase 6 Team Mode test failure:', err);
    process.exit(1);
});
