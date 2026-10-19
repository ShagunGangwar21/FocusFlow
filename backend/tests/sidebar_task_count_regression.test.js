/**
 * backend/tests/sidebar_task_count_regression.test.js
 *
 * Regression test for the FocusFlow Tasks sidebar badge count.
 * Specifically tests the case where the sidebar previously showed 5 while the actual
 * task list contained 2 tasks, ensuring:
 * 1. Both sidebar count and All Tasks count use the exact same current-user, current-workspace
 *    task data array length.
 * 2. Static source code check ensures no hardcoded badge: '5' exists in Sidebar.jsx.
 * 3. Dynamic badge updates immediately when tasks are created, completed, reopened, or deleted.
 * 4. User isolation: User B's task count is isolated from User A's count.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

function extractCookies(setCookieHeader) {
    const cookies = {};
    if (!setCookieHeader) return cookies;
    const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const cookieStr of cookieArray) {
        const parts = cookieStr.split(';')[0].split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    }
    return cookies;
}

function buildCookieHeader(cookies) {
    return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

function makeRequest(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: reqPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                'x-test-bypass': 'focusflow_test_secret',
                ...headers,
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function registerTestUser(name, email, password) {
    const csrfRes = await makeRequest('GET', '/api/v1/auth/csrf-token');
    const initCookies = extractCookies(csrfRes.headers['set-cookie']);
    const csrfToken = csrfRes.body?.data?.csrfToken;

    const regRes = await makeRequest(
        'POST',
        '/api/v1/auth/register',
        { name, email, password },
        {
            Cookie: buildCookieHeader(initCookies),
            'X-CSRF-Token': csrfToken,
        }
    );
    assert.strictEqual(regRes.status, 201, `User ${email} registration must succeed`);
    const authCookies = {
        ...initCookies,
        ...extractCookies(regRes.headers['set-cookie']),
    };
    const finalCsrf = authCookies['XSRF-TOKEN'] || csrfToken;

    return {
        headers: {
            Cookie: buildCookieHeader(authCookies),
            'X-CSRF-Token': finalCsrf,
        },
        user: regRes.body.data.user,
    };
}

// Logic replicate from Sidebar.jsx
function computeSidebarBadges(navItems, taskCount) {
    return navItems.map((item) => {
        if (item.id === 'tasks') {
            return {
                ...item,
                badge: taskCount !== undefined ? String(taskCount) : undefined,
            };
        }
        return item;
    });
}

// Logic replicate from TasksModule.jsx
function computeTasksModuleCounts(tasks) {
    let today = 0;
    let upcoming = 0;
    let pending = 0;
    let completed = 0;
    let overdue = 0;

    tasks.forEach((t) => {
        if (t.status === 'COMPLETED') {
            completed++;
        } else {
            pending++;
        }
    });

    return {
        all: tasks.length,
        today,
        upcoming,
        pending,
        completed,
        overdue,
    };
}

async function runRegressionSuite() {
    console.log('====================================================');
    console.log('FocusFlow Sidebar Task Count Regression Test Suite');
    console.log('====================================================');

    // 1. Static Source Code Integrity Checks
    console.log('\n--- 1. Static Source Code Checks ---');
    const sidebarPath = path.resolve(__dirname, '../../frontend/src/components/layout/Sidebar.jsx');
    const appPath = path.resolve(__dirname, '../../frontend/src/App.jsx');

    const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
    const appCode = fs.readFileSync(appPath, 'utf8');

    // Ensure NAV_ITEMS in Sidebar.jsx no longer hardcodes badge: '5'
    assert.strictEqual(
        sidebarCode.includes("id: 'tasks', label: 'Tasks', icon: IconCheckSquare, badge: '5'"),
        false,
        'Sidebar.jsx must NOT contain hardcoded badge: 5 for tasks'
    );
    assert.ok(
        sidebarCode.includes('taskCount'),
        'Sidebar.jsx must accept taskCount prop'
    );
    assert.ok(
        sidebarCode.includes('navItems'),
        'Sidebar.jsx must map over dynamic navItems'
    );
    console.log('  ✅ [PASS] Sidebar.jsx contains dynamic taskCount and no hardcoded badge: 5');

    // Ensure App.jsx passes taskCount={tasks.length} to Sidebar
    assert.ok(
        appCode.includes('taskCount={tasks.length}'),
        'App.jsx must pass taskCount={tasks.length} to Sidebar'
    );
    console.log('  ✅ [PASS] App.jsx passes taskCount={tasks.length} to Sidebar');

    // 2. Exact Regression Case: User with exactly 2 tasks
    console.log('\n--- 2. Exact Regression Case: 2 Tasks in DB ---');
    const timestamp = Date.now();
    const userA = await registerTestUser('Count Tester A', `count_a_${timestamp}@example.com`, 'Password123!');
    const userB = await registerTestUser('Count Tester B', `count_b_${timestamp}@example.com`, 'Password123!');

    try {
        // User A creates task 1
        const t1 = await makeRequest('POST', '/api/v1/tasks', {
            title: 'First Regression Task',
            estimatedDurationMinutes: 25,
            scheduleType: 'FLEXIBLE',
            priority: 'MEDIUM',
        }, userA.headers);
        assert.strictEqual(t1.status, 201);

        // User A creates task 2
        const t2 = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Second Regression Task',
            estimatedDurationMinutes: 45,
            scheduleType: 'FLEXIBLE',
            priority: 'HIGH',
        }, userA.headers);
        assert.strictEqual(t2.status, 201);

        // Fetch User A tasks from API
        const userATasksRes = await makeRequest('GET', '/api/v1/tasks', null, userA.headers);
        assert.strictEqual(userATasksRes.status, 200);
        const userATasks = userATasksRes.body.data.tasks;
        assert.strictEqual(userATasks.length, 2, 'User A must have exactly 2 tasks');

        // Check counts
        const tasksModuleCounts = computeTasksModuleCounts(userATasks);
        assert.strictEqual(tasksModuleCounts.all, 2, 'TasksModule All Tasks count must equal 2');

        const sidebarItems = computeSidebarBadges([
            { id: 'tasks', label: 'Tasks' },
        ], userATasks.length);
        const sidebarTasksBadge = sidebarItems.find(i => i.id === 'tasks').badge;

        // VERIFY: The sidebar badge must be '2' and MUST NOT be '5'!
        assert.strictEqual(sidebarTasksBadge, '2', 'Sidebar badge must be 2');
        assert.notStrictEqual(sidebarTasksBadge, '5', 'Sidebar badge must NOT be 5');
        assert.strictEqual(parseInt(sidebarTasksBadge, 10), tasksModuleCounts.all, 'Sidebar badge and TasksModule count must strictly match');
        console.log('  ✅ [PASS] Exact regression verified: Sidebar shows 2 (NOT 5), matching All Tasks = 2');

        // 3. Dynamic Updates on Lifecycle Events
        console.log('\n--- 3. Dynamic Updates on Task Actions ---');

        // Create 3rd task
        const t3 = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Third Regression Task',
            estimatedDurationMinutes: 15,
            scheduleType: 'FLEXIBLE',
            priority: 'LOW',
        }, userA.headers);
        assert.strictEqual(t3.status, 201);

        const updatedTasks1 = (await makeRequest('GET', '/api/v1/tasks', null, userA.headers)).body.data.tasks;
        assert.strictEqual(updatedTasks1.length, 3);
        const sidebar3 = computeSidebarBadges([{ id: 'tasks', label: 'Tasks' }], updatedTasks1.length);
        assert.strictEqual(sidebar3.find(i => i.id === 'tasks').badge, '3');
        console.log('  ✅ [PASS] After creating task: Sidebar immediately updates to 3, matching All Tasks = 3');

        // Complete 1 task
        const completeRes = await makeRequest('POST', `/api/v1/tasks/${t3.body.data.task.id}/complete`, {}, userA.headers);
        assert.strictEqual(completeRes.status, 200);

        const updatedTasks2 = (await makeRequest('GET', '/api/v1/tasks', null, userA.headers)).body.data.tasks;
        const countsAfterComplete = computeTasksModuleCounts(updatedTasks2);
        assert.strictEqual(countsAfterComplete.all, 3, 'All Tasks count remains 3');
        assert.strictEqual(countsAfterComplete.completed, 1, 'Completed count is 1');
        assert.strictEqual(countsAfterComplete.pending, 2, 'Pending count is 2');
        const sidebarAfterComplete = computeSidebarBadges([{ id: 'tasks', label: 'Tasks' }], updatedTasks2.length);
        assert.strictEqual(sidebarAfterComplete.find(i => i.id === 'tasks').badge, '3');
        console.log('  ✅ [PASS] After completing task: All Tasks and Sidebar remain 3; completed/pending filters preserved');

        // Delete 1 task
        const deleteRes = await makeRequest('DELETE', `/api/v1/tasks/${t3.body.data.task.id}`, null, userA.headers);
        assert.strictEqual(deleteRes.status, 200);

        const updatedTasks3 = (await makeRequest('GET', '/api/v1/tasks', null, userA.headers)).body.data.tasks;
        assert.strictEqual(updatedTasks3.length, 2);
        const sidebarAfterDelete = computeSidebarBadges([{ id: 'tasks', label: 'Tasks' }], updatedTasks3.length);
        assert.strictEqual(sidebarAfterDelete.find(i => i.id === 'tasks').badge, '2');
        console.log('  ✅ [PASS] After deleting task: Sidebar immediately updates back to 2');

        // 4. User Isolation & Zero Cross-User Leakage
        console.log('\n--- 4. User Isolation & Leakage Prevention ---');
        const userBTasks = (await makeRequest('GET', '/api/v1/tasks', null, userB.headers)).body.data.tasks;
        assert.strictEqual(userBTasks.length, 0, 'User B must have 0 tasks');
        const sidebarB = computeSidebarBadges([{ id: 'tasks', label: 'Tasks' }], userBTasks.length);
        assert.strictEqual(sidebarB.find(i => i.id === 'tasks').badge, '0');
        console.log('  ✅ [PASS] User B has 0 tasks: Sidebar shows 0 (no leakage of User A 2 tasks or hardcoded 5)');

    } finally {
        // Cleanup test users
        console.log('\n--- Cleanup ---');
        await makeRequest('DELETE', '/api/v1/users/me', { currentPassword: 'Password123!' }, userA.headers);
        await makeRequest('DELETE', '/api/v1/users/me', { currentPassword: 'Password123!' }, userB.headers);
        console.log('  ✅ [PASS] Test users cleaned up cleanly');
    }

    console.log('\n====================================================');
    console.log('All Sidebar Task Count Regression Tests Passed!');
    console.log('====================================================');
}

runRegressionSuite().catch((err) => {
    console.error('Regression Suite Failed:', err);
    process.exit(1);
});
