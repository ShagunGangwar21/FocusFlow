'use strict';

/**
 * backend/tests/goals.test.js
 *
 * Automated tests for FocusFlow Goals Backend Module (Phase 7 - Step 1):
 *  1. Unauthenticated request rejection (401)
 *  2. CSRF token enforcement on state-changing requests (403)
 *  3. Request payload validation (Zod schemas, positive targetValue, enums, dates)
 *  4. Goal creation (DAILY & WEEKLY for FOCUS_TIME & TASK_COMPLETION)
 *  5. Focus-time progress calculation from authoritative completed TimerSession records
 *  6. Task-completion progress calculation from completed Task records
 *  7. Cross-user isolation and privacy boundary enforcement
 *  8. Goal updates and soft/hard deletion
 *  9. Teardown & database cleanup (zero leftover records)
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5066;
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
    console.log('FocusFlow Phase 7 Goals Backend Module Tests');
    console.log('====================================================\n');

    let server;
    let prisma;

    const userAEmail = `user_a_goals_${Date.now()}@example.com`;
    const userBEmail = `user_b_goals_${Date.now()}@example.com`;
    const password = 'Password123!';

    const userACookies = {};
    const userBCookies = {};
    let userACsrf = '';
    let userBCsrf = '';
    let userAId = '';
    let userBId = '';

    let passed = 0;
    let failed = 0;

    const assertTest = (name, fn) => {
        try {
            fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(err);
            failed++;
        }
    };

    const assertAsyncTest = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(err);
            failed++;
        }
    };

    try {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        prisma = await getPrisma();

        // --- Bootstrap User A & User B ---
        const csrfA = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userACsrf = csrfA.body.data.csrfToken;
        userACookies['XSRF-TOKEN'] = csrfA.cookies['XSRF-TOKEN'];

        const regA = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'Goal User A', email: userAEmail, password, timezone: 'UTC' },
            {
                Cookie: buildCookieHeader(userACookies),
                'X-CSRF-Token': userACsrf,
            }
        );
        assert.strictEqual(regA.status, 201);
        userAId = regA.body.data.user.id;
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
            { name: 'Goal User B', email: userBEmail, password, timezone: 'UTC' },
            {
                Cookie: buildCookieHeader(userBCookies),
                'X-CSRF-Token': userBCsrf,
            }
        );
        assert.strictEqual(regB.status, 201);
        userBId = regB.body.data.user.id;
        userBCookies['auth_session'] = regB.cookies['auth_session'];
        if (regB.cookies['XSRF-TOKEN']) {
            userBCookies['XSRF-TOKEN'] = regB.cookies['XSRF-TOKEN'];
            userBCsrf = regB.cookies['XSRF-TOKEN'];
        }

        console.log('--- 1. Authentication & CSRF Protection ---');

        await assertAsyncTest('GET /api/v1/goals rejects unauthenticated requests (401)', async () => {
            const res = await makeRequest('GET', '/api/v1/goals');
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
        });

        await assertAsyncTest('POST /api/v1/goals rejects request without CSRF token (403)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                { type: 'FOCUS_TIME', targetValue: 60, period: 'DAILY' },
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        });

        console.log('\n--- 2. Payload Validation & Constraints ---');

        await assertAsyncTest('POST /api/v1/goals rejects missing type or targetValue (400)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                { period: 'DAILY' },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
        });

        await assertAsyncTest('POST /api/v1/goals rejects zero or negative targetValue (400)', async () => {
            const resZero = await makeRequest(
                'POST',
                '/api/v1/goals',
                { type: 'FOCUS_TIME', targetValue: 0, period: 'DAILY' },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(resZero.status, 400);

            const resNeg = await makeRequest(
                'POST',
                '/api/v1/goals',
                { type: 'TASK_COMPLETION', targetValue: -5, period: 'WEEKLY' },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(resNeg.status, 400);
        });

        await assertAsyncTest('POST /api/v1/goals rejects invalid enum values (400)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                { type: 'INVALID_TYPE', targetValue: 30, period: 'YEARLY' },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 400);
        });

        await assertAsyncTest('POST /api/v1/goals rejects endsAt <= startsAt (400)', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 3600000);
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                {
                    type: 'FOCUS_TIME',
                    targetValue: 60,
                    period: 'DAILY',
                    startsAt: now.toISOString(),
                    endsAt: past.toISOString(),
                },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 400);
        });

        console.log('\n--- 3. Goal Creation & Progress Calculations ---');

        let dailyFocusGoalId;
        let weeklyTaskGoalId;

        await assertAsyncTest('POST /api/v1/goals creates a daily focus goal (201)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                {
                    type: 'FOCUS_TIME',
                    targetValue: 60, // 60 minutes
                    period: 'DAILY',
                },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.data.goal.type, 'FOCUS_TIME');
            assert.strictEqual(res.body.data.goal.targetValue, 60);
            assert.strictEqual(res.body.data.goal.period, 'DAILY');
            assert.strictEqual(res.body.data.goal.currentValue, 0);
            assert.strictEqual(res.body.data.goal.progressPercentage, 0);
            assert.strictEqual(res.body.data.goal.isCompleted, false);
            assert.ok(res.body.data.goal.periodBounds);
            dailyFocusGoalId = res.body.data.goal.id;
        });

        await assertAsyncTest('POST /api/v1/goals creates a weekly task completion goal (201)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/goals',
                {
                    type: 'TASK_COMPLETION',
                    targetValue: 3, // 3 tasks
                    period: 'WEEKLY',
                },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.data.goal.type, 'TASK_COMPLETION');
            assert.strictEqual(res.body.data.goal.targetValue, 3);
            assert.strictEqual(res.body.data.goal.period, 'WEEKLY');
            assert.strictEqual(res.body.data.goal.currentValue, 0);
            weeklyTaskGoalId = res.body.data.goal.id;
        });

        // Create tasks & timer sessions for User A
        const task1 = await prisma.task.create({
            data: {
                title: 'User A Focus Task 1',
                ownerId: userAId,
                scope: 'PERSONAL',
                status: 'PENDING',
                estimatedDurationMinutes: 45,
            },
        });

        const task2 = await prisma.task.create({
            data: {
                title: 'User A Focus Task 2',
                ownerId: userAId,
                scope: 'PERSONAL',
                status: 'PENDING',
                estimatedDurationMinutes: 30,
            },
        });

        await assertAsyncTest('Authoritative FOCUS_TIME progress calculates correctly from completed TimerSessions', async () => {
            const now = new Date();

            // 1. Add completed session of 45 minutes (2700s)
            await prisma.timerSession.create({
                data: {
                    userId: userAId,
                    taskId: task1.id,
                    status: 'COMPLETED',
                    startedAt: new Date(now.getTime() - 2700000),
                    endedAt: now,
                    durationSeconds: 2700,
                },
            });

            // 2. Add an UNFINISHED running session of 20 minutes (must NOT be counted)
            await prisma.timerSession.create({
                data: {
                    userId: userAId,
                    taskId: task2.id,
                    status: 'RUNNING',
                    startedAt: new Date(now.getTime() - 1200000),
                    endedAt: null,
                    durationSeconds: 0,
                },
            });

            // Check goal progress
            const listRes = await makeRequest(
                'GET',
                '/api/v1/goals',
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(listRes.status, 200);
            const focusGoal = listRes.body.data.goals.find((g) => g.id === dailyFocusGoalId);
            assert.ok(focusGoal);
            assert.strictEqual(focusGoal.currentValue, 45, 'Only completed session of 45m must be counted');
            assert.strictEqual(focusGoal.progressPercentage, 75); // 45 / 60 = 75%
            assert.strictEqual(focusGoal.isCompleted, false);

            // 3. Complete another 20-minute session (1200s) -> total 65 minutes >= 60 target
            await prisma.timerSession.create({
                data: {
                    userId: userAId,
                    taskId: task2.id,
                    status: 'COMPLETED',
                    startedAt: new Date(now.getTime() - 1200000),
                    endedAt: now,
                    durationSeconds: 1200,
                },
            });

            const updatedRes = await makeRequest(
                'GET',
                `/api/v1/goals/${dailyFocusGoalId}`,
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(updatedRes.status, 200);
            assert.strictEqual(updatedRes.body.data.goal.currentValue, 65);
            assert.strictEqual(updatedRes.body.data.goal.progressPercentage, 100);
            assert.strictEqual(updatedRes.body.data.goal.isCompleted, true);
        });

        await assertAsyncTest('Authoritative TASK_COMPLETION progress calculates from completed tasks', async () => {
            const now = new Date();

            // Mark task1 completed
            await prisma.task.update({
                where: { id: task1.id },
                data: { status: 'COMPLETED', completedAt: now },
            });

            const res1 = await makeRequest(
                'GET',
                `/api/v1/goals/${weeklyTaskGoalId}`,
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(res1.status, 200);
            assert.strictEqual(res1.body.data.goal.currentValue, 1);
            assert.strictEqual(res1.body.data.goal.progressPercentage, 33); // 1 / 3 = 33%
            assert.strictEqual(res1.body.data.goal.isCompleted, false);

            // Mark task2 completed
            await prisma.task.update({
                where: { id: task2.id },
                data: { status: 'COMPLETED', completedAt: now },
            });

            const res2 = await makeRequest(
                'GET',
                `/api/v1/goals/${weeklyTaskGoalId}`,
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(res2.status, 200);
            assert.strictEqual(res2.body.data.goal.currentValue, 2);
            assert.strictEqual(res2.body.data.goal.progressPercentage, 67); // 2 / 3 = 67%
        });

        console.log('\n--- 4. Cross-User Isolation & Privacy Enforcement ---');

        await assertAsyncTest('User B cannot see User A goals in list (isolated 0 goals)', async () => {
            const res = await makeRequest(
                'GET',
                '/api/v1/goals',
                null,
                { Cookie: buildCookieHeader(userBCookies) }
            );
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.goals.length, 0);
        });

        await assertAsyncTest('User B cannot fetch User A goal by ID (404 Not Found)', async () => {
            const res = await makeRequest(
                'GET',
                `/api/v1/goals/${dailyFocusGoalId}`,
                null,
                { Cookie: buildCookieHeader(userBCookies) }
            );
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error.code, 'NOT_FOUND');
        });

        await assertAsyncTest('User B cannot update User A goal (404 Not Found)', async () => {
            const res = await makeRequest(
                'PATCH',
                `/api/v1/goals/${dailyFocusGoalId}`,
                { targetValue: 999 },
                {
                    Cookie: buildCookieHeader(userBCookies),
                    'X-CSRF-Token': userBCsrf,
                }
            );
            assert.strictEqual(res.status, 404);
        });

        await assertAsyncTest('User B cannot delete User A goal (404 Not Found)', async () => {
            const res = await makeRequest(
                'DELETE',
                `/api/v1/goals/${dailyFocusGoalId}`,
                null,
                {
                    Cookie: buildCookieHeader(userBCookies),
                    'X-CSRF-Token': userBCsrf,
                }
            );
            assert.strictEqual(res.status, 404);
        });

        console.log('\n--- 5. Goal Updates & Deletion ---');

        await assertAsyncTest('PATCH /api/v1/goals/:id updates targetValue & recalculates progress (200)', async () => {
            const res = await makeRequest(
                'PATCH',
                `/api/v1/goals/${dailyFocusGoalId}`,
                { targetValue: 130 },
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.goal.targetValue, 130);
            // Current value is 65m -> 65 / 130 = 50%
            assert.strictEqual(res.body.data.goal.progressPercentage, 50);
            assert.strictEqual(res.body.data.goal.isCompleted, false);
        });

        await assertAsyncTest('DELETE /api/v1/goals/:id deletes owned goal (200)', async () => {
            const res = await makeRequest(
                'DELETE',
                `/api/v1/goals/${dailyFocusGoalId}`,
                null,
                {
                    Cookie: buildCookieHeader(userACookies),
                    'X-CSRF-Token': userACsrf,
                }
            );
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.deleted, true);

            // Subsequent fetch returns 404
            const verifyRes = await makeRequest(
                'GET',
                `/api/v1/goals/${dailyFocusGoalId}`,
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(verifyRes.status, 404);
        });

    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // --- Database Teardown & Cleanup ---
        if (prisma) {
            try {
                if (userAId) {
                    await prisma.timerSegment.deleteMany({
                        where: { session: { userId: userAId } },
                    });
                    await prisma.timerSession.deleteMany({
                        where: { userId: userAId },
                    });
                    await prisma.goal.deleteMany({
                        where: { userId: userAId },
                    });
                    await prisma.task.deleteMany({
                        where: { ownerId: userAId },
                    });
                    await prisma.userPreference.deleteMany({
                        where: { userId: userAId },
                    });
                    await prisma.user.deleteMany({
                        where: { id: userAId },
                    });
                }
                if (userBId) {
                    await prisma.goal.deleteMany({
                        where: { userId: userBId },
                    });
                    await prisma.userPreference.deleteMany({
                        where: { userId: userBId },
                    });
                    await prisma.user.deleteMany({
                        where: { id: userBId },
                    });
                }
                console.log('\n🧹 Database Cleanup: Test users, tasks, sessions & goals cleaned up cleanly.');
            } catch (cleanupErr) {
                console.error('Error during test cleanup:', cleanupErr.message);
            }
        }
    }

    console.log(`\n====================================================`);
    console.log(`Goals Test Suite Summary: ${passed} passed, ${failed} failed`);
    console.log(`====================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
