'use strict';

/**
 * backend/src/middleware/errorHandler.js
 *
 * Centralized Express error handler returning standard JSON error envelope.
 */

const crypto = require('crypto');
const { AppError } = require('../shared/errors/AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const requestId = req.headers['x-request-id'] || `req_${crypto.randomBytes(6).toString('hex')}`;
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Handled Operational Application Errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details && err.details.length > 0 ? err.details : undefined,
                requestId,
            },
        });
    }

    // 2. Prisma Known Errors
    if (err.code === 'P2002') {
        const fields = err.meta?.target || [];
        const isTimerConstraint =
            (Array.isArray(fields) && fields.includes('userId') && fields.includes('status')) ||
            String(fields).includes('unique_active_timer_per_user') ||
            (err.message && err.message.includes('unique_active_timer_per_user'));

        if (isTimerConstraint) {
            return res.status(409).json({
                error: {
                    code: 'ACTIVE_SESSION_EXISTS',
                    message: 'An active focus session already exists for this user',
                    requestId,
                },
            });
        }

        return res.status(409).json({
            error: {
                code: 'CONFLICT',
                message: `Unique constraint violation on field(s): ${Array.isArray(fields) ? fields.join(', ') : fields}`,
                requestId,
            },
        });
    }

    // 3. Unhandled Internal Errors (Never expose secrets or DB internals to client)
    console.error(`[Unhandled Error][${requestId}]`, err);

    return res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: isProduction ? 'An unexpected internal error occurred' : (err.message || 'Internal Server Error'),
            requestId,
        },
    });
}

module.exports = { errorHandler };
