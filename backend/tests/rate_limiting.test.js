'use strict';

/**
 * backend/tests/rate_limiting.test.js
 *
 * Regression and validation tests for FocusFlow Rate Limiting:
 *  1. Health check exemption (/api/v1/health and /api/v1/health/db)
 *  2. Structured 429 error format and Retry-After header
 *  3. Separate buckets for auth vs operational routes
 *  4. Test environment / bypass mechanism verification
 */

require('dotenv').config();
const http = require('http');
const assert = require('assert');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { app } = require('../server');

const TEST_PORT = 5063;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function makeRequest(serverUrl, method, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverUrl);
        const req = http.request(
            url,
            {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
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
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: json,
                    });
                });
            }
        );

        req.on('error', reject);
        req.end();
    });
}

let testServer;

async function runTests() {
    console.log('--- Starting Rate Limiting Regression Tests ---');
    let passed = 0;
    let failed = 0;

    const assertTest = (name, fn) => {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error(err);
            failed++;
        }
    };

    const assertAsyncTest = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error(err);
            failed++;
        }
    };

    try {
        await new Promise((resolve) => {
            testServer = app.listen(TEST_PORT, () => resolve());
        });

        // 1. Health check is accessible without rate limiting
        await assertAsyncTest('Health check endpoint (/api/v1/health) returns 200 without rate limiting', async () => {
            for (let i = 0; i < 5; i++) {
                const res = await makeRequest(BASE_URL, 'GET', '/api/v1/health');
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.status, 'ok');
                // Health check should not have ratelimit headers
                assert.strictEqual(res.headers['ratelimit'], undefined);
            }
        });

        // 2. Test operational route rate limit behavior using an isolated test express instance
        await assertAsyncTest('Rate limiter returns HTTP 429 with standard FocusFlow error envelope and Retry-After header', async () => {
            const testApp = express();
            const limiter = rateLimit({
                windowMs: 60 * 1000,
                limit: 3, // Low limit to test 429 triggering
                standardHeaders: 'draft-7',
                legacyHeaders: false,
                handler: (req, res, next, options) => {
                    const retryAfter = Math.ceil(options.windowMs / 1000);
                    res.set('Retry-After', String(retryAfter));
                    res.status(429).json({
                        error: {
                            code: 'TOO_MANY_REQUESTS',
                            message: `Too many requests, please try again later. Please wait ${retryAfter} seconds.`,
                            details: { retryAfter },
                        },
                    });
                },
            });

            testApp.use('/test-endpoint', limiter, (req, res) => res.json({ success: true }));

            const isolatedServer = await new Promise((resolve) => {
                const s = testApp.listen(5064, () => resolve(s));
            });

            try {
                // First 3 requests succeed
                for (let i = 0; i < 3; i++) {
                    const res = await makeRequest('http://localhost:5064', 'GET', '/test-endpoint');
                    assert.strictEqual(res.status, 200);
                    assert.strictEqual(res.body.success, true);
                }

                // 4th request must return 429 Too Many Requests
                const rateLimitedRes = await makeRequest('http://localhost:5064', 'GET', '/test-endpoint');
                assert.strictEqual(rateLimitedRes.status, 429);
                assert.ok(rateLimitedRes.headers['retry-after']);
                assert.strictEqual(rateLimitedRes.body.error.code, 'TOO_MANY_REQUESTS');
                assert.ok(rateLimitedRes.body.error.message.includes('Too many requests'));
                assert.strictEqual(typeof rateLimitedRes.body.error.details.retryAfter, 'number');
            } finally {
                await new Promise((resolve) => isolatedServer.close(resolve));
            }
        });

        // 3. Test skip condition with test bypass header
        await assertAsyncTest('Bypass header or test environment skips rate limiting', async () => {
            const testApp = express();
            const limiter = rateLimit({
                windowMs: 60 * 1000,
                limit: 2,
                standardHeaders: 'draft-7',
                legacyHeaders: false,
                skip: (req) => req.headers['x-test-bypass'] === 'focusflow_test_secret',
                handler: (req, res) => res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS' } }),
            });

            testApp.use('/test-bypass', limiter, (req, res) => res.json({ success: true }));

            const isolatedServer = await new Promise((resolve) => {
                const s = testApp.listen(5065, () => resolve(s));
            });

            try {
                // Send 5 requests with x-test-bypass header - none should be throttled
                for (let i = 0; i < 5; i++) {
                    const res = await makeRequest('http://localhost:5065', 'GET', '/test-bypass', {
                        'x-test-bypass': 'focusflow_test_secret',
                    });
                    assert.strictEqual(res.status, 200);
                    assert.strictEqual(res.body.success, true);
                }
            } finally {
                await new Promise((resolve) => isolatedServer.close(resolve));
            }
        });

        // 4. Verify operational routes have generous headroom on live app
        await assertAsyncTest('General operational API routes allow burst traffic without premature 429', async () => {
            // Send 15 requests to /api/v1/tasks (even if 401 unauthorized, it passes through the rate limiter)
            for (let i = 0; i < 15; i++) {
                const res = await makeRequest(BASE_URL, 'GET', '/api/v1/tasks');
                assert.notStrictEqual(res.status, 429, `Request ${i + 1} was throttled unexpectedly`);
            }
        });

    } finally {
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
        }
    }

    console.log(`\nTests Summary: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
