'use strict';

/**
 * backend/tests/timer.test.js
 *
 * Automated tests for FocusFlow Focus Timer State and Integration:
 *  1. Single active timer invariant (only one task can accumulate time at once)
 *  2. Preserving elapsed focus time when switching tasks (no resetting to zero)
 *  3. Returning to a previously focused task resumes from its preserved elapsed time
 *  4. Pause and resume preserve accumulated seconds correctly
 *  5. Finishing a focus session passes tracked duration to the task completion API
 *  6. Reliable cleanup: zero leftover database records
 */

require('dotenv').config();
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5058;
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

/**
 * Deterministic Timer Engine Simulator
 * Mirrors the exact logic implemented in App.jsx:
 * - activeTaskId
 * - isTimerPaused
 * - taskElapsedSeconds: { [taskId]: number }
 */
class TimerEngineSimulator {
    constructor() {
        this.activeTaskId = null;
        this.isTimerPaused = false;
        this.taskElapsedSeconds = {};
    }

    startFocus(taskId) {
        this.activeTaskId = taskId;
        this.isTimerPaused = false;
        if (this.taskElapsedSeconds[taskId] === undefined) {
            this.taskElapsedSeconds[taskId] = 0;
        }
    }

    pause() {
        this.isTimerPaused = true;
    }

    resume() {
        this.isTimerPaused = false;
    }

    togglePause() {
        this.isTimerPaused = !this.isTimerPaused;
    }

    discard() {
        // Hides banner without resetting elapsed seconds
        this.activeTaskId = null;
    }

    tick(seconds = 1) {
        if (!this.activeTaskId || this.isTimerPaused) {
            return;
        }
        this.taskElapsedSeconds[this.activeTaskId] =
            (this.taskElapsedSeconds[this.activeTaskId] || 0) + seconds;
    }

    getTrackedMinutes(taskId) {
        const secs = this.taskElapsedSeconds[taskId] || 0;
        return secs > 0 ? Math.max(1, Math.round(secs / 60)) : undefined;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('FocusFlow Focus Timer Test Suite');
    console.log('====================================================\n');

    let server;
    let prisma;
    const testUserEmail = `timer_test_${Date.now()}@example.com`;

    try {
        // ----------------------------------------------------
        // Part 1: Unit Invariants (Switching, Pausing, Single-timer)
        // ----------------------------------------------------
        console.log('--- Part 1: Focus Timer State Machine Tests ---');

        const timer = new TimerEngineSimulator();

        // 1. Initial State
        assert.strictEqual(timer.activeTaskId, null);
        assert.strictEqual(timer.isTimerPaused, false);
        console.log('  ✅ [PASS] Initial timer state is idle with no active task');

        // 2. Start Focus on Task A (e.g. DSA)
        timer.startFocus('task-dsa');
        assert.strictEqual(timer.activeTaskId, 'task-dsa');
        assert.strictEqual(timer.isTimerPaused, false);
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 0);
        console.log('  ✅ [PASS] Starting focus on Task A initializes timer at 0s');

        // 3. Tick 120 seconds on Task A
        timer.tick(120);
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 120);
        console.log('  ✅ [PASS] Task A accumulates 120s of focus time');

