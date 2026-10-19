'use strict';

/**
 * backend/src/modules/users/users.routes.js
 *
 * User Profile & Settings routes.
 * Authenticated and CSRF-protected for mutating actions.
 */

const express = require('express');
const usersController = require('./users.controller');
const {
    updateProfileSchema,
    updatePreferencesSchema,
    changePasswordSchema,
    deleteAccountSchema,
} = require('./users.validation');
const { validate } = require('../../middleware/validate');
const { csrfProtection } = require('../../middleware/csrfProtection');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// 1. Get current user profile and preferences
router.get('/me', usersController.getMe);

// 2. Update basic user profile (name, timezone)
router.patch(
    '/me',
    csrfProtection,
    validate(updateProfileSchema),
    usersController.updateProfile
);

// 3. Update user preferences (theme, workingHours, recoveryBuffer, notifications)
router.patch(
    '/me/preferences',
    csrfProtection,
    validate(updatePreferencesSchema),
    usersController.updatePreferences
);

// 4. Change password
router.post(
    '/me/change-password',
    csrfProtection,
    validate(changePasswordSchema),
    usersController.changePassword
);

// 5. Export personal user data
router.get('/me/export', usersController.exportData);

// 6. Delete account
router.delete(
    '/me',
    csrfProtection,
    validate(deleteAccountSchema),
    usersController.deleteAccount
);

// 7. Get notifications
router.get('/me/notifications', usersController.getNotifications);

module.exports = router;
