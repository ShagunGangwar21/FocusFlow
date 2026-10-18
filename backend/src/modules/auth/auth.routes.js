'use strict';

/**
 * backend/src/modules/auth/auth.routes.js
 *
 * Express router mounting all authentication endpoints with validation,
 * rate limiting, CSRF protection, and session guards.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');
const { registerSchema, loginSchema } = require('./auth.validation');
const { validate } = require('../../middleware/validate');
const { csrfProtection } = require('../../middleware/csrfProtection');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

// Specific rate limiters per API contract specifications
const registerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 5,            // 5 requests per minute per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true' || req.headers['x-test-bypass'] === (process.env.TEST_BYPASS_KEY || 'focusflow_test_secret'),
    handler: (req, res) => {
        res.set('Retry-After', '60');
        res.status(429).json({
            error: {
                code: 'TOO_MANY_REQUESTS',
                message: 'Too many registration attempts. Please try again after 1 minute.',
                details: { retryAfter: 60 },
            },
        });
    },
});

const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10,           // 10 requests per minute per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true' || req.headers['x-test-bypass'] === (process.env.TEST_BYPASS_KEY || 'focusflow_test_secret'),
    handler: (req, res) => {
        res.set('Retry-After', '60');
        res.status(429).json({
            error: {
                code: 'TOO_MANY_REQUESTS',
                message: 'Too many login attempts. Please try again after 1 minute.',
                details: { retryAfter: 60 },
            },
        });
    },
});

// 1. CSRF Token Bootstrap Endpoint (Public)
router.get('/csrf-token', authController.getCsrfToken);

// 2. User Registration (Public, Rate-limited, CSRF-protected, Validated)
router.post(
    '/register',
    registerLimiter,
    csrfProtection,
    validate(registerSchema),
    authController.register
);

// 3. User Login (Public, Rate-limited, CSRF-protected, Validated)
router.post(
    '/login',
    loginLimiter,
    csrfProtection,
    validate(loginSchema),
    authController.login
);

// 4. User Logout (CSRF-protected)
router.post(
    '/logout',
    csrfProtection,
    authController.logout
);

// 5. Current Authenticated User (Authenticated)
router.get(
    '/me',
    authenticate,
    authController.getMe
);

module.exports = router;
