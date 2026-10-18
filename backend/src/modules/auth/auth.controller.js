'use strict';

/**
 * backend/src/modules/auth/auth.controller.js
 *
 * HTTP request handlers for authentication and session management.
 */

const authService = require('./auth.service');
const {
    createSessionToken,
    generateCsrfToken,
    setSessionCookies,
    clearSessionCookies,
    getCsrfCookieOptions,
} = require('../../shared/utils/session');

/**
 * GET /api/v1/auth/csrf-token
 * Generates and sets readable XSRF-TOKEN cookie and returns token for SPA bootstrap.
 */
function getCsrfToken(req, res) {
    const csrfToken = generateCsrfToken();
    res.cookie('XSRF-TOKEN', csrfToken, getCsrfCookieOptions());

    res.status(200).json({
        data: {
            csrfToken,
        },
        meta: {
            timestamp: new Date().toISOString(),
        },
    });
}

/**
 * POST /api/v1/auth/register
 * Registers user, provisions default preferences, sets session cookies, and returns 201 Created.
 */
async function register(req, res, next) {
    try {
        const user = await authService.registerUser(req.body);
        const sessionToken = createSessionToken(user);

        // Preserve existing CSRF token if client already has one, or generate a new one
        const clientCsrfToken = req.cookies ? req.cookies['XSRF-TOKEN'] : undefined;
        setSessionCookies(res, sessionToken, clientCsrfToken);

        res.status(201).json({
            data: {
                user,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/v1/auth/login
 * Validates credentials, sets session cookies, and returns user profile.
 */
async function login(req, res, next) {
    try {
        const user = await authService.loginUser(req.body);
        const sessionToken = createSessionToken(user);

        const clientCsrfToken = req.cookies ? req.cookies['XSRF-TOKEN'] : undefined;
        setSessionCookies(res, sessionToken, clientCsrfToken);

        res.status(200).json({
            data: {
                user,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/v1/auth/logout
 * Clears session cookies on the client.
 */
function logout(req, res) {
    clearSessionCookies(res);
    res.status(200).json({
        data: {
            message: 'Logged out successfully',
        },
        meta: {
            timestamp: new Date().toISOString(),
        },
    });
}

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user's profile and preferences.
 */
async function getMe(req, res, next) {
    try {
        const user = await authService.getUserProfile(req.user.id);
        res.status(200).json({
            data: {
                user,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getCsrfToken,
    register,
    login,
    logout,
    getMe,
};
