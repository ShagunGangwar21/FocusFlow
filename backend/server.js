'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { getPrisma, disconnectPrisma } = require('./db/prisma');
const authRoutes = require('./src/modules/auth/auth.routes');
const tasksRoutes = require('./src/modules/tasks/tasks.routes');
const timerRoutes = require('./src/modules/timer/timer.routes');
const calendarRoutes = require('./src/modules/calendar/calendar.routes');
const schedulingRoutes = require('./src/modules/scheduling/scheduling.routes');
const { teamsRouter, invitationsRouter, projectsRouter } = require('./src/modules/teams/teams.routes');
const goalsRoutes = require('./src/modules/goals/goals.routes');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Base API health check (exempt from rate limiting)
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'FocusFlow API is running',
        timestamp: new Date().toISOString(),
    });
});

// Database health check (read-only SELECT 1 query, exempt from rate limiting)
app.get('/api/v1/health/db', async (req, res) => {
    try {
        const prisma = await getPrisma();
        await prisma.$queryRawUnsafe('SELECT 1');
        res.status(200).json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        // Log internally, never expose raw errors or connection strings to client
        console.error('[Health Check] Database connectivity check failed:', err.message);
        res.status(503).json({
            status: 'error',
            message: 'Database service unavailable',
            timestamp: new Date().toISOString(),
        });
    }
});

// General operational API rate limiter (1500 requests per 15 minutes per IP)
const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => {
        if (process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true') {
            return true;
        }
        if (req.headers['x-test-bypass'] === (process.env.TEST_BYPASS_KEY || 'focusflow_test_secret')) {
            return true;
        }
        return false;
    },
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
            error: {
                code: 'TOO_MANY_REQUESTS',
                message: `Too many requests, please try again later. Please wait ${retryAfter} seconds.`,
                details: { retryAfter },
                requestId: req.headers['x-request-id'] || undefined,
            },
        });
    },
});

app.use('/api/v1', generalApiLimiter);

// Mount modular feature routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/sessions', timerRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/scheduling', schedulingRoutes);
app.use('/api/v1/teams', teamsRouter);
app.use('/api/v1/invitations', invitationsRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/goals', goalsRoutes);

// Centralized error handler
app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`FocusFlow API running at http://localhost:${PORT}`);
});

// Graceful shutdown handling
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);

    server.close(async () => {
        console.log('HTTP server closed.');
        try {
            await disconnectPrisma();
            console.log('Prisma Client disconnected cleanly.');
            process.exit(0);
        } catch (err) {
            console.error('Error during database disconnection:', err.message);
            process.exit(1);
        }
    });

    // Force exit after 10 seconds if shutdown hangs
    setTimeout(() => {
        console.error('Forcefully terminating process after timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { app, server, generalApiLimiter };
