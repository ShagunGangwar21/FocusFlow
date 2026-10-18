'use strict';

/**
 * backend/src/shared/utils/session.js
 *
 * Session token signing, verification, and cookie configuration.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'focusflow-development-secret-key-change-in-production-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Generates an HMAC-SHA256 signed session JWT.
 * @param {{ id: string, email: string }} user
 * @returns {string} Signed JWT
 */
function createSessionToken(user) {
    if (!user || !user.id || !user.email) {
        throw new Error('Valid user id and email are required to generate a session token');
    }
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
        },
        JWT_SECRET,
        {
            expiresIn: JWT_EXPIRES_IN,
            algorithm: 'HS256',
        }
    );
}

/**
 * Verifies and decodes a session JWT.
 * @param {string} token - JWT session token
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
function verifySessionToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }
    try {
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
        return null;
    }
}

/**
 * Generates a cryptographically random CSRF token (32-byte hex).
 * @returns {string}
 */
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Cookie options for the HttpOnly session cookie.
 */
function getSessionCookieOptions() {
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_MS,
    };
}

/**
 * Cookie options for the client-readable CSRF double-submit cookie.
 */
function getCsrfCookieOptions() {
    return {
        httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_MS,
    };
}

/**
 * Attaches both auth_session and XSRF-TOKEN cookies to the response.
 * @param {import('express').Response} res
 * @param {string} sessionToken
 * @param {string} [csrfToken]
 */
function setSessionCookies(res, sessionToken, csrfToken) {
    const token = csrfToken || generateCsrfToken();
    res.cookie('auth_session', sessionToken, getSessionCookieOptions());
    res.cookie('XSRF-TOKEN', token, getCsrfCookieOptions());
    return token;
}

/**
 * Clears both auth_session and XSRF-TOKEN cookies.
 * @param {import('express').Response} res
 */
function clearSessionCookies(res) {
    res.clearCookie('auth_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.clearCookie('XSRF-TOKEN', { path: '/', httpOnly: false, sameSite: 'lax', secure: isProduction });
}

module.exports = {
    createSessionToken,
    verifySessionToken,
    generateCsrfToken,
    getSessionCookieOptions,
    getCsrfCookieOptions,
    setSessionCookies,
    clearSessionCookies,
};
