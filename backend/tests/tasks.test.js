'use strict';

/**
 * backend/tests/tasks.test.js
 *
 * Automated tests for FocusFlow Task Management (Phase 2):
 *  1. Task request validation (Zod schemas, DB constraints)
 *  2. Unauthenticated access rejection (401 Unauthorized)
 *  3. Cross-user isolation / IDOR prevention (User B cannot read, update, complete, or delete User A's tasks)
 *  4. Task creation, retrieval, update, completion, reopening, and deletion
 *  5. Optimistic concurrency control (Version mismatch -> 409 Conflict)
 *  6. Task filtering (status, priority, scheduleType, search) and pagination
 *  7. Reliable test data cleanup (Zero database records left behind)
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');

const TEST_PORT = 5057;
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
                        cookies[key] = val;
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
    console.log('FocusFlow Task Management Phase 2 Automated Test Suite');
    console.log('====================================================\n');

    let server;
    let prisma;

    const userAEmail = `test_usera_${Date.now()}@focusflow.test`;
    const userBEmail = `test_userb_${Date.now()}@focusflow.test`;
    const password = 'Password123';

    let userACookies = {};
    let userBCookies = {};
    let userACsrf = '';
    let userBCsrf = '';

    try {
        server = await new Promise((resolve, reject) => {
            const s = app.listen(TEST_PORT, (err) => {
                if (err) return reject(err);
                resolve(s);
            });
        });

        prisma = await getPrisma();

        // --- Setup Users A & B ---
        // Bootstrap CSRF for registration
        const csrfResA = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userACsrf = csrfResA.body.data.csrfToken;
        userACookies['XSRF-TOKEN'] = csrfResA.cookies['XSRF-TOKEN'];

        const regResA = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'User A', email: userAEmail, password },
            {
                Cookie: buildCookieHeader(userACookies),
                'X-CSRF-Token': userACsrf,
            }
        );
        assert.strictEqual(regResA.status, 201, 'User A registration must succeed');
        userACookies['auth_session'] = regResA.cookies['auth_session'];
        if (regResA.cookies['XSRF-TOKEN']) {
            userACookies['XSRF-TOKEN'] = regResA.cookies['XSRF-TOKEN'];
            userACsrf = regResA.cookies['XSRF-TOKEN'];
        }

        const csrfResB = await makeRequest('GET', '/api/v1/auth/csrf-token');
        userBCsrf = csrfResB.body.data.csrfToken;
        userBCookies['XSRF-TOKEN'] = csrfResB.cookies['XSRF-TOKEN'];

        const regResB = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            { name: 'User B', email: userBEmail, password },
            {
                Cookie: buildCookieHeader(userBCookies),
                'X-CSRF-Token': userBCsrf,
            }
        );
        assert.strictEqual(regResB.status, 201, 'User B registration must succeed');
        userBCookies['auth_session'] = regResB.cookies['auth_session'];
        if (regResB.cookies['XSRF-TOKEN']) {
            userBCookies['XSRF-TOKEN'] = regResB.cookies['XSRF-TOKEN'];
            userBCsrf = regResB.cookies['XSRF-TOKEN'];
        }

        // --- SECTION 1: Unauthenticated Access Rejection ---
        console.log('--- 1. Unauthenticated Access Rejection ---');

        const unauthList = await makeRequest('GET', '/api/v1/tasks');
        assert.strictEqual(unauthList.status, 401, 'GET /tasks without cookie must return 401');
        assert.strictEqual(unauthList.body.error.code, 'UNAUTHORIZED');
        console.log('  ✅ [PASS] GET /api/v1/tasks rejects unauthenticated access (401)');

        const unauthCreate = await makeRequest('POST', '/api/v1/tasks', { title: 'Test' });
        assert.strictEqual(unauthCreate.status, 401, 'POST /tasks without cookie must return 401');
        console.log('  ✅ [PASS] POST /api/v1/tasks rejects unauthenticated access (401)');

        const unauthPatch = await makeRequest('PATCH', '/api/v1/tasks/dummy-id', { title: 'Test' });
        assert.strictEqual(unauthPatch.status, 401, 'PATCH /tasks/:id without cookie must return 401');
        console.log('  ✅ [PASS] PATCH /api/v1/tasks/:id rejects unauthenticated access (401)');

        const unauthDelete = await makeRequest('DELETE', '/api/v1/tasks/dummy-id');
        assert.strictEqual(unauthDelete.status, 401, 'DELETE /tasks/:id without cookie must return 401');
        console.log('  ✅ [PASS] DELETE /api/v1/tasks/:id rejects unauthenticated access (401)');

        // --- SECTION 2: Request Validation ---
        console.log('\n--- 2. Request Validation (Zod & DB Constraints) ---');

        // Missing / empty title
        const valEmptyTitle = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: '   ' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valEmptyTitle.status, 400);
        assert.strictEqual(valEmptyTitle.body.error.code, 'VALIDATION_ERROR');
        console.log('  ✅ [PASS] Rejects empty task title with 400 VALIDATION_ERROR');

        // Duration validation: reject 0, negative, and decimal
        const valDurationZero = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Zero Duration Task', estimatedDurationMinutes: 0 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valDurationZero.status, 400);

        const valDurationNegative = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Negative Duration Task', estimatedDurationMinutes: -5 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valDurationNegative.status, 400);

        const valDurationDecimal = await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Decimal Duration Task', estimatedDurationMinutes: 12.5 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valDurationDecimal.status, 400);
        console.log('  ✅ [PASS] Rejects estimated duration 0, negative, and decimal (400)');

        // endAt <= startAt
        const now = new Date();
        const past = new Date(now.getTime() - 3600000);
        const valDates = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Invalid Dates Task',
                startAt: now.toISOString(),
                endAt: past.toISOString(),
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valDates.status, 400);
        console.log('  ✅ [PASS] Rejects task where endAt <= startAt');

        // Personal task cannot have teamId
        const valPersonalTeamId = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Personal task with teamId',
                scope: 'PERSONAL',
                teamId: 'cm2testteam123456789012345',
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(valPersonalTeamId.status, 400);
        console.log('  ✅ [PASS] Rejects personal task assigned to a teamId (DB scope check)');

        // --- SECTION 3: Task CRUD Operations (User A) ---
        console.log('\n--- 3. Task Lifecycle (Create, Read, Update, Complete, Reopen, Delete) ---');

        // Create Task
        const createRes = await makeRequest(
            'POST',
            '/api/v1/tasks',
            {
                title: 'Implement Task Management Engine',
                description: 'Build backend routes, services, and frontend integration',
                priority: 'HIGH',
                scheduleType: 'FIXED',
                estimatedDurationMinutes: 60,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(createRes.status, 201, 'Task creation should return 201');
        const createdTask = createRes.body.data.task;
        assert.ok(createdTask.id, 'Created task must have an id');
        assert.strictEqual(createdTask.title, 'Implement Task Management Engine');
        assert.strictEqual(createdTask.priority, 'HIGH');
        assert.strictEqual(createdTask.scheduleType, 'FIXED');
        assert.strictEqual(createdTask.status, 'PENDING');
        assert.strictEqual(createdTask.version, 1);
        console.log('  ✅ [PASS] POST /api/v1/tasks creates personal task with version 1 (201)');

        const taskId = createdTask.id;

        // Verify custom durations: 1 min, 10 min, 30 min, 75 min
        for (const dur of [1, 10, 30, 75]) {
            const customDurRes = await makeRequest(
                'POST',
                '/api/v1/tasks',
                {
                    title: `Task with ${dur}m duration`,
                    estimatedDurationMinutes: dur,
                },
                { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
            );
            assert.strictEqual(customDurRes.status, 201, `Duration ${dur}m should return 201`);
            assert.strictEqual(customDurRes.body.data.task.estimatedDurationMinutes, dur);
            const fetchCustom = await makeRequest(
                'GET',
                `/api/v1/tasks/${customDurRes.body.data.task.id}`,
                null,
                { Cookie: buildCookieHeader(userACookies) }
            );
            assert.strictEqual(fetchCustom.body.data.task.estimatedDurationMinutes, dur);
            // Delete custom duration test task after verifying to keep task count clean
            await makeRequest(
                'DELETE',
                `/api/v1/tasks/${customDurRes.body.data.task.id}`,
                null,
                { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
            );
        }
        console.log('  ✅ [PASS] Custom durations 1m, 10m, 30m, 75m created and persisted correctly');

        // Retrieve Task by ID
        const getRes = await makeRequest(
            'GET',
            `/api/v1/tasks/${taskId}`,
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(getRes.status, 200);
        assert.strictEqual(getRes.body.data.task.id, taskId);
        console.log('  ✅ [PASS] GET /api/v1/tasks/:id retrieves task details (200)');

        // Update Task details
        const patchRes = await makeRequest(
            'PATCH',
            `/api/v1/tasks/${taskId}`,
            {
                title: 'Implement Task Management Engine (Updated)',
                priority: 'MEDIUM',
                version: 1,
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(patchRes.status, 200);
        assert.strictEqual(patchRes.body.data.task.title, 'Implement Task Management Engine (Updated)');
        assert.strictEqual(patchRes.body.data.task.priority, 'MEDIUM');
        assert.strictEqual(patchRes.body.data.task.version, 2, 'Version must increment to 2');
        console.log('  ✅ [PASS] PATCH /api/v1/tasks/:id updates details and increments version (200)');

        // Optimistic Concurrency Protection: Pass stale version (1 when DB is 2)
        const conflictRes = await makeRequest(
            'PATCH',
            `/api/v1/tasks/${taskId}`,
            {
                title: 'Stale update attempt',
                version: 1, // Stale version
            },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(conflictRes.status, 409, 'Stale version must return 409 Conflict');
        assert.strictEqual(conflictRes.body.error.code, 'CONFLICT');
        console.log('  ✅ [PASS] Optimistic concurrency control rejects stale version (409 Conflict)');

        // Complete Task
        const completeRes = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskId}/complete`,
            { actualDurationMinutes: 55 },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(completeRes.status, 200);
        assert.strictEqual(completeRes.body.data.task.status, 'COMPLETED');
        assert.ok(completeRes.body.data.task.completedAt, 'completedAt must be populated');
        assert.strictEqual(completeRes.body.data.task.actualDurationMinutes, 55);
        console.log('  ✅ [PASS] POST /api/v1/tasks/:id/complete marks task complete with timestamp (200)');

        // Reopen Task
        const reopenRes = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskId}/reopen`,
            {},
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(reopenRes.status, 200);
        assert.strictEqual(reopenRes.body.data.task.status, 'PENDING');
        assert.strictEqual(reopenRes.body.data.task.completedAt, null, 'completedAt must be cleared on reopen');
        console.log('  ✅ [PASS] POST /api/v1/tasks/:id/reopen reopens task to PENDING (200)');

        // --- SECTION 4: Cross-User Privacy & IDOR Prevention ---
        console.log('\n--- 4. Cross-User Privacy Boundary & IDOR Prevention ---');

        // User B attempts to view User A's task
        const idorGet = await makeRequest(
            'GET',
            `/api/v1/tasks/${taskId}`,
            null,
            { Cookie: buildCookieHeader(userBCookies) }
        );
        assert.strictEqual(idorGet.status, 404, 'User B must not see User A task');
        assert.strictEqual(idorGet.body.error.code, 'NOT_FOUND');
        console.log('  ✅ [PASS] User B cannot read User A\'s personal task (404 Not Found)');

        // User B attempts to patch User A's task
        const idorPatch = await makeRequest(
            'PATCH',
            `/api/v1/tasks/${taskId}`,
            { title: 'Hacked by User B' },
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(idorPatch.status, 404, 'User B must not modify User A task');
        console.log('  ✅ [PASS] User B cannot modify User A\'s personal task (404 Not Found)');

        // User B attempts to complete User A's task
        const idorComplete = await makeRequest(
            'POST',
            `/api/v1/tasks/${taskId}/complete`,
            {},
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(idorComplete.status, 404, 'User B must not complete User A task');
        console.log('  ✅ [PASS] User B cannot complete User A\'s personal task (404 Not Found)');

        // User B attempts to delete User A's task
        const idorDelete = await makeRequest(
            'DELETE',
            `/api/v1/tasks/${taskId}`,
            null,
            { Cookie: buildCookieHeader(userBCookies), 'X-CSRF-Token': userBCsrf }
        );
        assert.strictEqual(idorDelete.status, 404, 'User B must not delete User A task');
        console.log('  ✅ [PASS] User B cannot delete User A\'s personal task (404 Not Found)');

        // User B task list does not include User A's task
        const userBList = await makeRequest(
            'GET',
            '/api/v1/tasks',
            null,
            { Cookie: buildCookieHeader(userBCookies) }
        );
        assert.strictEqual(userBList.status, 200);
        assert.strictEqual(userBList.body.data.tasks.length, 0, 'User B should have 0 tasks');
        console.log('  ✅ [PASS] User B task list is isolated and contains 0 tasks (200)');

        // Delete Task (User A)
        const deleteRes = await makeRequest(
            'DELETE',
            `/api/v1/tasks/${taskId}`,
            null,
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        assert.strictEqual(deleteRes.status, 200);
        assert.strictEqual(deleteRes.body.data.id, taskId);
        console.log('  ✅ [PASS] DELETE /api/v1/tasks/:id deletes task cleanly (200)');

        // Verify task is gone
        const verifyGone = await makeRequest(
            'GET',
            `/api/v1/tasks/${taskId}`,
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(verifyGone.status, 404);
        console.log('  ✅ [PASS] Deleted task is no longer found (404)');

        // --- SECTION 5: Filtering, Search, & Pagination ---
        console.log('\n--- 5. Task Filtering, Search & Pagination ---');

        // Create 3 tasks with distinct properties for User A
        await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Alpha task search target', priority: 'HIGH', scheduleType: 'FIXED' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Beta task search target', priority: 'LOW', scheduleType: 'FLEXIBLE' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );
        await makeRequest(
            'POST',
            '/api/v1/tasks',
            { title: 'Gamma background job', priority: 'HIGH', scheduleType: 'FLEXIBLE' },
            { Cookie: buildCookieHeader(userACookies), 'X-CSRF-Token': userACsrf }
        );

        // Filter by Priority
        const filterPriority = await makeRequest(
            'GET',
            '/api/v1/tasks?priority=HIGH',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(filterPriority.status, 200);
        assert.strictEqual(filterPriority.body.data.tasks.length, 2);
        assert.ok(filterPriority.body.data.tasks.every((t) => t.priority === 'HIGH'));
        console.log('  ✅ [PASS] Filter by priority=HIGH returns only matching tasks');

        // Filter by ScheduleType
        const filterSchedule = await makeRequest(
            'GET',
            '/api/v1/tasks?scheduleType=FIXED',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(filterSchedule.status, 200);
        assert.strictEqual(filterSchedule.body.data.tasks.length, 1);
        assert.strictEqual(filterSchedule.body.data.tasks[0].title, 'Alpha task search target');
        console.log('  ✅ [PASS] Filter by scheduleType=FIXED returns only fixed tasks');

        // Keyword Search
        const searchRes = await makeRequest(
            'GET',
            '/api/v1/tasks?search=target',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(searchRes.status, 200);
        assert.strictEqual(searchRes.body.data.tasks.length, 2);
        console.log('  ✅ [PASS] Search by query string matches title/description');

        // Pagination
        const paginatedRes = await makeRequest(
            'GET',
            '/api/v1/tasks?page=1&limit=2',
            null,
            { Cookie: buildCookieHeader(userACookies) }
        );
        assert.strictEqual(paginatedRes.status, 200);
        assert.strictEqual(paginatedRes.body.data.tasks.length, 2);
        assert.strictEqual(paginatedRes.body.meta.pagination.page, 1);
        assert.strictEqual(paginatedRes.body.meta.pagination.limit, 2);
        assert.strictEqual(paginatedRes.body.meta.pagination.total, 3);
        assert.strictEqual(paginatedRes.body.meta.pagination.totalPages, 2);
        console.log('  ✅ [PASS] Pagination limits page size and calculates totalPages accurately');

        console.log('\n====================================================');
        console.log('Results: All Phase 2 Task API automated tests passed!');
        console.log('====================================================\n');
    } finally {
        // --- CLEANUP ---
        if (prisma) {
            try {
                await prisma.user.deleteMany({
                    where: { email: { in: [userAEmail, userBEmail] } },
                });
                console.log('🧹 Database Cleanup: Test users & tasks removed. Zero leftover records.\n');
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
    console.error('\n❌ Task API Test Suite Failed:', err);
    process.exit(1);
});
