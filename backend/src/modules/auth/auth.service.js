'use strict';

/**
 * backend/src/modules/auth/auth.service.js
 *
 * Authentication business logic: registration, credential validation, user profile retrieval.
 */

const { getPrisma } = require('../../../db/prisma');
const { hashPassword, verifyPassword } = require('../../shared/utils/password');
const { ConflictError, UnauthorizedError, NotFoundError } = require('../../shared/errors/AppError');

/**
 * Strips sensitive fields like passwordHash from user object before returning.
 * @param {object} user
 * @returns {object}
 */
function sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

/**
 * Registers a new user and provisions default UserPreference transactionally.
 * @param {{ name: string, email: string, password: string, timezone?: string }} data
 * @returns {Promise<object>} Sanitized created user with preferences
 */
async function registerUser({ name, email, password, timezone = 'UTC' }) {
    const prisma = await getPrisma();

    // 1. Check if email already registered
    const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (existing) {
        throw new ConflictError('An account with this email address already exists.');
    }

    // 2. Hash password with Argon2id
    const passwordHash = await hashPassword(password);

    // 3. Create User and default UserPreference inside a transaction
    const createdUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                name,
                email,
                passwordHash,
                timezone,
            },
        });

        const preferences = await tx.userPreference.create({
            data: {
                userId: user.id,
            },
        });

        return {
            ...user,
            preferences,
        };
    });

    return sanitizeUser(createdUser);
}

/**
 * Validates login credentials and returns user with preferences.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<object>} Sanitized user with preferences
 */
async function loginUser({ email, password }) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            preferences: true,
        },
    });

    if (!user) {
        // Timing mitigation: keep response generic
        throw new UnauthorizedError('Invalid email or password.');
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
        throw new UnauthorizedError('Invalid email or password.');
    }

    return sanitizeUser(user);
}

/**
 * Fetches user profile by ID with preferences.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserProfile(userId) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            preferences: true,
        },
    });

    if (!user) {
        throw new NotFoundError('User not found.');
    }

    return sanitizeUser(user);
}

module.exports = {
    registerUser,
    loginUser,
    getUserProfile,
    sanitizeUser,
};
