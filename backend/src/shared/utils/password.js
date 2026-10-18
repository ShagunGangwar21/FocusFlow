'use strict';

/**
 * backend/src/shared/utils/password.js
 *
 * Password hashing and verification utilities using Argon2id.
 */

const { hash, verify, Algorithm } = require('@node-rs/argon2');

// Recommended Argon2id parameters
const HASH_OPTIONS = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    outputLen: 32,
    parallelism: 1,
};

/**
 * Hashes a plaintext password using Argon2id.
 * @param {string} plaintext - Plaintext password
 * @returns {Promise<string>} Encoded argon2id hash
 */
async function hashPassword(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Password must be a non-empty string');
    }
    return hash(plaintext, HASH_OPTIONS);
}

/**
 * Verifies a plaintext password against an encoded hash in constant time.
 * @param {string} plaintext - Plaintext password to test
 * @param {string} passwordHash - Stored Argon2 hash
 * @returns {Promise<boolean>} True if match, false otherwise
 */
async function verifyPassword(plaintext, passwordHash) {
    if (!plaintext || !passwordHash) {
        return false;
    }
    try {
        return await verify(passwordHash, plaintext, HASH_OPTIONS);
    } catch (err) {
        return false;
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
};
