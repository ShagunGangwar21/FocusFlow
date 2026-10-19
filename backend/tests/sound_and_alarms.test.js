'use strict';

/**
 * backend/tests/sound_and_alarms.test.js
 *
 * Dedicated tests for FocusFlow Sound & Alarms Preferences:
 * 1. Unauthenticated rejection (401)
 * 2. Zod validation for ringtone enums and volume bounds (400)
 * 3. Persistence of master sound, focus sound, break sound, ringtones, and volume
 * 4. User isolation: User A's sound settings do not affect User B
 * 5. Non-destructive JSON merging: Sound prefs and Notification prefs do not overwrite each other
 */

const assert = require('assert');
const http = require('http');

const API_BASE = 'http://localhost:5000';

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const reqHeaders = { ...headers };
        let bodyPayload = null;

        if (body) {
            bodyPayload = JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(bodyPayload);
        }

        const req = http.request(
            url,
            { method, headers: reqHeaders },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    let parsed = null;
                    if (data) {
                        try {
                            parsed = JSON.parse(data);
                        } catch {
                            parsed = data;
                        }
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
                        body: parsed,
                    });
                });
            }
        );

        req.on('error', reject);
        if (bodyPayload) req.write(bodyPayload);
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

async function registerAndLogin(emailPrefix) {
    const email = `${emailPrefix}_${Date.now()}@example.com`;
    const password = 'TestUser123!';

    // 1. Fetch CSRF token first
    const csrfRes = await makeRequest('GET', '/api/v1/auth/csrf-token');
    const csrfToken = csrfRes.body?.data?.csrfToken;
    const cookies = { ...csrfRes.cookies };

    // 2. Register
    const regRes = await makeRequest(
        'POST',
        '/api/v1/auth/register',
        {
            name: `User ${emailPrefix}`,
            email,
            password,
            timezone: 'America/New_York',
        },
        getAuthHeaders(cookies, csrfToken)
    );
    assert.strictEqual(regRes.status, 201, `Failed to register user ${email}`);

    Object.assign(cookies, regRes.cookies);
    const finalCsrf = regRes.cookies['XSRF-TOKEN'] || csrfToken;

    return {
        userId: regRes.body.data.user.id,
        email,
        password,
        cookies,
        csrfToken: finalCsrf,
        authHeaders: getAuthHeaders(cookies, finalCsrf),
    };
}

async function runTests() {
    console.log('\n====================================================');
    console.log('FocusFlow Sound & Alarm Preferences Tests');
    console.log('====================================================\n');

    let userA, userB;

    try {
        // 1. Setup Users
        userA = await registerAndLogin('sound_test_a');
        userB = await registerAndLogin('sound_test_b');
        console.log('--- 1. Auth Setup Complete ---');
        console.log('  ✅ [PASS] Registered User A and User B');

        // 2. Unauthenticated Check
        const unauthRes = await makeRequest('PATCH', '/api/v1/users/me/preferences', {
            soundPreferences: { volume: 50 },
        });
        assert.strictEqual(unauthRes.status, 401);
        console.log('  ✅ [PASS] Unauthenticated PATCH /api/v1/users/me/preferences rejected with 401');

        // 3. Validation: Invalid ringtone enum
        const invalidRingtoneRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            { soundPreferences: { focusRingtone: 'loud-heavy-metal' } },
            userA.authHeaders
        );
        assert.strictEqual(invalidRingtoneRes.status, 400);
        console.log('  ✅ [PASS] Validation: invalid ringtone enum rejected with 400');

        // 4. Validation: Volume bounds
        const negativeVolRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            { soundPreferences: { volume: -10 } },
            userA.authHeaders
        );
        assert.strictEqual(negativeVolRes.status, 400);
        console.log('  ✅ [PASS] Validation: negative volume rejected with 400');

        const excessVolRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            { soundPreferences: { volume: 101 } },
            userA.authHeaders
        );
        assert.strictEqual(excessVolRes.status, 400);
        console.log('  ✅ [PASS] Validation: volume > 100 rejected with 400');

        // 5. Valid Save for User A
        const saveResA = await makeRequest(
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
            userA.authHeaders
        );
        assert.strictEqual(saveResA.status, 200);
        assert.strictEqual(saveResA.body.data.preferences.soundPreferences.focusRingtone, 'piano-tone');
        assert.strictEqual(saveResA.body.data.preferences.soundPreferences.breakRingtone, 'nature-tone');
        assert.strictEqual(saveResA.body.data.preferences.soundPreferences.breakSoundEnabled, false);
        assert.strictEqual(saveResA.body.data.preferences.soundPreferences.volume, 85);
        console.log('  ✅ [PASS] User A: sound preferences saved and confirmed');

        // 6. User Isolation: User B defaults remain untouched
        const getResB = await makeRequest('GET', '/api/v1/users/me', null, userB.authHeaders);
        assert.strictEqual(getResB.status, 200);
        const spB = getResB.body.data.preferences.soundPreferences;
        assert.strictEqual(spB.focusRingtone, 'gentle-chime', 'User B focus ringtone must remain default gentle-chime');
        assert.strictEqual(spB.breakSoundEnabled, true, 'User B breakSoundEnabled must remain true');
        assert.strictEqual(spB.volume, 70, 'User B volume must remain default 70');
        console.log('  ✅ [PASS] User Isolation: User B unaffected by User A customizations');

        // 7. Non-destructive merging: updating notificationPrefs does not overwrite soundPrefs
        const updateNotifRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            {
                notificationPreferences: {
                    inAppTaskReminders: false,
                    streakReminders: false,
                },
            },
            userA.authHeaders
        );
        assert.strictEqual(updateNotifRes.status, 200);

        // Fetch User A fresh from GET /api/v1/users/me
        const getResA = await makeRequest('GET', '/api/v1/users/me', null, userA.authHeaders);
        assert.strictEqual(getResA.status, 200);
        const spA = getResA.body.data.preferences.soundPreferences;
        const npA = getResA.body.data.preferences.notificationPreferences;

        assert.strictEqual(spA.focusRingtone, 'piano-tone', 'focusRingtone must survive notification updates');
        assert.strictEqual(spA.volume, 85, 'volume must survive notification updates');
        assert.strictEqual(npA.inAppTaskReminders, false, 'notification update must persist');
        console.log('  ✅ [PASS] Non-Destructive Merging: sound & notification settings survive independent updates');

        // 8. Master Mute Toggle behavior
        const muteRes = await makeRequest(
            'PATCH',
            '/api/v1/users/me/preferences',
            { soundPreferences: { soundEnabled: false } },
            userA.authHeaders
        );
        assert.strictEqual(muteRes.status, 200);
        assert.strictEqual(muteRes.body.data.preferences.soundPreferences.soundEnabled, false);
        assert.strictEqual(muteRes.body.data.preferences.soundPreferences.focusRingtone, 'piano-tone', 'Preserves chosen ringtone during master mute');
        console.log('  ✅ [PASS] Master Mute Toggle: successfully updates without wiping selected ringtones');

        console.log('\n====================================================');
        console.log('All Sound & Alarm Preferences tests passed successfully!');
        console.log('====================================================\n');
    } finally {
        // Teardown
        if (userA) {
            await makeRequest('DELETE', '/api/v1/users/me', { password: userA.password }, userA.authHeaders).catch(() => {});
        }
        if (userB) {
            await makeRequest('DELETE', '/api/v1/users/me', { password: userB.password }, userB.authHeaders).catch(() => {});
        }
    }
}

runTests().catch((err) => {
    console.error('Sound & Alarms test failed:', err);
    process.exit(1);
});
