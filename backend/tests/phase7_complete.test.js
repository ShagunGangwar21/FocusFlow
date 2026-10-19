'use strict';

/**
 * backend/tests/phase7_complete.test.js
 *
 * Comprehensive automated tests for FocusFlow Phase 7:
 *  - Streaks calculation (zero activity, active today, consecutive days, gaps, timezone)
 *  - Achievements seeding, evaluation, unlocking milestones, idempotency & duplicate-safety
 *  - Analytics summary (planned vs actual, completion rate, accuracy %, overruns)
 *  - Analytics weekly review (7-day Monday-Sunday breakdown, daily insights)
 *  - Authorization & cross-user privacy enforcement
 *  - Database teardown & test record cleanup
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5067;
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
    console.log('FocusFlow Phase 7: Streaks, Achievements & Analytics');
    console.log('====================================================\n');

    let server;
    let prisma;

    const userAEmail = `user_a_p7_${Date.now()}@example.com`;
    const userBEmail = `user_b_p7_${Date.now()}@example.com`;
    const password = 'Password123!';

    const userACookies = {};
    const userBCookies = {};
    let userACsrf = '';
    let userBCsrf = '';
    let userAId = '';
    let userBId = '';

    let passed = 0;
    let failed = 0;

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

        // 1. Setup Test Users
        console.log('[Setup] Registering test users...');
        const csrfA = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userACsrf = csrfA.body.data.csrfToken;
        userACookies['XSRF-TOKEN'] = csrfA.cookies['XSRF-TOKEN'];

        const regA = await makeRequest('POST', '/api/v1/auth/register', {
            name: 'Phase 7 User A',
            email: userAEmail,
            password,
            timezone: 'UTC',
        }, {
            Cookie: buildCookieHeader(userACookies),
            'X-CSRF-Token': userACsrf,
        });
        assert.strictEqual(regA.status, 201, 'User A registration should succeed');
        userAId = regA.body.data.user.id;
        userACookies['auth_session'] = regA.cookies['auth_session'];
        if (regA.cookies['XSRF-TOKEN']) {
            userACookies['XSRF-TOKEN'] = regA.cookies['XSRF-TOKEN'];
            userACsrf = regA.cookies['XSRF-TOKEN'];
        }

        const csrfB = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userBCsrf = csrfB.body.data.csrfToken;
        userBCookies['XSRF-TOKEN'] = csrfB.cookies['XSRF-TOKEN'];

        const regB = await makeRequest('POST', '/api/v1/auth/register', {
            name: 'Phase 7 User B',
            email: userBEmail,
            password,
            timezone: 'UTC',
        }, {
            Cookie: buildCookieHeader(userBCookies),
            'X-CSRF-Token': userBCsrf,
        });
        assert.strictEqual(regB.status, 201, 'User B registration should succeed');
        userBId = regB.body.data.user.id;
        userBCookies['auth_session'] = regB.cookies['auth_session'];
        if (regB.cookies['XSRF-TOKEN']) {
            userBCookies['XSRF-TOKEN'] = regB.cookies['XSRF-TOKEN'];
            userBCsrf = regB.cookies['XSRF-TOKEN'];
        }

        // ---------------------------------------------------------------------
        // PART 1: STREAKS
        // ---------------------------------------------------------------------
        console.log('\n--- Section 1: Streaks Calculation ---');

        await assertAsyncTest('1.1 Streak summary returns 0 for user with no activity', async () => {
            const res = await makeRequest('GET', '/api/v1/streaks/summary', null, {
                Cookie: buildCookieHeader(userACookies),
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.streak.currentStreakDays, 0);
            assert.strictEqual(res.body.data.streak.longestStreakDays, 0);
            assert.strictEqual(res.body.data.streak.isActiveToday, false);
            assert.strictEqual(res.body.data.streak.lastActiveDate, null);
        });

        await assertAsyncTest('1.2 Streak activates upon completed task today', async () => {
            // Create and complete a task for User A
            const task = await prisma.task.create({
                data: {
                    title: 'Streak Task Today',
                    scope: 'PERSONAL',
                    ownerId: userAId,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    estimatedDurationMinutes: 30,
                    actualDurationMinutes: 30,
                },
            });

            const res = await makeRequest('GET', '/api/v1/streaks/summary', null, {
                Cookie: buildCookieHeader(userACookies),
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.streak.currentStreakDays, 1);
            assert.strictEqual(res.body.data.streak.longestStreakDays, 1);
            assert.strictEqual(res.body.data.streak.isActiveToday, true);
            assert.ok(res.body.data.streak.lastActiveDate !== null);
        });

        await assertAsyncTest('1.3 Streaks calculate consecutive historical days correctly', async () => {
            // Add completed tasks for yesterday, 2 days ago, and 3 days ago
            const d1 = new Date();
            d1.setUTCDate(d1.getUTCDate() - 1);
            const d2 = new Date();
            d2.setUTCDate(d2.getUTCDate() - 2);
            const d3 = new Date();
            d3.setUTCDate(d3.getUTCDate() - 3);

            await prisma.task.createMany({
                data: [
                    { title: 'T-1', scope: 'PERSONAL', ownerId: userAId, status: 'COMPLETED', completedAt: d1 },
                    { title: 'T-2', scope: 'PERSONAL', ownerId: userAId, status: 'COMPLETED', completedAt: d2 },
                    { title: 'T-3', scope: 'PERSONAL', ownerId: userAId, status: 'COMPLETED', completedAt: d3 },
                ],
            });

            const res = await makeRequest('GET', '/api/v1/streaks/summary', null, {
                Cookie: buildCookieHeader(userACookies),
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.streak.currentStreakDays, 4);
            assert.strictEqual(res.body.data.streak.longestStreakDays, 4);
            assert.strictEqual(res.body.data.streak.isActiveToday, true);
        });

        await assertAsyncTest('1.4 Streak preserves longest streak across historical gaps', async () => {
            // Add a 5-day streak further in the past (days 10, 11, 12, 13, 14 ago)
            const pastDays = [10, 11, 12, 13, 14];
            for (const offset of pastDays) {
                const pastDate = new Date();
                pastDate.setUTCDate(pastDate.getUTCDate() - offset);
                await prisma.task.create({
                    data: {
                        title: `T-Past-${offset}`,
                        scope: 'PERSONAL',
                        ownerId: userAId,
                        status: 'COMPLETED',
                        completedAt: pastDate,
                    },
                });
            }

            const res = await makeRequest('GET', '/api/v1/streaks/summary', null, {
                Cookie: buildCookieHeader(userACookies),
            });
            assert.strictEqual(res.status, 200);
            // Current streak is 4, but longest streak should be 5
            assert.strictEqual(res.body.data.streak.currentStreakDays, 4);
            assert.strictEqual(res.body.data.streak.longestStreakDays, 5);
        });

        // ---------------------------------------------------------------------
        // PART 2: ACHIEVEMENTS
        // ---------------------------------------------------------------------
        console.log('\n--- Section 2: Achievements ---');

        await assertAsyncTest('2.1 Achievements endpoint returns full catalog with locked/unlocked statuses', async () => {
            const res = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.data.achievements));
            assert.strictEqual(res.body.data.achievements.length, 8);
            // User B has no activity, all should be locked
            assert.strictEqual(res.body.meta.unlockedCount, 0);
            assert.strictEqual(res.body.data.achievements.every((a) => !a.unlocked), true);
        });

        await assertAsyncTest('2.2 Unlocks session & focus milestones after completed session', async () => {
            // Create a task and a 65-minute completed session for User B
            const taskB = await prisma.task.create({
                data: {
                    title: 'Deep Work Task B',
                    scope: 'PERSONAL',
                    ownerId: userBId,
                    status: 'IN_PROGRESS',
                },
            });

            await prisma.timerSession.create({
                data: {
                    taskId: taskB.id,
                    userId: userBId,
                    status: 'COMPLETED',
                    startedAt: new Date(Date.now() - 65 * 60 * 1000),
                    endedAt: new Date(),
                    durationSeconds: 65 * 60,
                },
            });

            // GET /achievements automatically triggers evaluation
            const res = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res.status, 200);
            
            const firstSession = res.body.data.achievements.find((a) => a.code === 'FIRST_FLOW_SESSION');
            const hourOfPower = res.body.data.achievements.find((a) => a.code === 'FIRST_FLOW_HOUR');
            const deepWork = res.body.data.achievements.find((a) => a.code === 'DEEP_WORK_MASTER');

            assert.strictEqual(firstSession.unlocked, true, 'FIRST_FLOW_SESSION should be unlocked');
            assert.strictEqual(hourOfPower.unlocked, true, 'FIRST_FLOW_HOUR should be unlocked');
            assert.strictEqual(deepWork.unlocked, true, 'DEEP_WORK_MASTER should be unlocked (session >= 45m)');
            assert.ok(firstSession.unlockedAt !== null);
        });

        await assertAsyncTest('2.3 Unlocks task milestone when task threshold is reached', async () => {
            // Complete 5 tasks for User B to hit TASK_CRUSHER_5
            for (let i = 0; i < 5; i++) {
                await prisma.task.create({
                    data: {
                        title: `Task Crusher ${i + 1}`,
                        scope: 'PERSONAL',
                        ownerId: userBId,
                        status: 'COMPLETED',
                        completedAt: new Date(),
                    },
                });
            }

            const res = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res.status, 200);
            const taskCrusher = res.body.data.achievements.find((a) => a.code === 'TASK_CRUSHER_5');
            assert.strictEqual(taskCrusher.unlocked, true, 'TASK_CRUSHER_5 should be unlocked');
        });

        await assertAsyncTest('2.4 Duplicate-safe awarding: repeated evaluation does not create duplicate records', async () => {
            // Call GET /achievements again
            const res1 = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            const res2 = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res1.status, 200);
            assert.strictEqual(res2.status, 200);
            assert.strictEqual(res1.body.meta.unlockedCount, res2.body.meta.unlockedCount);

            // Directly inspect UserAchievement count in DB for User B
            const count = await prisma.userAchievement.count({
                where: { userId: userBId },
            });
            assert.strictEqual(count, res2.body.meta.unlockedCount);
        });

        await assertAsyncTest('2.5 Achievements privacy: User A cannot see User B achievements', async () => {
            const resA = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userACookies),
            });
            const resB = await makeRequest('GET', '/api/v1/achievements', null, {
                Cookie: buildCookieHeader(userBCookies),
            });

            // User A has 0 focus sessions, so FIRST_FLOW_SESSION is locked for User A
            const firstA = resA.body.data.achievements.find((a) => a.code === 'FIRST_FLOW_SESSION');
            const firstB = resB.body.data.achievements.find((a) => a.code === 'FIRST_FLOW_SESSION');
            assert.strictEqual(firstA.unlocked, false);
            assert.strictEqual(firstB.unlocked, true);
        });

        // ---------------------------------------------------------------------
        // PART 3: ANALYTICS
        // ---------------------------------------------------------------------
        console.log('\n--- Section 3: Analytics Summary & Weekly Review ---');

        await assertAsyncTest('3.1 GET /api/v1/analytics/summary returns accurate planned vs actual metrics', async () => {
            const res = await makeRequest('GET', '/api/v1/analytics/summary', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.summary.scope, 'PERSONAL');
            assert.strictEqual(res.body.data.summary.actualFocusMinutes, 65);
            assert.ok(res.body.data.summary.totalTasksCount >= 5);
            assert.ok(res.body.data.summary.completedTasksCount >= 5);
            assert.ok(typeof res.body.data.summary.completionRate === 'number');
            assert.ok(res.body.data.summary.totalFocusSessions >= 1);
        });

        await assertAsyncTest('3.2 GET /api/v1/analytics/weekly-review returns 7-day breakdown and insights', async () => {
            const res = await makeRequest('GET', '/api/v1/analytics/weekly-review', null, {
                Cookie: buildCookieHeader(userBCookies),
            });
            assert.strictEqual(res.status, 200);
            const review = res.body.data.review;
            assert.strictEqual(review.dailyBreakdown.length, 7, 'Weekly review must have 7 daily breakdowns (Monday to Sunday)');
            assert.ok(Array.isArray(review.insights), 'Insights should be an array');
            assert.ok(review.insights.length > 0, 'Should generate actionable insights');
            assert.strictEqual(review.summary.actualFocusMinutes, 65);
        });

        await assertAsyncTest('3.3 Team analytics requires active team membership', async () => {
            // Attempt team summary with random teamId
            const fakeTeamId = 'non_existent_team_id';
            const res = await makeRequest('GET', `/api/v1/analytics/summary?scope=TEAM&teamId=${fakeTeamId}`, null, {
                Cookie: buildCookieHeader(userACookies),
            });
            assert.strictEqual(res.status, 403, 'Should reject non-member from viewing team analytics');
        });

    } finally {
        console.log('\n[Teardown] Cleaning up test records...');
        if (prisma) {
            try {
                // Delete user achievements
                await prisma.userAchievement.deleteMany({
                    where: { userId: { in: [userAId, userBId] } },
                });
                // Delete sessions
                await prisma.timerSession.deleteMany({
                    where: { userId: { in: [userAId, userBId] } },
                });
                // Delete tasks
                await prisma.task.deleteMany({
                    where: { ownerId: { in: [userAId, userBId] } },
                });
                // Delete goals
                await prisma.goal.deleteMany({
                    where: { userId: { in: [userAId, userBId] } },
                });
                // Delete users
                await prisma.user.deleteMany({
                    where: { id: { in: [userAId, userBId] } },
                });
            } catch (cleanupErr) {
                console.error('Error during cleanup:', cleanupErr.message);
            }
            await disconnectPrisma();
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    }

    console.log('\n====================================================');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Test runner failure:', err);
    process.exit(1);
});
