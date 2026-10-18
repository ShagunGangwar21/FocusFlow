'use strict';

/**
 * backend/src/middleware/csrfProtection.js
 *
 * Double-submit CSRF cookie protection middleware.
 * Compares the client-submitted `X-CSRF-Token` header against the `XSRF-TOKEN` cookie.
 */

const crypto = require('crypto');
const { ForbiddenError } = require('../shared/errors/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Middleware that verifies CSRF double-submit token on state-changing requests.
 */
function csrfProtection(req, res, next) {
    // Safe idempotent methods do not mutate state
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    const headerToken = req.get('x-csrf-token');
    const cookieToken = req.cookies ? req.cookies['XSRF-TOKEN'] : undefined;

    if (!headerToken || !cookieToken) {
        return next(new ForbiddenError('Invalid or missing CSRF token'));
    }

    // Timing-safe comparison to prevent side-channel timing attacks
    const headerBuffer = Buffer.from(headerToken, 'utf8');
    const cookieBuffer = Buffer.from(cookieToken, 'utf8');

    if (headerBuffer.length !== cookieBuffer.length || !crypto.timingSafeEqual(headerBuffer, cookieBuffer)) {
        return next(new ForbiddenError('Invalid or missing CSRF token'));
    }

    next();
}

module.exports = { csrfProtection };
