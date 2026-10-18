'use strict';

/**
 * backend/src/modules/calendar/calendar.validation.js
 *
 * Zod validation schemas for Calendar endpoints.
 */

const { z } = require('zod');

const calendarQuerySchema = z.object({
    from: z.string().datetime({ offset: true, message: 'from must be a valid ISO-8601 datetime' }),
    to: z.string().datetime({ offset: true, message: 'to must be a valid ISO-8601 datetime' }),
    scope: z.enum(['PERSONAL', 'TEAM']).default('PERSONAL'),
    teamId: z.string().cuid('teamId must be a valid CUID').optional().nullable(),
}).refine((data) => {
    return new Date(data.to) > new Date(data.from);
}, {
    message: 'to must be later than from',
    path: ['to'],
}).refine((data) => {
    if (data.scope === 'TEAM' && !data.teamId) {
        return false;
    }
    return true;
}, {
    message: 'teamId is required when scope is TEAM',
    path: ['teamId'],
});

module.exports = {
    calendarQuerySchema,
};
