'use strict';

/**
 * backend/src/modules/auth/auth.validation.js
 *
 * Zod validation schemas for authentication endpoints.
 */

const { z } = require('zod');

const registerSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name cannot exceed 100 characters'),
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Must be a valid email address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password cannot exceed 128 characters')
        .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number'),
    timezone: z
        .string()
        .trim()
        .optional()
        .default('UTC'),
});

const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Must be a valid email address'),
    password: z
        .string()
        .min(1, 'Password is required'),
});

module.exports = {
    registerSchema,
    loginSchema,
};
