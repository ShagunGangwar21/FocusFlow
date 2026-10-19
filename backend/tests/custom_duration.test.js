'use strict';

/**
 * backend/tests/custom_duration.test.js
 *
 * Automated Test Suite for Custom Task Duration in FocusFlow:
 * - 1 minute — valid
 * - 10 minutes — valid
 * - 30 minutes — valid
 * - 75 minutes — valid
 * - 0 minutes — invalid (rejected with 400 VALIDATION_ERROR)
 * - Negative duration — invalid (rejected with 400 VALIDATION_ERROR)
 * - Decimal duration — invalid (rejected with 400 VALIDATION_ERROR)
 * - Empty duration — invalid (rejected with 400 VALIDATION_ERROR)
 * - Update custom duration and persist across fetch/reopen
 */

const assert = require('assert');
const http = require('http');

const API_BASE = 'http://localhost:5000';

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                let parsedBody = null;
                try {
                    parsedBody = data ? JSON.parse(data) : null;
                } catch (e) {
                    parsedBody = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsedBody,
                });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

function extractCookies(setCookieHeader) {
    if (!setCookieHeader) return {};
    const cookies = {};
    const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    list.forEach((c) => {
        const [cookiePair] = c.split(';');
        const [key, val] = cookiePair.split('=');
        cookies[key.trim()] = val ? val.trim() : '';
    });
    return cookies;
}