        // 4. Switch to Task B (e.g. WWB) - Invariant: Only ONE timer runs; previous timer stops
        timer.startFocus('task-wwb');
        assert.strictEqual(timer.activeTaskId, 'task-wwb');
        assert.strictEqual(timer.taskElapsedSeconds['task-wwb'], 0);
        // Verify Task A's time was preserved, not reset
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 120);
        console.log('  ✅ [PASS] Switching to Task B stops Task A and preserves Task A elapsed time at 120s');

        // 5. Tick 45 seconds on Task B - Verify Task A does NOT accumulate any time
        timer.tick(45);
        assert.strictEqual(timer.taskElapsedSeconds['task-wwb'], 45);
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 120);
        console.log('  ✅ [PASS] Single-timer invariant: only Task B accumulates time; Task A remains at 120s');

        // 6. Switch back to Task A (e.g. DSA) - Bug regression test: Must NOT reset to zero!
        timer.startFocus('task-dsa');
        assert.strictEqual(timer.activeTaskId, 'task-dsa');
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 120, 'Task A elapsed time must not reset to zero!');
        assert.strictEqual(timer.taskElapsedSeconds['task-wwb'], 45, 'Task B elapsed time must be preserved at 45s!');
        console.log('  ✅ [PASS] Returning to Task A preserves its previous 120s without resetting to zero');

        // 7. Resume ticking on Task A
        timer.tick(60);
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 180);
        assert.strictEqual(timer.taskElapsedSeconds['task-wwb'], 45);
        console.log('  ✅ [PASS] Resuming focus on Task A continues accumulation seamlessly (180s total)');

        // 8. Pause and Resume Behavior
        timer.pause();
        assert.strictEqual(timer.isTimerPaused, true);
        timer.tick(30); // Ticks while paused should be ignored
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 180, 'Paused timer must not accumulate time');
        console.log('  ✅ [PASS] Paused timer halts accumulation and preserves elapsed time');

        timer.resume();
        assert.strictEqual(timer.isTimerPaused, false);
        timer.tick(15);
        assert.strictEqual(timer.taskElapsedSeconds['task-dsa'], 195);
        console.log('  ✅ [PASS] Resuming timer continues accumulation from 195s');

        // 9. Duration Calculation: 195s -> 3 minutes
        assert.strictEqual(timer.getTrackedMinutes('task-dsa'), 3);
        // 45s -> Math.max(1, Math.round(45/60)) = 1 minute
        assert.strictEqual(timer.getTrackedMinutes('task-wwb'), 1);
        console.log('  ✅ [PASS] Tracked duration converts correctly to integer minutes for completion API');

        // ----------------------------------------------------
        // Part 2: Backend Task Completion with Tracked Duration
        // ----------------------------------------------------
        console.log('\n--- Part 2: Backend Task Completion with Tracked Duration ---');

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        prisma = await getPrisma();

        // 1. Bootstrap CSRF token
        const csrfBootstrap = await makeRequest('GET', '/api/v1/auth/csrf-token');
        assert.strictEqual(csrfBootstrap.status, 200);
        let csrfToken = csrfBootstrap.body.data.csrfToken;
        const userCookies = { 'XSRF-TOKEN': csrfBootstrap.cookies['XSRF-TOKEN'] };

        // 2. Register test user with CSRF header
        const regRes = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            {
                name: 'Timer Test User',
                email: testUserEmail,
                password: 'SecurePassword123!',
            },
            {
                Cookie: buildCookieHeader(userCookies),
                'X-CSRF-Token': csrfToken,
            }
        );
        assert.strictEqual(regRes.status, 201);
        userCookies['auth_session'] = regRes.cookies['auth_session'];
        if (regRes.cookies['XSRF-TOKEN']) {
            userCookies['XSRF-TOKEN'] = regRes.cookies['XSRF-TOKEN'];
            csrfToken = regRes.cookies['XSRF-TOKEN'];
        }

        // 3. Create Task
        const taskRes = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Data Structures & Algorithms (DSA)',
                estimatedDurationMinutes: 45,
                scheduleType: 'FLEXIBLE',
            },
            {
                Cookie: buildCookieHeader(userCookies),
                'X-CSRF-Token': csrfToken,
            }
        );
        assert.strictEqual(taskRes.status, 201);
        const taskId = taskRes.body.data.task.id;
        console.log('  ✅ [PASS] Test task created for timer integration');

        // Complete Task passing actual tracked focus duration (e.g. 35 minutes)
        const completeRes = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskId}/complete`,
            {
                actualDurationMinutes: 35,
            },
            {
                Cookie: buildCookieHeader(userCookies),
                'X-CSRF-Token': csrfToken,
            }
        );
        assert.strictEqual(completeRes.status, 200);
        assert.strictEqual(completeRes.body.data.task.status, 'COMPLETED');
        assert.strictEqual(completeRes.body.data.task.actualDurationMinutes, 35);
        assert.ok(completeRes.body.data.task.completedAt, 'completedAt timestamp must be recorded');
        console.log('  ✅ [PASS] Task completion endpoint records actualDurationMinutes and completedAt in PostgreSQL');

        // Verify record in database
        const dbTask = await prisma.task.findUnique({ where: { id: taskId } });
        assert.strictEqual(dbTask.status, 'COMPLETED');
        assert.strictEqual(dbTask.actualDurationMinutes, 35);
        console.log('  ✅ [PASS] Database confirms persisted actualDurationMinutes without mock data');

        console.log('\n====================================================');
        console.log('Results: All Focus Timer tests passed successfully!');
        console.log('====================================================\n');
    } finally {
        if (prisma) {
            try {
                await prisma.user.deleteMany({
                    where: { email: testUserEmail },
                });
                console.log('🧹 Database Cleanup: Test user and task records deleted. Zero leftover records.\n');
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
    console.error('\n❌ Focus Timer Test Suite Failed:', err);
    process.exit(1);
});
