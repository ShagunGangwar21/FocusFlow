'use strict';

/**
 * backend/tests/auth.test.js
 *
 * Automated tests for FocusFlow Authentication (Phase 1):
 *  1. Unit tests: Password hashing and timing-safe verification (Argon2id)
 *  2. Unit tests: Session token creation, verification, and tamper rejection
 *  3. Unit tests: Request validation with Zod schemas
 *  4. Integration tests (HTTP):
 *     - GET /api/v1/auth/csrf-token (Bootstrap endpoint & cookie)
 *     - CSRF protection rejection on missing/mismatched token
 *     - POST /api/v1/auth/register (Validation, success, cookie issuance)
 *     - POST /api/v1/auth/register (Duplicate email conflict handling)
 *     - POST /api/v1/auth/login (Invalid password rejection)
 *     - POST /api/v1/auth/login (Success with correct password)
 *     - GET /api/v1/auth/me (Authenticated profile retrieval & preferences)
 *     - GET /api/v1/auth/me (Unauthorized rejection on missing/invalid cookie)
 *     - POST /api/v1/auth/logout (Cookie clearance)
 *     - Cleanup of test data (Zero database records left behind)
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');

const { hashPassword, verifyPassword } = require('../src/shared/utils/password');
const {
    createSessionToken,
    verifySessionToken,
    generateCsrfToken,
} = require('../src/shared/utils/session');
const { registerSchema, loginSchema } = require('../src/modules/auth/auth.validation');
const { getPrisma, disconnectPrisma } = require('../db/prisma');

const TEST_PORT = 5056;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper: HTTP request wrapper that preserves and handles cookies
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

                    // Extract set-cookie headers
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

async function runTests() {
    console.log('====================================================');
    console.log('FocusFlow Authentication Phase 1 Automated Test Suite');
    console.log('====================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function assertTest(name, fn) {
        totalTests++;
        try {
            fn();
            console.log(`  ✅ [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            throw err;
        }
    }

    async function assertAsyncTest(name, fn) {
        totalTests++;
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 1: UNIT TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. Password Hashing (Argon2id) ---');

    let sampleHash = '';
    await assertAsyncTest('Argon2id hashes password securely', async () => {
        sampleHash = await hashPassword('SuperSecret123');
        assert(typeof sampleHash === 'string', 'Hash should be a string');
        assert(sampleHash.startsWith('$argon2id$'), 'Hash must use the Argon2id variant');
    });

    await assertAsyncTest('Argon2id verifies valid password correctly', async () => {
        const isValid = await verifyPassword('SuperSecret123', sampleHash);
        assert.strictEqual(isValid, true, 'Correct password must verify to true');
    });

    await assertAsyncTest('Argon2id rejects invalid password', async () => {
        const isInvalid = await verifyPassword('WrongPassword999', sampleHash);
        assert.strictEqual(isInvalid, false, 'Incorrect password must verify to false');
    });

    await assertAsyncTest('Argon2id handles empty/null password inputs gracefully', async () => {
        const r1 = await verifyPassword('', sampleHash);
        const r2 = await verifyPassword(null, sampleHash);
        assert.strictEqual(r1, false);
        assert.strictEqual(r2, false);
    });

    console.log('\n--- 2. Session Token & CSRF Utilities ---');

    let validToken = '';
    assertTest('Creates signed JWT with sub and email', () => {
        validToken = createSessionToken({ id: 'user_123', email: 'test@focusflow.local' });
        assert(typeof validToken === 'string' && validToken.split('.').length === 3, 'Must be valid JWT format');
    });

    assertTest('Verifies valid session JWT', () => {
        const payload = verifySessionToken(validToken);
        assert.strictEqual(payload.sub, 'user_123');
        assert.strictEqual(payload.email, 'test@focusflow.local');
    });

    assertTest('Rejects tampered session token', () => {
        const tampered = validToken.slice(0, -5) + 'AAAAA';
        const payload = verifySessionToken(tampered);
        assert.strictEqual(payload, null, 'Tampered token must return null');
    });

    assertTest('Rejects completely invalid token string', () => {
        assert.strictEqual(verifySessionToken('not-a-token'), null);
        assert.strictEqual(verifySessionToken(''), null);
    });

    assertTest('Generates 64-character hex CSRF token (32 bytes)', () => {
        const csrfToken = generateCsrfToken();
        assert.strictEqual(csrfToken.length, 64);
        assert(/^[0-9a-f]{64}$/.test(csrfToken));
    });

    console.log('\n--- 3. Input Validation (Zod Schemas) ---');

    assertTest('registerSchema accepts valid registration payload', () => {
        const res = registerSchema.safeParse({
            name: 'Jane Doe',
            email: 'Jane.Doe@Example.COM',
            password: 'ValidPassword123',
            timezone: 'America/New_York',
        });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.email, 'jane.doe@example.com', 'Email must be lowercased');
    });

    assertTest('registerSchema rejects invalid email', () => {
        const res = registerSchema.safeParse({
            name: 'Jane',
            email: 'not-an-email',
            password: 'ValidPassword123',
        });
        assert.strictEqual(res.success, false);
    });

    assertTest('registerSchema rejects password without letters or numbers', () => {
        const noNumber = registerSchema.safeParse({
            name: 'Jane',
            email: 'jane@example.com',
            password: 'onlylettershere',
        });
        assert.strictEqual(noNumber.success, false);

        const noLetter = registerSchema.safeParse({
            name: 'Jane',
            email: 'jane@example.com',
            password: '123456789012',
        });
        assert.strictEqual(noLetter.success, false);
    });

    assertTest('registerSchema rejects short passwords (< 8 characters)', () => {
        const short = registerSchema.safeParse({
            name: 'Jane',
            email: 'jane@example.com',
            password: 'Pass1',
        });
        assert.strictEqual(short.success, false);
    });

    assertTest('loginSchema validates properly', () => {
        const ok = loginSchema.safeParse({ email: 'user@test.com', password: 'any' });
        assert.strictEqual(ok.success, true);

        const bad = loginSchema.safeParse({ email: 'bad-email', password: '' });
        assert.strictEqual(bad.success, false);
    });

    // ─────────────────────────────────────────────────────────────
    // SECTION 2: HTTP INTEGRATION TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. HTTP API Endpoints Integration ---');

    // Start Express server on isolated test port
    process.env.PORT = String(TEST_PORT);
    const { server } = require('../server');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const testEmail = `test_${Date.now()}@focusflow.test`;
    let csrfToken = '';
    let sessionCookie = '';
    let csrfCookie = '';
    let createdUserId = '';

    try {
        await assertAsyncTest('GET /api/v1/auth/csrf-token issues readable XSRF-TOKEN cookie & payload', async () => {
            const res = await makeRequest('GET', '/api/v1/auth/csrf-token');
            assert.strictEqual(res.status, 200);
            assert(res.body.data && res.body.data.csrfToken, 'Payload must contain csrfToken');
            assert(res.cookies['XSRF-TOKEN'], 'Response must set XSRF-TOKEN cookie');
            csrfToken = res.body.data.csrfToken;
            csrfCookie = res.cookies['XSRF-TOKEN'];
            assert.strictEqual(csrfToken, csrfCookie, 'Payload token and cookie must match');
        });

        await assertAsyncTest('Mutating request rejects when CSRF token is missing (403 Forbidden)', async () => {
            const res = await makeRequest('POST', '/api/v1/auth/register', {
                name: 'Test User',
                email: testEmail,
                password: 'Password123',
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        });

        await assertAsyncTest('Mutating request rejects when CSRF token is mismatched (403 Forbidden)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/register',
                {
                    name: 'Test User',
                    email: testEmail,
                    password: 'Password123',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': 'wrong_csrf_token_value_1234567890123456789012345678901234567890',
                }
            );
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        });

        await assertAsyncTest('POST /api/v1/auth/register rejects invalid payload with 400 VALIDATION_ERROR', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/register',
                {
                    name: 'A', // Too short
                    email: 'invalid-email',
                    password: 'short',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': csrfToken,
                }
            );
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
            assert(Array.isArray(res.body.error.details), 'Must include field-level validation details');
        });

        await assertAsyncTest('POST /api/v1/auth/register registers user and sets session cookies (201)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/register',
                {
                    name: 'Test Developer',
                    email: testEmail,
                    password: 'SecurePassword2026',
                    timezone: 'UTC',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': csrfToken,
                }
            );
            assert.strictEqual(res.status, 201);
            assert(res.body.data && res.body.data.user, 'Must return created user object');
            assert.strictEqual(res.body.data.user.email, testEmail);
            assert.strictEqual(res.body.data.user.passwordHash, undefined, 'passwordHash must NEVER be exposed');
            assert(res.body.data.user.preferences, 'Must include default UserPreference');
            assert.strictEqual(res.body.data.user.preferences.theme, 'DARK');
            assert.strictEqual(res.body.data.user.preferences.defaultWorkspaceMode, 'PERSONAL');

            // Capture session cookie
            assert(res.cookies['auth_session'], 'Response must set auth_session HttpOnly cookie');
            sessionCookie = res.cookies['auth_session'];
            createdUserId = res.body.data.user.id;
        });

        await assertAsyncTest('POST /api/v1/auth/register rejects duplicate email with 409 CONFLICT', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/register',
                {
                    name: 'Duplicate User',
                    email: testEmail,
                    password: 'SecurePassword2026',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': csrfToken,
                }
            );
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.error.code, 'CONFLICT');
        });

        await assertAsyncTest('GET /api/v1/auth/me retrieves profile using session cookie (200 OK)', async () => {
            const res = await makeRequest('GET', '/api/v1/auth/me', null, {
                Cookie: `auth_session=${sessionCookie}`,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.user.id, createdUserId);
            assert.strictEqual(res.body.data.user.email, testEmail);
            assert.strictEqual(res.body.data.user.passwordHash, undefined);
        });

        await assertAsyncTest('GET /api/v1/auth/me rejects request with invalid session cookie (401 Unauthorized)', async () => {
            const res = await makeRequest('GET', '/api/v1/auth/me', null, {
                Cookie: `auth_session=invalid.token.here`,
            });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
        });

        await assertAsyncTest('POST /api/v1/auth/login rejects incorrect password with 401 UNAUTHORIZED', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/login',
                {
                    email: testEmail,
                    password: 'WrongPassword999',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': csrfToken,
                }
            );
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
            assert.strictEqual(res.body.error.message, 'Invalid email or password.');
        });

        await assertAsyncTest('POST /api/v1/auth/login succeeds with correct password (200 OK)', async () => {
            const res = await makeRequest(
                'POST',
                '/api/v1/auth/login',
                {
                    email: testEmail,
                    password: 'SecurePassword2026',
                },
                {
                    Cookie: `XSRF-TOKEN=${csrfCookie}`,
                    'x-csrf-token': csrfToken,
                }
            );
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.user.email, testEmail);
            assert(res.cookies['auth_session'], 'Login must reissue auth_session cookie');
            sessionCookie = res.cookies['auth_session'];
        });

        await assertAsyncTest('POST /api/v1/auth/logout clears session cookies (200 OK)', async () => {
            const res = await makeRequest('POST', '/api/v1/auth/logout', null, {
                Cookie: `auth_session=${sessionCookie}; XSRF-TOKEN=${csrfCookie}`,
                'x-csrf-token': csrfToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.data.message, 'Logged out successfully');

            // Verify cookies cleared
            const rawSetCookies = res.headers['set-cookie'] || [];
            const clearedSession = rawSetCookies.some((c) => c.startsWith('auth_session=;'));
            const clearedCsrf = rawSetCookies.some((c) => c.startsWith('XSRF-TOKEN=;'));
            assert(clearedSession, 'auth_session cookie should be cleared');
            assert(clearedCsrf, 'XSRF-TOKEN cookie should be cleared');
        });
    } finally {
        // ─────────────────────────────────────────────────────────────
        // CLEANUP: Clean up test user and close test server
        // ─────────────────────────────────────────────────────────────
        if (createdUserId) {
            try {
                const prisma = await getPrisma();
                await prisma.user.deleteMany({
                    where: { email: testEmail },
                });
                console.log('\n🧹 Database Cleanup: Test user removed. Zero leftover records.');
            } catch (cleanupErr) {
                console.error('Failed to clean up test user:', cleanupErr);
            }
        }

        await new Promise((resolve) => server.close(resolve));
        await disconnectPrisma();
    }

    console.log('\n====================================================');
    console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
    console.log('====================================================\n');
}

runTests().catch((err) => {
    console.error('Test suite execution failed:', err);
    process.exit(1);
});