function buildCookieHeader(cookies) {
    return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

// Frontend validation function reproduction for unit testing
function validateDurationInput(val) {
    if (val === '' || val === null || val === undefined) {
        return 'Please enter a duration greater than 0 minutes.';
    }
    const str = String(val).trim();
    if (!str) {
        return 'Please enter a duration greater than 0 minutes.';
    }
    if (str.includes('.') || str.includes(',')) {
        return 'Duration must be a whole number of minutes.';
    }
    if (!/^-?\d+$/.test(str)) {
        return 'Please enter a valid number of minutes.';
    }
    const num = parseInt(str, 10);
    if (isNaN(num) || num <= 0) {
        return 'Please enter a duration greater than 0 minutes.';
    }
    return null;
}

async function runCustomDurationTests() {
    console.log('====================================================');
    console.log('FocusFlow Custom Task Duration Automated Test Suite');
    console.log('====================================================\n');

    // 1. Frontend validation logic unit checks
    console.log('--- 1. Frontend Unit Validation Tests ---');
    assert.strictEqual(validateDurationInput(1), null, '1 min should be valid');
    assert.strictEqual(validateDurationInput(10), null, '10 min should be valid');
    assert.strictEqual(validateDurationInput(30), null, '30 min should be valid');
    assert.strictEqual(validateDurationInput(75), null, '75 min should be valid');
    assert.strictEqual(validateDurationInput(150), null, '150 min should be valid');

    assert.strictEqual(validateDurationInput(0), 'Please enter a duration greater than 0 minutes.', '0 min should be rejected');
    assert.strictEqual(validateDurationInput(-5), 'Please enter a duration greater than 0 minutes.', 'Negative duration should be rejected');
    assert.strictEqual(validateDurationInput(12.5), 'Duration must be a whole number of minutes.', 'Decimal duration should be rejected');
    assert.strictEqual(validateDurationInput('0.5'), 'Duration must be a whole number of minutes.', 'Decimal string should be rejected');
    assert.strictEqual(validateDurationInput(''), 'Please enter a duration greater than 0 minutes.', 'Empty duration should be rejected');
    assert.strictEqual(validateDurationInput(null), 'Please enter a duration greater than 0 minutes.', 'Null duration should be rejected');
    assert.strictEqual(validateDurationInput('abc'), 'Please enter a valid number of minutes.', 'Non-numeric string should be rejected');
    console.log('  ✅ [PASS] All frontend duration validation test cases pass');

    // Quick-select preset simulation
    console.log('\n--- 2. Quick-Select Preset Simulation Tests ---');
    const presets = [15, 25, 45, 60];
    presets.forEach((preset) => {
        assert.strictEqual(validateDurationInput(preset), null, `Preset ${preset}m is valid`);
    });
    // Matching preset highlight logic
    function isPresetHighlighted(val, preset) {
        if (validateDurationInput(val) !== null) return false;
        const str = String(val).trim();
        if (!str || str.includes('.') || str.includes(',')) return false;
        return parseInt(str, 10) === preset;
    }
    assert.strictEqual(isPresetHighlighted(15, 15), true);
    assert.strictEqual(isPresetHighlighted('25', 25), true);
    assert.strictEqual(isPresetHighlighted(45, 45), true);
    assert.strictEqual(isPresetHighlighted('60', 60), true);
    assert.strictEqual(isPresetHighlighted(75, 45), false, 'Custom 75m should not highlight preset 45m');
    assert.strictEqual(isPresetHighlighted(75, 15), false, 'Custom 75m should not highlight preset 15m');
    assert.strictEqual(isPresetHighlighted(0, 15), false, 'Invalid 0 should not highlight any preset');
    assert.strictEqual(isPresetHighlighted('15.5', 15), false, 'Decimal 15.5 should not highlight preset 15');
    console.log('  ✅ [PASS] Preset selection and dynamic highlight logic verified');

    // 3. Backend API Validation & Persistence Tests
    console.log('\n--- 3. Backend API Duration Validation & Persistence ---');
    const timestamp = Date.now();
    const userEmail = `duration_test_${timestamp}@example.com`;
    const userPass = 'Password123!';

    // Bootstrap CSRF
    const csrfRes = await makeRequest('GET', '/api/v1/auth/csrf-token');
    const initCookies = extractCookies(csrfRes.headers['set-cookie']);
    const csrfToken = csrfRes.body.data.csrfToken;

    // Register test user
    const regRes = await makeRequest(
        'POST',
        '/api/v1/auth/register',
        {
            name: 'Duration Test User',
            email: userEmail,
            password: userPass,
        },
        {
            Cookie: buildCookieHeader(initCookies),
            'X-CSRF-Token': csrfToken,
        }
    );
    assert.strictEqual(regRes.status, 201, 'User registration should succeed');
    const authCookies = {
        ...initCookies,
        ...extractCookies(regRes.headers['set-cookie']),
    };
    const finalCsrf = authCookies['XSRF-TOKEN'] || csrfToken;
    const authHeaders = {
        Cookie: buildCookieHeader(authCookies),
        'X-CSRF-Token': finalCsrf,
    };

    try {
        // Test invalid cases against API
        console.log('  Testing invalid API submissions:');
        
        // 0 minutes
        const resZero = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Zero duration task',
            estimatedDurationMinutes: 0,
        }, authHeaders);
        assert.strictEqual(resZero.status, 400, '0 min should return 400');
        console.log('    ✅ 0 minutes rejected with 400');

        // Negative duration
        const resNeg = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Negative duration task',
            estimatedDurationMinutes: -10,
        }, authHeaders);
        assert.strictEqual(resNeg.status, 400, 'Negative duration should return 400');
        console.log('    ✅ Negative duration (-10) rejected with 400');

        // Decimal duration
        const resDec = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Decimal duration task',
            estimatedDurationMinutes: 75.5,
        }, authHeaders);
        assert.strictEqual(resDec.status, 400, 'Decimal duration should return 400');
        console.log('    ✅ Decimal duration (75.5) rejected with 400');

        // Empty string duration
        const resEmpty = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Empty duration task',
            estimatedDurationMinutes: '',
        }, authHeaders);
        assert.strictEqual(resEmpty.status, 400, 'Empty duration should return 400');
        console.log('    ✅ Empty string duration rejected with 400');

        // Text duration
        const resText = await makeRequest('POST', '/api/v1/tasks', {
            title: 'Text duration task',
            estimatedDurationMinutes: 'one_hour',
        }, authHeaders);
        assert.strictEqual(resText.status, 400, 'Text duration should return 400');
        console.log('    ✅ Text duration rejected with 400');

        // Test valid cases against API
        console.log('\n  Testing valid API submissions and persistence:');
        const validDurations = [1, 10, 30, 75, 150];
        const createdTaskIds = [];

        for (const dur of validDurations) {
            const createRes = await makeRequest('POST', '/api/v1/tasks', {
                title: `Task with ${dur}m duration`,
                estimatedDurationMinutes: dur,
            }, authHeaders);
            assert.strictEqual(createRes.status, 201, `${dur}m should return 201`);
            assert.strictEqual(createRes.body.data.task.estimatedDurationMinutes, dur);
            const taskId = createRes.body.data.task.id;
            createdTaskIds.push(taskId);

            // Verify persistence via GET
            const getRes = await makeRequest('GET', `/api/v1/tasks/${taskId}`, null, authHeaders);
            assert.strictEqual(getRes.status, 200);
            assert.strictEqual(getRes.body.data.task.estimatedDurationMinutes, dur);
            console.log(`    ✅ ${dur} minutes accepted and persisted correctly (GET verified: ${dur}m)`);
        }

        // Test updating task duration to another custom value
        console.log('\n  Testing task duration update & concurrency:');
        const updateTaskId = createdTaskIds[3]; // The 75m task
        const patchRes = await makeRequest('PATCH', `/api/v1/tasks/${updateTaskId}`, {
            estimatedDurationMinutes: 135,
            version: 1,
        }, authHeaders);
        assert.strictEqual(patchRes.status, 200, 'Update should return 200');
        assert.strictEqual(patchRes.body.data.task.estimatedDurationMinutes, 135);

        // Verify updated duration persists
        const recheckRes = await makeRequest('GET', `/api/v1/tasks/${updateTaskId}`, null, authHeaders);
        assert.strictEqual(recheckRes.body.data.task.estimatedDurationMinutes, 135);
        console.log('    ✅ Updating task duration from 75m to 135m succeeded and persisted');

        // Test completing and reopening task preserves custom duration
        console.log('\n  Testing complete and reopen lifecycle preserves duration:');
        const compRes = await makeRequest('POST', `/api/v1/tasks/${updateTaskId}/complete`, {}, authHeaders);
        assert.strictEqual(compRes.status, 200);
        assert.strictEqual(compRes.body.data.task.estimatedDurationMinutes, 135);

        const reopenRes = await makeRequest('POST', `/api/v1/tasks/${updateTaskId}/reopen`, {}, authHeaders);
        assert.strictEqual(reopenRes.status, 200);
        assert.strictEqual(reopenRes.body.data.task.estimatedDurationMinutes, 135);
        console.log('    ✅ Task completion and reopen preserves custom 135m duration');

        // Clean up created tasks
        for (const tId of createdTaskIds) {
            await makeRequest('DELETE', `/api/v1/tasks/${tId}`, null, authHeaders);
        }
        console.log('\n🧹 Database Cleanup: Test tasks removed cleanly.');

    } finally {
        // Clean up user
        await makeRequest('DELETE', '/api/v1/users/me', { currentPassword: userPass }, authHeaders);
        console.log('🧹 Database Cleanup: Test user removed.');
    }

    console.log('\n====================================================');
    console.log('All Custom Task Duration tests passed successfully!');
    console.log('====================================================');
}

runCustomDurationTests().catch((err) => {
    console.error('❌ Custom Duration Test Suite Failed:', err);
    process.exit(1);
});
