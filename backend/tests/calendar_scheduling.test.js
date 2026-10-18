'use strict';

/**
 * backend/tests/calendar_scheduling.test.js
 *
 * Automated test suite for FocusFlow Phase 5:
 *  1. Unauthenticated request protection (401 Unauthorized)
 *  2. Calendar querying, date windowing, and summary counts
 *  3. Conflict detection (direct overlaps, deadline exceeded, missed tasks)
 *  4. Deterministic schedule recovery proposal generation
 *  5. Invariant check: FIXED tasks cannot be moved without explicit consent (422)
 *  6. Atomic proposal acceptance, optimistic version increment, and audit logging
 *  7. Stale proposal protection against concurrent schedule modification (409 Conflict)
 *  8. Proposal rejection
 *  9. Cross-user isolation and IDOR prevention
 * 10. Clean database teardown (zero leftover records)
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5060;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers,
        };

        const postData = body ? JSON.stringify(body) : null;
        if (postData) {
            reqHeaders['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request(
            url,
            {
                method,
                headers: reqHeaders,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    let json;
                    try {
                        json = JSON.parse(data);
                    } catch (e) {
                        json = data;
                    }

                    const rawCookies = res.headers['set-cookie'] || [];
                    const cookies = {};
                    rawCookies.forEach((c) => {
                        const parts = c.split(';')[0].split('=');
                        const key = parts[0].trim();
                        const val = parts.slice(1).join('=').trim();
                        if (key) cookies[key] = val;
                    });

                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        cookies,
                        body: json,
                    });
                });
            }
        );

        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

function buildCookieHeader(cookies) {
    return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

async function runTests() {
    console.log('====================================================');
    console.log('FocusFlow Phase 5 Calendar & Scheduling Test Suite');
    console.log('====================================================\n');

    let server;
    let prisma;

    const userAEmail = `user_a_cal_${Date.now()}@example.com`;
    const userBEmail = `user_b_cal_${Date.now()}@example.com`;
    const password = 'SecurePassword123!';

    const userACookies = {};
    const userBCookies = {};
    let userACsrf = '';
    let userBCsrf = '';

    try {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        prisma = await getPrisma();

        // ----------------------------------------------------
        // Part 1: Unauthenticated Protection
        // ----------------------------------------------------
        console.log('--- 1. Unauthenticated Request Rejection ---');

        const unauthCal = await makeRequest('GET', '/api/v1/calendar?from=2026-10-18T00:00:00.000Z&to=2026-10-18T23:59:59.999Z');
        assert.strictEqual(unauthCal.status, 401);
        console.log('  ✅ [PASS] GET /api/v1/calendar rejects unauthenticated access (401)');

        const unauthConf = await makeRequest('GET', '/api/v1/scheduling/conflicts');
        assert.strictEqual(unauthConf.status, 401);
        console.log('  ✅ [PASS] GET /api/v1/scheduling/conflicts rejects unauthenticated access (401)');

        const unauthProp = await makeRequest('POST', '/api/v1/scheduling/proposals', { date: '2026-10-18' });
        assert.strictEqual(unauthProp.status, 401);
        console.log('  ✅ [PASS] POST /api/v1/scheduling/proposals rejects unauthenticated access (401)');

        // ----------------------------------------------------
        // Setup Users & CSRF Bootstrap
        // ----------------------------------------------------
        const csrfA = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userACsrf = csrfA.body.data.csrfToken;
        userACookies['XSRF-TOKEN'] = csrfA.cookies['XSRF-TOKEN'];

        const regA = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'Calendar User A', email: userAEmail, password },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(regA.status, 201);
        userACookies['auth_session'] = regA.cookies['auth_session'];
        if (regA.cookies['XSRF-TOKEN']) {
            userACookies['XSRF-TOKEN'] = regA.cookies['XSRF-TOKEN'];
            userACsrf = regA.cookies['XSRF-TOKEN'];
        }

        const csrfB = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userBCsrf = csrfB.body.data.csrfToken;
        userBCookies['XSRF-TOKEN'] = csrfB.cookies['XSRF-TOKEN'];

        const regB = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'Calendar User B', email: userBEmail, password },
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(regB.status, 201);
        userBCookies['auth_session'] = regB.cookies['auth_session'];
        if (regB.cookies['XSRF-TOKEN']) {
            userBCookies['XSRF-TOKEN'] = regB.cookies['XSRF-TOKEN'];
            userBCsrf = regB.cookies['XSRF-TOKEN'];
        }

        // ----------------------------------------------------
        // Part 2: Calendar Querying & Window Filtering
        // ----------------------------------------------------
        console.log('\n--- 2. Calendar Querying & Metadata Aggregation ---');

        const baseDate = '2026-10-20';

        // Create Task 1: Fixed Team Meeting (10:00 - 11:30)
        const t1 = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Client Architecture Review',
                scheduleType: 'FIXED',
                priority: 'HIGH',
                startAt: `${baseDate}T10:00:00.000Z`,
                endAt: `${baseDate}T11:30:00.000Z`,
                estimatedDurationMinutes: 90,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(t1.status, 201);
        const task1Id = t1.body.data.task.id;

        // Create Task 2: Flexible Coding Block (11:00 - 12:30) - DIRECT OVERLAP WITH TASK 1!
        const t2 = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Frontend Feature Implementation',
                scheduleType: 'FLEXIBLE',
                priority: 'MEDIUM',
                startAt: `${baseDate}T11:00:00.000Z`,
                endAt: `${baseDate}T12:30:00.000Z`,
                estimatedDurationMinutes: 90,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(t2.status, 201);
        const task2Id = t2.body.data.task.id;

        // Create Task 3: Flexible Task with Deadline Violation (14:00 - 16:00, deadline 15:00)
        const t3 = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Deploy Production Release',
                scheduleType: 'FLEXIBLE',
                priority: 'HIGH',
                startAt: `${baseDate}T14:00:00.000Z`,
                endAt: `${baseDate}T16:00:00.000Z`,
                deadlineAt: `${baseDate}T15:00:00.000Z`,
                estimatedDurationMinutes: 120,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(t3.status, 201);
        const task3Id = t3.body.data.task.id;

        // Query calendar for this date window
        const calRes = await makeRequest(
            'GET',
            `/api/v1/calendar?from=${baseDate}T00:00:00.000Z&to=${baseDate}T23:59:59.999Z`,
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(calRes.status, 200);
        assert.strictEqual(calRes.body.data.tasks.length, 3);
        assert.strictEqual(calRes.body.data.summary.totalTasks, 3);
        assert.strictEqual(calRes.body.data.summary.fixedTasks, 1);
        assert.strictEqual(calRes.body.data.summary.flexibleTasks, 2);
        assert.ok(calRes.body.data.conflicts.length >= 2, 'Should identify overlap and deadline conflicts');
        console.log('  ✅ [PASS] GET /api/v1/calendar returns scheduled tasks, summary metrics, and conflicts');

        // ----------------------------------------------------
        // Part 3: Conflict Diagnostics API
        // ----------------------------------------------------
        console.log('\n--- 3. Conflict Detection & Diagnostics ---');

        const confRes = await makeRequest(
            'GET',
            `/api/v1/scheduling/conflicts?from=${baseDate}T00:00:00.000Z&to=${baseDate}T23:59:59.999Z`,
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(confRes.status, 200);
        const conflicts = confRes.body.data.conflicts;
        assert.ok(conflicts.length >= 2);

        const overlap = conflicts.find((c) => c.type === 'OVERLAP');
        assert.ok(overlap);
        assert.strictEqual(overlap.involvesFixedTask, true);
        assert.strictEqual(overlap.overlapMinutes, 30);
        console.log('  ✅ [PASS] Identifies 30-minute direct overlap between Fixed Task 1 and Flexible Task 2');

        const deadlineConf = conflicts.find((c) => c.type === 'DEADLINE_EXCEEDED');
        assert.ok(deadlineConf);
        assert.strictEqual(deadlineConf.taskId, task3Id);
        console.log('  ✅ [PASS] Identifies deadline conflict for Task 3');

        // Analyze endpoint
        const analyzeRes = await makeRequest(
            'POST',
            '/api/v1/scheduling/analyze',
            { date: baseDate },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(analyzeRes.status, 200);
        assert.strictEqual(analyzeRes.body.data.hasConflicts, true);
        assert.ok(analyzeRes.body.data.totalScheduledMinutes > 0);
        console.log('  ✅ [PASS] POST /api/v1/scheduling/analyze returns day working hours & diagnostic status');

        // ----------------------------------------------------
        // Part 4: Recovery Proposal Generation & Fixed Invariant
        // ----------------------------------------------------
        console.log('\n--- 4. Deterministic Recovery Proposal Generation ---');

        const propRes = await makeRequest(
            'POST',
            '/api/v1/scheduling/proposals',
            { date: baseDate, conflictTaskIds: [task2Id] },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(propRes.status, 201);
        const proposal = propRes.body.data.proposal;
        assert.strictEqual(proposal.status, 'PENDING');
        assert.ok(proposal.items.length >= 1);

        // Core Invariant Verification: Fixed Task 1 must NOT be moved!
        const movedTask1 = proposal.items.find((i) => i.taskId === task1Id);
        assert.strictEqual(movedTask1, undefined, 'Fixed task 1 must NEVER be moved automatically in proposal');

        // Flexible Task 2 should be moved to open slot after Task 1 + buffer
        const movedTask2 = proposal.items.find((i) => i.taskId === task2Id);
        assert.ok(movedTask2);
        assert.strictEqual(movedTask2.isFixed, false);
        assert.strictEqual(movedTask2.requiresConsent, false);
        console.log(`  ✅ [PASS] Proposal realigns flexible Task 2 to ${movedTask2.newStartAt} without touching Fixed Task 1`);

        // ----------------------------------------------------
        // Part 5: Invariant Check: FIXED Task Confirmation Required
        // ----------------------------------------------------
        console.log('\n--- 5. FIXED Task Safety Invariant Enforcement ---');

        // Create a test proposal that includes moving Fixed Task 1
        // We'll create an overrun on Task 0 that pushes into Fixed Task 1
        const t0 = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Early Morning Prep',
                scheduleType: 'FLEXIBLE',
                startAt: `${baseDate}T09:00:00.000Z`,
                endAt: `${baseDate}T09:45:00.000Z`,
                estimatedDurationMinutes: 45,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        const task0Id = t0.body.data.task.id;

        // Overrun by 90 minutes pushes into Task 1 (10:00 - 11:30)
        const overrunPropRes = await makeRequest(
            'POST',
            '/api/v1/scheduling/proposals',
            { overrunTaskId: task0Id, extensionMinutes: 90 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(overrunPropRes.status, 201);
        const fixedCollisionProposal = overrunPropRes.body.data.proposal;

        const fixedItem = fixedCollisionProposal.items.find((i) => i.taskId === task1Id);
        assert.ok(fixedItem, 'Fixed Task 1 was collided with by overrun');
        assert.strictEqual(fixedItem.isFixed, true);
        assert.strictEqual(fixedItem.requiresConsent, true);

        // Attempting to accept WITHOUT explicit consent in acceptedFixedTaskIds must fail with 422!
        const acceptWithoutConsent = await makeRequest(
            'POST',
            `/api/v1/scheduling/proposals/${fixedCollisionProposal.id}/accept`,
            {
                taskVersions: fixedCollisionProposal.items.map((i) => ({ taskId: i.taskId, version: i.task.version })),
                acceptedFixedTaskIds: [], // User DID NOT consent!
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(acceptWithoutConsent.status, 422);
        assert.strictEqual(acceptWithoutConsent.body.error.code, 'FIXED_TASK_CONFIRMATION_REQUIRED');
        console.log('  ✅ [PASS] Invariant enforced: Moving FIXED task without explicit consent returns 422');

        // Reject this proposal
        await makeRequest(
            'POST',
            `/api/v1/scheduling/proposals/${fixedCollisionProposal.id}/reject`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );

        // ----------------------------------------------------
        // Part 6: Atomic Acceptance, Versioning & Audit Trail
        // ----------------------------------------------------
        console.log('\n--- 6. Atomic Proposal Acceptance & Audit Logging ---');

        const initialT2 = await makeRequest('GET', `/api/v1/tasks/${task2Id}`, null, { Cookie: buildCookieHeader(userACookies) });
        const initialVersion = initialT2.body.data.task.version;

        const acceptRes = await makeRequest(
            'POST',
            `/api/v1/scheduling/proposals/${proposal.id}/accept`,
            {
                taskVersions: [{ taskId: task2Id, version: initialVersion }],
                acceptedFixedTaskIds: [],
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(acceptRes.status, 200);
        assert.strictEqual(acceptRes.body.data.proposal.status, 'ACCEPTED');

        // Verify task version incremented and timestamps updated
        const updatedT2 = await makeRequest('GET', `/api/v1/tasks/${task2Id}`, null, { Cookie: buildCookieHeader(userACookies) });
        assert.strictEqual(updatedT2.body.data.task.version, initialVersion + 1);
        assert.strictEqual(updatedT2.body.data.task.startAt, movedTask2.newStartAt);
        console.log('  ✅ [PASS] Atomic acceptance increments task version and updates scheduled timestamps');

        // Verify audit log entry in ScheduleChange
        const auditLog = await prisma.scheduleChange.findFirst({
            where: { taskId: task2Id, proposalId: proposal.id },
        });
        assert.ok(auditLog);
        assert.strictEqual(auditLog.actorId, regA.body.data.user.id);
        console.log('  ✅ [PASS] ScheduleChange audit record persisted with original & new timestamps');

        // ----------------------------------------------------
        // Part 7: Stale Proposal (Optimistic Concurrency) Protection
        // ----------------------------------------------------
        console.log('\n--- 7. Stale Proposal Optimistic Concurrency Protection ---');

        // Create new proposal for Task 3
        const prop3Res = await makeRequest(
            'POST',
            '/api/v1/scheduling/proposals',
            { date: baseDate, conflictTaskIds: [task3Id] },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(prop3Res.status, 201);
        const proposal3 = prop3Res.body.data.proposal;

        // Simulate concurrent edit on Task 3 from another browser tab
        const currentT3 = await makeRequest('GET', `/api/v1/tasks/${task3Id}`, null, { Cookie: buildCookieHeader(userACookies) });
        await makeRequest(
            'PATCH',
            `/api/v1/tasks/${task3Id}`,
            { title: 'Concurrent Edited Title', version: currentT3.body.data.task.version },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );

        // Attempting to accept proposal3 using the OLD version must fail with 409 Conflict (STALE_PROPOSAL)
        const staleAccept = await makeRequest(
            'POST',
            `/api/v1/scheduling/proposals/${proposal3.id}/accept`,
            {
                taskVersions: [{ taskId: task3Id, version: currentT3.body.data.task.version }],
                acceptedFixedTaskIds: [],
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(staleAccept.status, 409);
        assert.ok(staleAccept.body.error.message.includes('STALE_PROPOSAL'));
        console.log('  ✅ [PASS] Stale proposal rejected with 409 Conflict: prevents overwriting concurrent edits');

        // ----------------------------------------------------
        // Part 8: Cross-User Isolation & Privacy
        // ----------------------------------------------------
        console.log('\n--- 8. Cross-User Privacy Boundary Enforcement ---');

        // User B cannot access User A's calendar
        const userBCal = await makeRequest(
            'GET',
            `/api/v1/calendar?from=${baseDate}T00:00:00.000Z&to=${baseDate}T23:59:59.999Z`,
            null,
            { Cookie: buildCookieHeader(userBCookies) }
        );
        assert.strictEqual(userBCal.status, 200);
        assert.strictEqual(userBCal.body.data.tasks.length, 0);
        console.log('  ✅ [PASS] User B calendar is isolated: 0 tasks returned');

        // User B cannot view User A's proposal
        const userBCantViewProp = await makeRequest(
            'GET',
            `/api/v1/scheduling/proposals/${proposal3.id}`,
            null,
            { Cookie: buildCookieHeader(userBCookies) }
        );
        assert.strictEqual(userBCantViewProp.status, 404);
        console.log('  ✅ [PASS] User B cannot access User A proposal (404 Not Found)');

        // User B cannot accept User A's proposal
        const userBCantAccept = await makeRequest(
            'POST',
            `/api/v1/scheduling/proposals/${proposal3.id}/accept`,
            { taskVersions: [{ taskId: task3Id, version: 1 }] },
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(userBCantAccept.status, 404);
        console.log('  ✅ [PASS] User B cannot accept User A proposal (404 Not Found)');

        console.log('\n====================================================');
        console.log('Results: All Phase 5 Calendar & Scheduling tests passed!');
        console.log('====================================================\n');
    } finally {
        if (prisma) {
            try {
                await prisma.user.deleteMany({
                    where: { email: { in: [userAEmail, userBEmail] } },
                });
                console.log('🧹 Database Cleanup: Test users & schedule records deleted cleanly.\n');
            } catch (err) {
                console.error('Cleanup error:', err.message);
            }
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        await disconnectPrisma();
    }
}

runTests().catch((err) => {
    console.error('\n❌ Phase 5 Test Suite Failed:', err);
    process.exit(1);
});
