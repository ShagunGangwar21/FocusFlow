'use strict';

/**
 * backend/src/modules/users/users.controller.js
 *
 * Controller handling user profile, preferences, password change, and export.
 */

const usersService = require('./users.service');

async function getMe(req, res, next) {
    try {
        const user = await usersService.getUserSettings(req.user.id);
        return res.status(200).json({
            data: { user, preferences: user?.preferences || null },
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function updateProfile(req, res, next) {
    try {
        const user = await usersService.updateUserProfile(req.user.id, req.body);
        return res.status(200).json({
            data: { user, preferences: user?.preferences || null },
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function updatePreferences(req, res, next) {
    try {
        const preferences = await usersService.updateUserPreferences(req.user.id, req.body);
        return res.status(200).json({
            data: { preferences },
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await usersService.changePassword(req.user.id, currentPassword, newPassword);
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function exportData(req, res, next) {
    try {
        const exportPayload = await usersService.exportUserData(req.user.id);
        res.setHeader('Content-Disposition', `attachment; filename="focusflow-export-${Date.now()}.json"`);
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(exportPayload);
    } catch (err) {
        next(err);
    }
}

async function deleteAccount(req, res, next) {
    try {
        const { password } = req.body || {};
        const result = await usersService.deleteUserAccount(req.user.id, password);
        return res.status(200).json({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

async function getNotifications(req, res, next) {
    try {
        const notifications = await usersService.getUserNotifications(req.user.id);
        return res.status(200).json({
            data: { notifications },
            meta: { timestamp: new Date().toISOString() },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getMe,
    updateProfile,
    updatePreferences,
    changePassword,
    exportData,
    deleteAccount,
    getNotifications,
};
