'use strict';

/**
 * backend/src/modules/calendar/calendar.controller.js
 *
 * Controller handling HTTP requests for the Calendar module.
 */

const calendarService = require('./calendar.service');

async function getCalendar(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await calendarService.getCalendarData(userId, req.query);

        return res.status(200).json({
            data: result,
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getCalendar,
};
