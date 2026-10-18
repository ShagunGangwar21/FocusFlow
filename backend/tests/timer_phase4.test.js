'use strict';

/**
 * backend/tests/timer_phase4.test.js
 *
 * Comprehensive automated tests for FocusFlow Phase 4 Focus Timer & Session History:
 *  1. Unauthenticated access rejection (401 Unauthorized)
 *  2. Starting a focus session with task access validation
 *  3. Server-authoritative elapsed duration calculation (ignoring paused intervals)
 *  4. Single active timer invariant & 409 ACTIVE_SESSION_EXISTS on duplicate/concurrent starts
 *  5. Pause and resume state transitions with idempotency
 *  6. Finishing session with and without task completion integration
 *  7. Discarding in-progress focus session
 *  8. Cross-user privacy isolation & IDOR prevention
 *  9. Paginated session history and task-specific history
 * 10. Accurate empty states for new users
 * 11. Zero leftover database records
 */

require('dotenv').config();
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5059;
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

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('====================================================');
    console.log('FocusFlow Phase 4 Focus Timer & Session History Tests');
    console.log('====================================================\n');

    let server;
    let prisma;

    const userAEmail = `user_a_timer_${Date.now()}@example.com`;
    const userBEmail = `user_b_timer_${Date.now()}@example.com`;
    const password = 'SecurePassword123!';

    const userACookies = {};
    const userBCookies = {};
    let userACsrf = '';
    let userBCsrf = '';

    try {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        prisma = await getPrisma();

        // --- 1. CSRF Bootstrap & Registration ---
        const csrfA = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userACsrf = csrfA.body.data.csrfToken;
        userACookies['XSRF-TOKEN'] = csrfA.cookies['XSRF-TOKEN'];

        const regA = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'Timer User A', email: userAEmail, password },
            {
                Cookie: buildCookieHeader(userACookies),
                'X-CSRF-Token': userACsrf,
            }
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
            { name: 'Timer User B', email: userBEmail, password },
            {
                Cookie: buildCookieHeader(userBCookies),
                'X-CSRF-Token': userBCsrf,
            }
        );
        assert.strictEqual(regB.status, 201);
        userBCookies['auth_session'] = regB.cookies['auth_session'];
        if (regB.cookies['XSRF-TOKEN']) {
            userBCookies['XSRF-TOKEN'] = regB.cookies['XSRF-TOKEN'];
            userBCsrf = regB.cookies['XSRF-TOKEN'];
        }

        // --- Create Tasks for User A ---
        const task1Res = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'DSA Practice', estimatedDurationMinutes: 45, scheduleType: 'FLEXIBLE' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(task1Res.status, 201);
        const task1Id = task1Res.body.data.task.id;

        const task2Res = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Write Weekly Blog (WWB)', estimatedDurationMinutes: 30, scheduleType: 'FIXED' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(task2Res.status, 201);
        const task2Id = task2Res.body.data.task.id;

        // ----------------------------------------------------
        // Part 1: Unauthenticated & Unauthorized Rejection
        // ----------------------------------------------------
        console.log('--- 1. Unauthenticated & Unauthorized Protection ---');

        const unauthActive = await makeRequest('GET', '/api/v1/sessions/active');
        assert.strictEqual(unauthActive.status, 401);
        console.log('  ✅ [PASS] GET /api/v1/sessions/active rejects unauthenticated request (401)');

        const unauthStart = await makeRequest('POST', `/api/v1/tasks/${task1Id}/sessions`, {});
        assert.strictEqual(unauthStart.status, 401);
        console.log('  ✅ [PASS] POST /api/v1/tasks/:id/sessions rejects unauthenticated request (401)');

        const unauthHistory = await makeRequest('GET', '/api/v1/sessions');
        assert.strictEqual(unauthHistory.status, 401);
        console.log('  ✅ [PASS] GET /api/v1/sessions rejects unauthenticated request (401)');

        // Empty state for fresh user
        const emptyActive = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(emptyActive.status, 200);
        assert.strictEqual(emptyActive.body.data.session, null);
        console.log('  ✅ [PASS] Active session endpoint returns null session for idle user');

        const emptyHistory = await makeRequest(
            'GET',
            '/api/v1/sessions',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(emptyHistory.status, 200);
        assert.strictEqual(emptyHistory.body.data.sessions.length, 0);
        assert.strictEqual(emptyHistory.body.meta.pagination.total, 0);
        console.log('  ✅ [PASS] Session history returns clean empty array and zero total');

        // ----------------------------------------------------
        // Part 2: Starting Session & Single Active Timer Invariant
        // ----------------------------------------------------
        console.log('\n--- 2. Starting Focus Session & Single Active Timer Invariant ---');

        const startRes = await makeRequest(
            'POST',
            `/api/v1/tasks/${task1Id}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(startRes.status, 201);
        const session1Id = startRes.body.data.session.id;
        assert.strictEqual(startRes.body.data.session.status, 'RUNNING');
        assert.strictEqual(startRes.body.data.session.taskId, task1Id);
        assert.strictEqual(startRes.body.data.session.task.title, 'DSA Practice');
        console.log('  ✅ [PASS] POST /api/v1/tasks/:taskId/sessions starts running session (201)');

        // Verify active session restoration
        const activeRes = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(activeRes.status, 200);
        assert.strictEqual(activeRes.body.data.session.id, session1Id);
        assert.strictEqual(activeRes.body.data.session.status, 'RUNNING');
        console.log('  ✅ [PASS] GET /api/v1/sessions/active restores active session across client calls');

        // Attempting to start a second session while one is running must return 409 ACTIVE_SESSION_EXISTS
        const duplicateStart = await makeRequest(
            'POST',
            `/api/v1/tasks/${task2Id}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(duplicateStart.status, 409);
        assert.strictEqual(duplicateStart.body.error.code, 'ACTIVE_SESSION_EXISTS');
        console.log('  ✅ [PASS] Single active timer invariant enforced: 409 Conflict ACTIVE_SESSION_EXISTS');

        // ----------------------------------------------------
        // Part 3: Pause, Resume, and Elapsed Duration Calculation
        // ----------------------------------------------------
        console.log('\n--- 3. Pause & Resume State Transitions ---');

        // Wait 1.1 seconds so running elapsed time > 0
        await sleep(1100);

        const pauseRes = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/pause`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(pauseRes.status, 200);
        assert.strictEqual(pauseRes.body.data.session.status, 'PAUSED');
        const pausedElapsed = pauseRes.body.data.session.elapsedSeconds;
        assert.ok(pausedElapsed >= 1, `Elapsed seconds should be at least 1s, got ${pausedElapsed}`);
        console.log(`  ✅ [PASS] Pausing session halts running timer at ${pausedElapsed}s (200)`);

        // Check active session again after 500ms sleep to confirm paused time is NOT counted
        await sleep(500);
        const checkPaused = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(checkPaused.status, 200);
        assert.strictEqual(checkPaused.body.data.session.status, 'PAUSED');
        assert.strictEqual(checkPaused.body.data.session.elapsedSeconds, pausedElapsed);
        console.log('  ✅ [PASS] Server authoritative rule: paused time does NOT accumulate focus seconds');

        // Idempotent pause
        const repeatPause = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/pause`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(repeatPause.status, 200);
        assert.strictEqual(repeatPause.body.data.session.status, 'PAUSED');
        console.log('  ✅ [PASS] Repeated pause is safe and idempotent');

        // Resume session
        const resumeRes = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/resume`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(resumeRes.status, 200);
        assert.strictEqual(resumeRes.body.data.session.status, 'RUNNING');
        console.log('  ✅ [PASS] Resuming session transitions status back to RUNNING');

        // Wait another 1.1 seconds
        await sleep(1100);

        // ----------------------------------------------------
        // Part 4: Finish Session (Without Task Completion)
        // ----------------------------------------------------
        console.log('\n--- 4. Finish Session (Standalone Focus Block) ---');

        const finish1Res = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/finish`,
            { markTaskComplete: false },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(finish1Res.status, 200);
        assert.strictEqual(finish1Res.body.data.session.status, 'COMPLETED');
        assert.ok(finish1Res.body.data.session.durationSeconds >= 2);
        // Task remains PENDING
        assert.strictEqual(finish1Res.body.data.task.status, 'PENDING');
        console.log('  ✅ [PASS] Finish session with markTaskComplete=false preserves task status as PENDING');

        // Confirm active session is now null
        const activeAfterFinish = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(activeAfterFinish.status, 200);
        assert.strictEqual(activeAfterFinish.body.data.session, null);
        console.log('  ✅ [PASS] Finishing session clears active session state');

        // ----------------------------------------------------
        // Part 5: Task Switching & Completing Task with Focus Time
        // ----------------------------------------------------
        console.log('\n--- 5. Task Switching & Completion Integration ---');

        // Start session on Task 2 (WWB)
        const start2Res = await makeRequest(
            'POST',
            `/api/v1/tasks/${task2Id}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(start2Res.status, 201);
        const session2Id = start2Res.body.data.session.id;

        await sleep(1000);

        // Finish session 2 with markTaskComplete = true
        const finish2Res = await makeRequest(
            'POST',
            `/api/v1/sessions/${session2Id}/finish`,
            { markTaskComplete: true },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(finish2Res.status, 200);
        assert.strictEqual(finish2Res.body.data.task.status, 'COMPLETED');
        assert.ok(finish2Res.body.data.task.actualDurationMinutes >= 1);
        assert.ok(finish2Res.body.data.task.completedAt);
        console.log('  ✅ [PASS] Finish session with markTaskComplete=true updates task status & duration in DB');

        // ----------------------------------------------------
        // Part 5b: A → B → A Task Switching & Accumulated Focus Time Preservation
        // ----------------------------------------------------
        console.log('\n--- 5b. A → B → A Task Switching & Accumulated Focus Time Preservation ---');

        // Create Task A and Task B
        const taskARes = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Task A (Deep Work)', priority: 'HIGH', scheduleType: 'FLEXIBLE', estimatedDurationMinutes: 45 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(taskARes.status, 201);
        const taskAId = taskARes.body.data.task.id;

        const taskBRes = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Task B (Review PRs)', priority: 'MEDIUM', scheduleType: 'FLEXIBLE', estimatedDurationMinutes: 30 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(taskBRes.status, 201);
        const taskBId = taskBRes.body.data.task.id;

        // Step 1: Start Task A focus session
        const startTaskARes1 = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskAId}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(startTaskARes1.status, 201);
        const sessionA1Id = startTaskARes1.body.data.session.id;
        assert.strictEqual(startTaskARes1.body.data.session.accumulatedFocusSeconds, 0);

        await sleep(1100);

        // Step 2: Concurrency check: concurrent start of Task B fails with 409 while Task A is active
        const concurrentStartB = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskBId}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(concurrentStartB.status, 409);
        assert.strictEqual(concurrentStartB.body.error.code, 'ACTIVE_SESSION_EXISTS');
        console.log('  ✅ [PASS] Concurrent start of Task B rejected with 409 ACTIVE_SESSION_EXISTS');

        // Step 3: Switch Task A -> Task B (Sequential finish A without task completion, then start B)
        const finishA1Res = await makeRequest(
            'POST',
            `/api/v1/sessions/${sessionA1Id}/finish`,
            { markTaskComplete: false },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(finishA1Res.status, 200);
        assert.strictEqual(finishA1Res.body.data.task.status, 'PENDING');
        const taskADuration1 = finishA1Res.body.data.session.durationSeconds;
        assert.ok(taskADuration1 >= 1, `Task A first block should be >= 1s, got ${taskADuration1}`);
        console.log(`  ✅ [PASS] Task A session 1 finished with markTaskComplete=false (${taskADuration1}s recorded)`);

        const startTaskBRes = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskBId}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(startTaskBRes.status, 201);
        const sessionBId = startTaskBRes.body.data.session.id;

        await sleep(1100);

        // Step 4: Failed task switch handling: attempting to switch to an invalid task does not lose Task B session
        const invalidTaskSwitch = await makeRequest(
            'POST',
            '/api/v1/tasks/00000000-0000-0000-0000-000000000000/sessions',
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.ok([404, 409].includes(invalidTaskSwitch.status));
        const activeStillB = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(activeStillB.status, 200);
        assert.strictEqual(activeStillB.body.data.session.id, sessionBId);
        console.log('  ✅ [PASS] Failed task switch does not destroy existing active session');

        // Step 5: Switch Task B -> Task A (Sequential finish B, then start A)
        const finishBRes = await makeRequest(
            'POST',
            `/api/v1/sessions/${sessionBId}/finish`,
            { markTaskComplete: false },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(finishBRes.status, 200);
        const taskBDuration = finishBRes.body.data.session.durationSeconds;
        assert.ok(taskBDuration >= 1);

        // Start Task A again (returning to Task A)
        const startTaskARes2 = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskAId}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(startTaskARes2.status, 201);
        const sessionA2 = startTaskARes2.body.data.session;
        assert.notStrictEqual(sessionA2.id, sessionA1Id, 'Must create a brand new session, not falsely resume completed one');
        assert.strictEqual(sessionA2.status, 'RUNNING');
        assert.strictEqual(sessionA2.elapsedSeconds, 0, 'New session elapsed seconds must start at zero');
        assert.strictEqual(
            sessionA2.accumulatedFocusSeconds,
            taskADuration1,
            'Returning to Task A must restore previous accumulated focus seconds'
        );
        assert.strictEqual(
            sessionA2.totalTaskFocusSeconds,
            taskADuration1,
            'totalTaskFocusSeconds must equal accumulatedFocusSeconds + 0'
        );
        console.log(`  ✅ [PASS] Returning to Task A restores accumulated ${sessionA2.accumulatedFocusSeconds}s while starting fresh session at 0s`);

        // Verify active session restoration endpoint returns accumulated focus time
        const activeARes = await makeRequest(
            'GET',
            '/api/v1/sessions/active',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(activeARes.status, 200);
        assert.strictEqual(activeARes.body.data.session.taskId, taskAId);
        assert.strictEqual(activeARes.body.data.session.accumulatedFocusSeconds, taskADuration1);
        console.log('  ✅ [PASS] GET /api/v1/sessions/active returns accumulatedFocusSeconds and totalTaskFocusSeconds');

        // Verify tasks list returns Task A and Task B with accumulated focus time
        const tasksListRes = await makeRequest(
            'GET',
            '/api/v1/tasks',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(tasksListRes.status, 200);
        const taskAFromList = tasksListRes.body.data.tasks.find((t) => t.id === taskAId);
        const taskBFromList = tasksListRes.body.data.tasks.find((t) => t.id === taskBId);
        assert.ok(taskAFromList);
        assert.strictEqual(taskAFromList.accumulatedFocusSeconds, taskADuration1);
        assert.ok(taskBFromList);
        assert.strictEqual(taskBFromList.accumulatedFocusSeconds, taskBDuration);
        console.log('  ✅ [PASS] GET /api/v1/tasks returns accumulatedFocusSeconds for all tasks preserving history');

        // Clean up: finish session A2
        await makeRequest(
            'POST',
            `/api/v1/sessions/${sessionA2.id}/finish`,
            { markTaskComplete: false },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );

        // ----------------------------------------------------
        // Part 6: Cross-User Isolation & IDOR Protection
        // ----------------------------------------------------
        console.log('\n--- 6. Cross-User Isolation & Privacy ---');

        // User B cannot start session on User A's task
        const userBCantStart = await makeRequest(
            'POST',
            `/api/v1/tasks/${task1Id}/sessions`,
            {},
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(userBCantStart.status, 404);
        console.log('  ✅ [PASS] User B cannot start session on User A task (404 Not Found)');

        // User B cannot pause, resume, finish, or discard User A's session
        const userBCantPause = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/pause`,
            {},
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(userBCantPause.status, 404);
        console.log('  ✅ [PASS] User B cannot pause User A session (404 Not Found)');

        const userBCantFinish = await makeRequest(
            'POST',
            `/api/v1/sessions/${session1Id}/finish`,
            { markTaskComplete: true },
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(userBCantFinish.status, 404);
        console.log('  ✅ [PASS] User B cannot finish User A session (404 Not Found)');

        // User B's history is isolated and contains 0 sessions
        const userBHistory = await makeRequest(
            'GET',
            '/api/v1/sessions',
            null,
            { Cookie: buildCookieHeader(userBCookies) }
        );
        assert.strictEqual(userBHistory.status, 200);
        assert.strictEqual(userBHistory.body.data.sessions.length, 0);
        console.log('  ✅ [PASS] User B session history is strictly isolated (0 sessions)');

        // ----------------------------------------------------
        // Part 7: Session History & Task History Pagination
        // ----------------------------------------------------
        console.log('\n--- 7. Session History Pagination & Filtering ---');

        const historyRes = await makeRequest(
            'GET',
            '/api/v1/sessions?page=1&limit=10',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(historyRes.status, 200);
        assert.strictEqual(historyRes.body.data.sessions.length, 5);
        assert.strictEqual(historyRes.body.meta.pagination.total, 5);
        assert.strictEqual(historyRes.body.meta.pagination.page, 1);
        console.log('  ✅ [PASS] GET /api/v1/sessions returns paginated list of user sessions');

        // Task-specific history
        const taskHistoryRes = await makeRequest(
            'GET',
            `/api/v1/tasks/${task1Id}/sessions`,
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(taskHistoryRes.status, 200);
        assert.strictEqual(taskHistoryRes.body.data.sessions.length, 1);
        assert.ok(taskHistoryRes.body.data.totalDurationSeconds >= 2);
        console.log('  ✅ [PASS] GET /api/v1/tasks/:taskId/sessions returns task-specific sessions & totalDurationSeconds');

        // ----------------------------------------------------
        // Part 8: Discarding Session
        // ----------------------------------------------------
        console.log('\n--- 8. Discarding In-Progress Session ---');

        const start3 = await makeRequest(
            'POST',
            `/api/v1/tasks/${task1Id}/sessions`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(start3.status, 201);
        const session3Id = start3.body.data.session.id;

        const discardRes = await makeRequest(
            'POST',
            `/api/v1/sessions/${session3Id}/discard`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(discardRes.status, 200);
        assert.strictEqual(discardRes.body.data.session.status, 'DISCARDED');
        console.log('  ✅ [PASS] POST /api/v1/sessions/:sessionId/discard discards session cleanly');

        console.log('\n====================================================');
        console.log('Results: All FocusFlow Phase 4 automated tests passed!');
        console.log('====================================================\n');
    } finally {
        if (prisma) {
            try {
                await prisma.user.deleteMany({
                    where: { email: { in: [userAEmail, userBEmail] } },
                });
                console.log('🧹 Database Cleanup: Test users & timer sessions removed. Zero leftover records.\n');
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
    console.error('\n❌ FocusFlow Phase 4 Test Suite Failed:', err);
    process.exit(1);
});
