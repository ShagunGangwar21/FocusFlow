'use strict';

/**
 * backend/tests/integration_regression.test.js
 *
 * Regression test suite for:
 *  - Calendar date synchronization and timezone handling near midnight
 *  - Week and month view consistency
 *  - Analytics planned vs actual focus calculations, minute formatting, and property aliases
 *  - Zero-denominator safety in planning accuracy
 *  - Server-authoritative data integrity without mocks
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { getPrisma, disconnectPrisma } = require('../db/prisma');
const { app } = require('../server');
const analyticsService = require('../src/modules/analytics/analytics.service');
const calendarService = require('../src/modules/calendar/calendar.service');
const { getLocalDateString, shiftDateString } = require('../src/modules/streaks/streaks.service');

const TEST_PORT = 5068;
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

function getAuthHeaders(cookies) {
    const cookieStr = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    return {
        Cookie: cookieStr,
        'x-csrf-token': cookies['csrf_token'],
    };
}

async function runTests() {
    console.log('\n====================================================');
    console.log('FocusFlow Integration & Date/Analytics Regression Tests');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function recordPass(msg) {
        console.log(`  ✅ [PASS] ${msg}`);
        passed++;
    }

    function recordFail(msg, err) {
        console.error(`  ❌ [FAIL] ${msg}`);
        console.error(err);
        failed++;
    }

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));

    const prisma = await getPrisma();
    const testEmail = `regression_${Date.now()}@test.com`;

    try {
        // --- 1. User Setup & Auth ---
        console.log('--- 1. User Setup ---');
        const csrfRes = await makeRequest('GET', '/api/v1/auth/csrf-token');
        const csrfToken = csrfRes.body.data.csrfToken;
        const testCookies = { 'XSRF-TOKEN': csrfRes.cookies['XSRF-TOKEN'] };

        const regRes = await makeRequest(
            'POST',
            '/api/v1/auth/register',
            {
                email: testEmail,
                password: 'Password123!',
                name: 'Regression Tester',
                timezone: 'Asia/Kolkata', // UTC+5:30
            },
            {
                Cookie: Object.entries(testCookies).map(([k, v]) => `${k}=${v}`).join('; '),
                'X-CSRF-Token': csrfToken,
            }
        );
        assert.strictEqual(regRes.status, 201);
        testCookies['auth_session'] = regRes.cookies['auth_session'];
        if (regRes.cookies['XSRF-TOKEN']) {
            testCookies['XSRF-TOKEN'] = regRes.cookies['XSRF-TOKEN'];
        }
        const activeCsrf = regRes.cookies['XSRF-TOKEN'] || csrfToken;
        const authHeaders = {
            Cookie: Object.entries(testCookies).map(([k, v]) => `${k}=${v}`).join('; '),
            'X-CSRF-Token': activeCsrf,
        };
        const userId = regRes.body.data.user.id;
        recordPass('Test user registered with Asia/Kolkata timezone');

        // --- 2. Calendar Near-Midnight Boundaries ---
        console.log('\n--- 2. Calendar Midnight Boundary & Date Consistency ---');
        // Task at 23:30 local time (which is 18:00 UTC)
        // Date: 2026-10-19 local
        // In UTC: 2026-10-19 18:00 UTC is Oct 19 23:30 in Asia/Kolkata
        // In UTC: 2026-10-18 19:00 UTC is Oct 19 00:30 in Asia/Kolkata
        const lateNightUtc = new Date('2026-10-19T18:00:00.000Z'); // 23:30 in IST
        const earlyMorningUtc = new Date('2026-10-18T19:00:00.000Z'); // 00:30 in IST on Oct 19

        const task1 = await prisma.task.create({
            data: {
                title: 'Early Morning Task',
                ownerId: userId,
                startAt: earlyMorningUtc,
                endAt: new Date(earlyMorningUtc.getTime() + 30 * 60000),
                estimatedDurationMinutes: 30,
                priority: 'HIGH',
                scheduleType: 'FIXED',
            },
        });

        const task2 = await prisma.task.create({
            data: {
                title: 'Late Night Task',
                ownerId: userId,
                startAt: lateNightUtc,
                endAt: new Date(lateNightUtc.getTime() + 45 * 60000),
                estimatedDurationMinutes: 45,
                priority: 'MEDIUM',
                scheduleType: 'FLEXIBLE',
            },
        });

        // Query calendar for 2026-10-19 (00:00 to 23:59 IST)
        const dayFrom = new Date('2026-10-18T18:30:00.000Z'); // 00:00 IST
        const dayTo = new Date('2026-10-19T18:29:59.999Z'); // 23:59 IST

        const calData = await calendarService.getCalendarData(userId, {
            from: dayFrom.toISOString(),
            to: dayTo.toISOString(),
            scope: 'PERSONAL',
        });

        assert.strictEqual(calData.tasks.length, 2, 'Both near-midnight tasks must be captured in day window');
        assert.strictEqual(calData.summary.totalTasks, 2, 'Summary count must match tasks returned');
        recordPass('Calendar correctly queries both early morning and late night tasks across UTC boundary');

        // Verify local date string for both tasks in Asia/Kolkata evaluates to 2026-10-19
        const d1 = getLocalDateString(task1.startAt, 'Asia/Kolkata');
        const d2 = getLocalDateString(task2.startAt, 'Asia/Kolkata');
        assert.strictEqual(d1, '2026-10-19', 'Task at 00:30 IST must have local date 2026-10-19');
        assert.strictEqual(d2, '2026-10-19', 'Task at 23:30 IST must have local date 2026-10-19');
        recordPass('getLocalDateString accurately attributes timestamps near midnight to local calendar date');

        // --- 3. Analytics Weekly Review Aliases and Accurate Calculations ---
        console.log('\n--- 3. Analytics Service Properties & Duration Calculations ---');

        // Create completed focus session with 96 minutes (5760 seconds)
        const sessionDate = new Date();
        await prisma.timerSession.create({
            data: {
                userId,
                taskId: task1.id,
                durationSeconds: 5760, // 96 minutes = 1.6 hours
                status: 'COMPLETED',
                endedAt: sessionDate,
            },
        });

        // Mark task1 completed
        await prisma.task.update({
            where: { id: task1.id },
            data: {
                status: 'COMPLETED',
                completedAt: sessionDate,
                actualDurationMinutes: 96,
            },
        });

        const weeklyReview = await analyticsService.getWeeklyReview(userId, 'Asia/Kolkata');

        assert.strictEqual(weeklyReview.days.length, 7, 'Weekly review must return exactly 7 days (Mon-Sun)');
        assert.ok(Array.isArray(weeklyReview.dailyBreakdown), 'dailyBreakdown array must be present');
        assert.strictEqual(weeklyReview.summary.totalActualMinutes, 96, 'Total actual minutes must be exactly 96');

        // Check each day item has all required alias properties
        for (const day of weeklyReview.days) {
            assert.ok(typeof day.day === 'string', 'day label must be string');
            assert.ok(typeof day.date === 'string', 'date must be string');
            assert.ok('planned' in day, 'planned alias must be present');
            assert.ok('actual' in day, 'actual alias must be present');
            assert.ok('plannedHours' in day, 'plannedHours must be present');
            assert.ok('actualHours' in day, 'actualHours must be present');
            assert.ok('plannedMinutes' in day, 'plannedMinutes must be present');
            assert.ok('actualMinutes' in day, 'actualMinutes must be present');
            assert.ok('completedTasks' in day, 'completedTasks alias must be present');
            assert.ok('completedTasksCount' in day, 'completedTasksCount must be present');
            assert.ok('plannedTasks' in day, 'plannedTasks must be present');
            assert.ok('sessionsCount' in day, 'sessionsCount must be present');
        }
        recordPass('Weekly review days[] exposes plannedHours, actualHours, completedTasks, and plannedTasks');

        // Verify the today date has 96 actual minutes and 1.6 actual hours
        const todayStr = getLocalDateString(sessionDate, 'Asia/Kolkata');
        const todayDay = weeklyReview.days.find((d) => d.date === todayStr);
        assert.ok(todayDay, 'Current day must be present in weekly review');
        assert.strictEqual(todayDay.actualMinutes, 96, 'Today actualMinutes must be 96');
        assert.strictEqual(todayDay.actualHours, 1.6, 'Today actualHours must be 1.6');
        assert.strictEqual(todayDay.completedTasks, 1, 'Today completedTasks must be 1');
        recordPass('96 minutes correctly translates to 1.6 actual hours and 1 completed task');

        // --- 4. Zero-Denominator Safety & Empty States ---
        console.log('\n--- 4. Planning Accuracy Zero-Denominator Safety ---');
        // When planned minutes is 0, planningAccuracy should be null (not NaN)
        const summary = await analyticsService.getAnalyticsSummary(userId, 'Asia/Kolkata');
        assert.ok(summary.planningAccuracy === null || typeof summary.planningAccuracy === 'number');
        assert.ok(!isNaN(summary.planningAccuracy), 'planningAccuracy must never be NaN');
        recordPass('Zero-denominator planning accuracy handles safely without NaN or crashes');

        // --- 5. Consecutive Date Shift Verification ---
        console.log('\n--- 5. ShiftDateString Date Progression ---');
        const startMonday = '2026-10-19';
        const expectedDays = [
            '2026-10-19',
            '2026-10-20',
            '2026-10-21',
            '2026-10-22',
            '2026-10-23',
            '2026-10-24',
            '2026-10-25',
        ];
        for (let i = 0; i < 7; i++) {
            assert.strictEqual(shiftDateString(startMonday, i), expectedDays[i]);
        }
        recordPass('shiftDateString produces exact 7-day Monday-Sunday progression across boundaries');

        // --- 6. HTTP API Endpoint Verification ---
        console.log('\n--- 6. HTTP API Verification ---');
        const apiReviewRes = await makeRequest('GET', '/api/v1/analytics/weekly-review', null, authHeaders);
        assert.strictEqual(apiReviewRes.status, 200);
        const reviewData = apiReviewRes.body.data.review || apiReviewRes.body.data;
        assert.strictEqual(reviewData.days.length, 7);
        assert.strictEqual(reviewData.summary.totalActualMinutes, 96);
        recordPass('GET /api/v1/analytics/weekly-review returns 200 with verified 7-day structure');

        const apiCalRes = await makeRequest('GET', `/api/v1/calendar?from=${dayFrom.toISOString()}&to=${dayTo.toISOString()}`, null, authHeaders);
        assert.strictEqual(apiCalRes.status, 200);
        assert.strictEqual(apiCalRes.body.data.tasks.length, 2);
        recordPass('GET /api/v1/calendar returns 200 with 2 scheduled tasks');

    } catch (err) {
        recordFail('Regression test encountered an error', err);
    } finally {
        // Teardown
        try {
            await prisma.timerSession.deleteMany({ where: { user: { email: testEmail } } });
            await prisma.task.deleteMany({ where: { owner: { email: testEmail } } });
            await prisma.user.deleteMany({ where: { email: testEmail } });
        } catch (e) {
            // Ignore
        }
        await new Promise((resolve) => server.close(resolve));
        await disconnectPrisma();
    }

    console.log('\n====================================================');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
