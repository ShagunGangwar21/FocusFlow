'use strict';

/**
 * backend/db/prisma.js
 *
 * Singleton Prisma Client initialization for FocusFlow.
 * Uses Prisma ORM 7.10.1 with the official @prisma/adapter-pg driver adapter.
 *
 * The generated client in `backend/generated/prisma/client.ts` is imported
 * dynamically as an ES module supported natively by Node.js 24 type stripping.
 */

const { PrismaPg } = require('@prisma/adapter-pg');

let prismaInstance = null;
let initPromise = null;

/**
 * Returns the singleton PrismaClient instance.
 * Thread-safe async singleton using promise memoization.
 * @returns {Promise<import('../generated/prisma/client.ts').PrismaClient>}
 */
async function getPrisma() {
    if (prismaInstance) {
        return prismaInstance;
    }

    if (!initPromise) {
        initPromise = (async () => {
            if (!process.env.DATABASE_URL) {
                throw new Error('[db/prisma] DATABASE_URL environment variable is not defined.');
            }

            // Dynamically import the generated TypeScript client
            const { PrismaClient } = await import('../generated/prisma/client.ts');

            // Initialize PostgreSQL driver adapter with connection string
            const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

            // Instantiate singleton client using official Prisma 7 adapter pattern
            const client = new PrismaClient({ adapter });

            prismaInstance = client;
            return prismaInstance;
        })().catch((err) => {
            initPromise = null; // Allow retry on failure
            throw err;
        });
    }

    return initPromise;
}

/**
 * Disconnects the PrismaClient cleanly if active.
 */
async function disconnectPrisma() {
    if (prismaInstance) {
        try {
            await prismaInstance.$disconnect();
        } finally {
            prismaInstance = null;
            initPromise = null;
        }
    }
}

module.exports = {
    getPrisma,
    disconnectPrisma,
};
