'use strict';

/**
 * backend/src/middleware/authenticate.js
 *
 * Session authentication middleware.
 * Verifies the HttpOnly `auth_session` cookie and populates `req.user`.
 */

const { verifySessionToken } = require('../shared/utils/session');
const { UnauthorizedError } = require('../shared/errors/AppError');
const { getPrisma } = require('../../db/prisma');

async function authenticate(req, res, next) {
    try {
        const sessionToken = req.cookies ? req.cookies['auth_session'] : undefined;

        if (!sessionToken) {
            return next(new UnauthorizedError('Authentication required. Missing session cookie.'));
        }

        const payload = verifySessionToken(sessionToken);
        if (!payload || !payload.sub) {
            return next(new UnauthorizedError('Invalid or expired session token.'));
        }

        const prisma = await getPrisma();
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                name: true,
                timezone: true,
            },
        });

        if (!user) {
            return next(new UnauthorizedError('User account associated with this session no longer exists.'));
        }

        // Attach sanitized user to request object
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { authenticate };
