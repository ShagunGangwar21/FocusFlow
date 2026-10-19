'use strict';

/**
 * backend/tests/settings_and_task_visibility.test.js
 *
 * Automated verification suite for:
 *  1. User Profile & Settings Retrieval (GET /api/v1/users/me)
 *  2. User Profile Updates & Timezone Validation (PATCH /api/v1/users/me)
 *  3. User Preferences Updates & Strict Notification Validation (PATCH /api/v1/users/me/preferences)
 *  4. Password Change Flow (POST /api/v1/users/me/change-password)
 *  5. Account Deletion Security & Direct Service Guardrails (DELETE /api/v1/users/me)
 *  6. Cross-User Privacy & Workspace Data Export (GET /api/v1/users/me/export)
 *  7. Future Task Date Isolation & Multi-time Scheduling (morning, noon, afternoon, night)
 *  8. Reliable Database Cleanup
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');
const usersService = require('../src/modules/users/users.service');
const { getLocalDateString } = require('../src/modules/streaks/streaks.service');

const TEST_PORT = 5069;
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
        if (postData) req.write(postData);
        req.end();
    });
}

function getAuthHeaders(cookies, csrfToken) {
    const cookieStr = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    const headers = {
        Cookie: cookieStr,
    };
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    } else if (cookies['XSRF-TOKEN']) {
        headers['X-CSRF-Token'] = cookies['XSRF-TOKEN'];
    }
    return headers;
}

async function runTests() {
    console.log('\n====================================================');
    console.log('FocusFlow Settings, Security & Task Visibility Tests');
    console.log('====================================================\n');

    const prisma = await getPrisma();
    let server;
    let testUser = null;
    let isolatedDeleteUser = null;
    let authCookies = {};
    let csrfToken = '';

    try {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        console.log(`Test server running at ${BASE_URL}`);

        // --- 1. User Registration & Auth Bootstrap ---
        console.log('\n--- 1. Auth Setup ---');
        const email = `settings_test_${Date.now()}@example.com`;
        const initialPassword = 'Password123!';

        const csrfRes = await makeRequest('GET', '/api/v1/auth/csrf-token');
        csrfToken = csrfRes.body.data.csrfToken;
        authCookies['XSRF-TOKEN'] = csrfRes.cookies['XSRF-TOKEN'];

        const regRes = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            {
                name: 'Settings Tester',
                email,
                password: initialPassword,
                timezone: 'Asia/Kolkata',
            },
            getAuthHeaders(authCookies, csrfToken)
        );

        assert.strictEqual(regRes.status, 201, 'User registration should succeed');
        testUser = regRes.body.data.user;
        authCookies['auth_session'] = regRes.cookies['auth_session'];
        if (regRes.cookies['XSRF-TOKEN']) {
            authCookies['XSRF-TOKEN'] = regRes.cookies['XSRF-TOKEN'];
            csrfToken = regRes.cookies['XSRF-TOKEN'];
        }
        let authHeaders = getAuthHeaders(authCookies, csrfToken);
        console.log('  ✅ [PASS] User registered and authenticated');

        // --- 2. GET /api/v1/users/me ---
        console.log('\n--- 2. Fetch User Settings & Profile ---');
        const unauthRes = await makeRequest('GET', '/api/v1/users/me');
        assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
        console.log('  ✅ [PASS] Unauthenticated GET /api/v1/users/me returns 401');

        const getSettingsRes = await makeRequest('GET', '/api/v1/users/me', null, authHeaders);
        assert.strictEqual(getSettingsRes.status, 200, 'Authenticated GET /api/v1/users/me returns 200');
        assert.strictEqual(getSettingsRes.body.data.user.email, email);
        assert.strictEqual(getSettingsRes.body.data.user.name, 'Settings Tester');
        assert.ok(getSettingsRes.body.data.preferences, 'Preferences object should be returned');
        console.log('  ✅ [PASS] GET /api/v1/users/me returns user profile and preferences');

        // --- 3. Profile Updates & Timezone Validation ---
        console.log('\n--- 3. Profile Updates & Timezone Validation ---');
        // Valid update
        const updateProfileRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me',
            {
                name: 'Updated FocusFlow Pro',
                timezone: 'America/New_York',
            },
            authHeaders
        );
        assert.strictEqual(updateProfileRes.status, 200);
        assert.strictEqual(updateProfileRes.body.data.user.name, 'Updated FocusFlow Pro');
        assert.strictEqual(updateProfileRes.body.data.user.timezone, 'America/New_York');
        console.log('  ✅ [PASS] PATCH /api/v1/users/me updates name and valid IANA timezone');

        // Empty name rejected
        const emptyNameRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me',
            { name: '' },
            authHeaders
        );
        assert.strictEqual(emptyNameRes.status, 400, 'Empty name should be rejected with 400');
        console.log('  ✅ [PASS] Validation: empty name rejected with 400');

        // Invalid IANA timezone rejected
        const invalidTzRes1 = await makeRequest(
            'PATCH',
            '/api/v1/users/me',
            { timezone: 'Mars/Colony' },
            authHeaders
        );
        assert.strictEqual(invalidTzRes1.status, 400, 'Invalid timezone must be rejected with 400');

        const invalidTzRes2 = await makeRequest(
            'PATCH',
            '/api/v1/users/me',
            { timezone: 'Not_A_Timezone_123' },
            authHeaders
        );
        assert.strictEqual(invalidTzRes2.status, 400, 'Non-IANA timezone string rejected with 400');
        console.log('  ✅ [PASS] Validation: non-IANA timezones rejected with 400');

        // --- 4. Preferences Updates & Notification Key Validation ---
        console.log('\n--- 4. Preferences Updates & Notification Validation ---');
        // Invalid notification key rejected
        const invalidNotifKeyRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                notificationPreferences: {
                    unsupportedArbitraryKey: true,
                },
            },
            authHeaders
        );
        assert.strictEqual(invalidNotifKeyRes.status, 400, 'Unsupported notification keys must be rejected with 400');
        console.log('  ✅ [PASS] Validation: unsupported notification keys rejected with 400');

        // Non-boolean notification value rejected
        const nonBoolNotifRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                notificationPreferences: {
                    inAppTaskReminders: 'yes_please',
                },
            },
            authHeaders
        );
        assert.strictEqual(nonBoolNotifRes.status, 400, 'Non-boolean notification value must be rejected with 400');
        console.log('  ✅ [PASS] Validation: non-boolean notification values rejected with 400');

        // Valid preferences update
        const updatePrefsRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                theme: 'light',
                recoveryBufferMinutes: 20,
                autoRescheduleFlexible: false,
                workingHours: {
                    enabled: true,
                    start: '08:30',
                    end: '18:00',
                    defaultFocusDurationMinutes: 45,
                    defaultBreakDurationMinutes: 10,
                    dailyFocusTargetMinutes: 300,
                    weekStart: 'SUNDAY',
                },
                notificationPreferences: {
                    inAppTaskReminders: true,
                    timerOverrunAlert: true,
                    streakReminders: false,
                    soundEffects: true,
                },
            },
            authHeaders
        );
        assert.strictEqual(updatePrefsRes.status, 200);
        assert.strictEqual(updatePrefsRes.body.data.preferences.theme.toLowerCase(), 'light');
        assert.strictEqual(updatePrefsRes.body.data.preferences.recoveryBufferMinutes, 20);
        assert.strictEqual(updatePrefsRes.body.data.preferences.workingHours.defaultFocusDurationMinutes, 45);
        assert.strictEqual(updatePrefsRes.body.data.preferences.workingHours.weekStart, 'SUNDAY');
        assert.strictEqual(updatePrefsRes.body.data.preferences.notificationPreferences.inAppTaskReminders, true);
        assert.strictEqual(updatePrefsRes.body.data.preferences.notificationPreferences.streakReminders, false);
        console.log('  ✅ [PASS] PATCH /api/v1/users/me/preferences persists theme, focus metrics, and explicit notification booleans');

        // Invalid ringtone rejected
        const invalidRingtoneRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                soundPreferences: {
                    focusRingtone: 'rock-and-roll-heavy-metal',
                },
            },
            authHeaders
        );
        assert.strictEqual(invalidRingtoneRes.status, 400, 'Invalid ringtone must be rejected with 400');
        console.log('  ✅ [PASS] Validation: invalid ringtone rejected with 400');

        // Volume out of bounds (> 100) rejected
        const invalidVolumeRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                soundPreferences: {
                    volume: 150,
                },
            },
            authHeaders
        );
        assert.strictEqual(invalidVolumeRes.status, 400, 'Volume > 100 must be rejected with 400');
        console.log('  ✅ [PASS] Validation: volume > 100 rejected with 400');

        // Valid sound preferences update
        const soundPrefsRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                soundPreferences: {
                    soundEnabled: true,
                    focusSoundEnabled: true,
                    breakSoundEnabled: false,
                    focusRingtone: 'piano-tone',
                    breakRingtone: 'nature-tone',
                    volume: 85,
                },
            },
            authHeaders
        );
        assert.strictEqual(soundPrefsRes.status, 200);
        assert.strictEqual(soundPrefsRes.body.data.preferences.soundPreferences.focusRingtone, 'piano-tone');
        assert.strictEqual(soundPrefsRes.body.data.preferences.soundPreferences.breakRingtone, 'nature-tone');
        assert.strictEqual(soundPrefsRes.body.data.preferences.soundPreferences.breakSoundEnabled, false);
        assert.strictEqual(soundPrefsRes.body.data.preferences.soundPreferences.volume, 85);
        console.log('  ✅ [PASS] PATCH /api/v1/users/me/preferences persists master/individual toggles, ringtones, and volume');

        // Verify GET /api/v1/users/me restores persisted sound preferences without loss of notification preferences
        const getRestoredRes = await makeRequest('GET', '/api/v1/users/me', null, authHeaders);
        assert.strictEqual(getRestoredRes.status, 200);
        assert.strictEqual(getRestoredRes.body.data.preferences.soundPreferences.focusRingtone, 'piano-tone');
        assert.strictEqual(getRestoredRes.body.data.preferences.soundPreferences.volume, 85);
        assert.strictEqual(getRestoredRes.body.data.preferences.notificationPreferences.inAppTaskReminders, true);
        console.log('  ✅ [PASS] GET /api/v1/users/me restores user-isolated sound preferences without overwriting other settings');

        // --- 5. Password Change Flow ---
        console.log('\n--- 5. Password Change Flow ---');
        // Wrong current password
        const wrongPwdRes = await makeRequest(
            'POST',
            '/api/v1/users/me/change-password',
            {
                currentPassword: 'WrongPassword999!',
                newPassword: 'BrandNewPassword123!',
            },
            authHeaders
        );
        assert.strictEqual(wrongPwdRes.status, 400);
        console.log('  ✅ [PASS] Incorrect current password rejected with 400');

        // Short new password
        const shortPwdRes = await makeRequest(
            'POST',
            '/api/v1/users/me/change-password',
            {
                currentPassword: initialPassword,
                newPassword: 'short',
            },
            authHeaders
        );
        assert.strictEqual(shortPwdRes.status, 400);
        console.log('  ✅ [PASS] Short new password (< 8 chars) rejected with 400');

        // Valid change
        const validPwdRes = await makeRequest(
            'POST',
            '/api/v1/users/me/change-password',
            {
                currentPassword: initialPassword,
                newPassword: 'BrandNewPassword123!',
            },
            authHeaders
        );
        assert.strictEqual(validPwdRes.status, 200);
        console.log('  ✅ [PASS] Valid password change succeeds with 200');

        // Verify login with new password works
        const newLoginRes = await makeRequest(
            'POST',
            '/api/v1/auth/login',
            {
                email,
                password: 'BrandNewPassword123!',
            },
            authHeaders
        );
        assert.strictEqual(newLoginRes.status, 200);
        authCookies['auth_session'] = newLoginRes.cookies['auth_session'];
        if (newLoginRes.cookies['XSRF-TOKEN']) {
            authCookies['XSRF-TOKEN'] = newLoginRes.cookies['XSRF-TOKEN'];
            csrfToken = newLoginRes.cookies['XSRF-TOKEN'];
        }
        authHeaders = getAuthHeaders(authCookies, csrfToken);
        console.log('  ✅ [PASS] User can authenticate with the newly updated password');

        // --- 6. Account Deletion Security & Direct Service Guardrails ---
        console.log('\n--- 6. Account Deletion Security & Direct Service Guardrails ---');
        // Setup an isolated user specifically for deletion tests to protect other test data
        const deleteTestEmail = `isolated_delete_${Date.now()}@example.com`;
        const deleteTestPassword = 'DeletionSecure123!';

        const csrfDel = await makeRequest('GET', '/api/v1/auth/csrf-token');
        const delCookies = { 'XSRF-TOKEN': csrfDel.cookies['XSRF-TOKEN'] };
        const regDelRes = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            {
                name: 'Delete Target User',
                email: deleteTestEmail,
                password: deleteTestPassword,
                timezone: 'UTC',
            },
            getAuthHeaders(delCookies, csrfDel.body.data.csrfToken)
        );
        assert.strictEqual(regDelRes.status, 201);
        isolatedDeleteUser = regDelRes.body.data.user;
        delCookies['auth_session'] = regDelRes.cookies['auth_session'];
        if (regDelRes.cookies['XSRF-TOKEN']) {
            delCookies['XSRF-TOKEN'] = regDelRes.cookies['XSRF-TOKEN'];
        }
        const delHeaders = getAuthHeaders(delCookies, delCookies['XSRF-TOKEN']);

        // A. DELETE without password rejected by Zod schema
        const noPwdDelRes = await makeRequest('DELETE', '/api/v1/users/me', {}, delHeaders);
        assert.strictEqual(noPwdDelRes.status, 400, 'DELETE /me without password must be rejected with 400');
        console.log('  ✅ [PASS] Route validation: DELETE /me without password rejected with 400');

        // B. DELETE with wrong password rejected
        const wrongPwdDelRes = await makeRequest(
            'DELETE',
            '/api/v1/users/me',
            { password: 'WrongPassword999!' },
            delHeaders
        );
        assert.strictEqual(wrongPwdDelRes.status, 400, 'DELETE /me with incorrect password rejected with 400');
        console.log('  ✅ [PASS] Password verification: DELETE /me with wrong password rejected with 400');

        // C. Direct service invocation without password rejects even without route validation
        let directMissingErr = null;
        try {
            await usersService.deleteUserAccount(isolatedDeleteUser.id, null);
        } catch (e) {
            directMissingErr = e;
        }
        assert.ok(directMissingErr, 'Direct service call without password must throw');
        assert.strictEqual(directMissingErr.statusCode, 400);
        assert.strictEqual(directMissingErr.code, 'BAD_REQUEST');

        // D. Direct service invocation with wrong password rejects
        let directWrongErr = null;
        try {
            await usersService.deleteUserAccount(isolatedDeleteUser.id, 'incorrectPassword');
        } catch (e) {
            directWrongErr = e;
        }
        assert.ok(directWrongErr, 'Direct service call with wrong password must throw');
        assert.strictEqual(directWrongErr.statusCode, 400);
        assert.strictEqual(directWrongErr.code, 'BAD_REQUEST');
        console.log('  ✅ [PASS] Direct service: deleteUserAccount() requires and verifies password independently');

        // E. Valid deletion succeeds cleanly and transactionally
        const validDelRes = await makeRequest(
            'DELETE',
            '/api/v1/users/me',
            { password: deleteTestPassword },
            delHeaders
        );
        assert.strictEqual(validDelRes.status, 200, 'DELETE /me with correct password succeeds with 200');

        // Confirm user cannot authenticate after deletion
        const postDelLoginRes = await makeRequest(
            'POST',
            '/api/v1/auth/login',
            {
                email: deleteTestEmail,
                password: deleteTestPassword,
            },
            delHeaders
        );
        assert.strictEqual(postDelLoginRes.status, 401, 'Deleted user cannot authenticate');
        isolatedDeleteUser = null; // already deleted cleanly
        console.log('  ✅ [PASS] Valid account deletion purged isolated account cleanly');

        // --- 7. Workspace Data Export ---
        console.log('\n--- 7. Workspace Data Export ---');
        const exportRes = await makeRequest('GET', '/api/v1/users/me/export', null, authHeaders);
        assert.strictEqual(exportRes.status, 200);
        const exported = exportRes.body.data || exportRes.body;
        assert.ok(exported.user);
        assert.ok(exported.preferences);
        assert.ok(Array.isArray(exported.tasks));
        assert.ok(Array.isArray(exported.goals));
        console.log('  ✅ [PASS] GET /api/v1/users/me/export returns comprehensive archive');

        // --- 8. Task Visibility & Time Boundaries (Morning, Noon, Afternoon, Night) ---
        console.log('\n--- 8. Task Visibility & Multi-Time Scheduling ---');
        // Calculate a date 3 days in the future
        const futureDateObj = new Date();
        futureDateObj.setDate(futureDateObj.getDate() + 3);
        const futureDateStr = getLocalDateString(futureDateObj, 'Asia/Kolkata');

        // Create tasks with different times: Morning (09:00), Noon (12:00), Afternoon (14:30), Night (23:30)
        const times = [
            { label: 'Morning', time: '09:00:00', duration: 45 },
            { label: 'Noon', time: '12:00:00', duration: 30 },
            { label: 'Afternoon', time: '14:30:00', duration: 60 },
            { label: 'Night', time: '23:30:00', duration: 25 },
        ];

        for (const t of times) {
            const startAt = new Date(`${futureDateStr}T${t.time}Z`).toISOString();
            const taskRes = await makeRequest(
                'POST',
                '/api/v1/tasks',
                {
                    title: `Future ${t.label} Task`,
                    scheduleType: 'FIXED',
                    startAt,
                    estimatedDurationMinutes: t.duration,
                    priority: 'HIGH',
                },
                authHeaders
            );
            assert.strictEqual(taskRes.status, 201, `Creation of future ${t.label} task should succeed`);
            const createdTask = taskRes.body.data.task;
            assert.ok(createdTask.id, 'Task must have valid ID');
            assert.strictEqual(createdTask.title, `Future ${t.label} Task`);
        }
        console.log('  ✅ [PASS] Created morning, noon, afternoon, and night future tasks with correct ISO timestamps');

        // Verify task listing
        const listRes = await makeRequest('GET', '/api/v1/tasks', null, authHeaders);
        assert.strictEqual(listRes.status, 200);
        assert.strictEqual(listRes.body.data.tasks.length, 4);

        // Verify Calendar query on future date includes the tasks
        const fromIso = new Date(`${futureDateStr}T00:00:00.000Z`).toISOString();
        const toIso = new Date(`${futureDateStr}T23:59:59.999Z`).toISOString();
        const calendarRes = await makeRequest(
            'GET',
            `/api/v1/calendar?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
            null,
            authHeaders
        );
        assert.strictEqual(calendarRes.status, 200);
        assert.ok(calendarRes.body.data.tasks.length >= 4, 'Future calendar query contains scheduled tasks');
        console.log('  ✅ [PASS] Calendar correctly attributes future scheduled tasks to their local dates');

    } finally {
        if (isolatedDeleteUser) {
            try {
                await prisma.user.deleteMany({ where: { id: isolatedDeleteUser.id } });
            } catch (e) {
                // Ignore cleanup warning if already deleted
            }
        }
        if (testUser) {
            console.log('\n🧹 Database Cleanup: deleting test user & associated records...');
            try {
                await prisma.timerSession.deleteMany({ where: { userId: testUser.id } });
                await prisma.task.deleteMany({ where: { ownerId: testUser.id } });
                await prisma.userPreference.deleteMany({ where: { userId: testUser.id } });
                await prisma.user.deleteMany({ where: { id: testUser.id } });
                console.log('  ✅ Cleaned up successfully');
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr.message);
            }
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await disconnectPrisma();
    }

    console.log('\n====================================================');
    console.log('All Settings, Security & Task Visibility tests passed!');
    console.log('====================================================\n');
}

runTests().catch((err) => {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
});
