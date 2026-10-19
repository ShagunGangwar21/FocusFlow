'use strict';

/**
 * backend/src/modules/users/users.validation.js
 *
 * Zod validation schemas for User Profile, Preferences, Password management, and Account Deletion.
 */

const { z } = require('zod');

const ScopeEnum = z.enum(['PERSONAL', 'TEAM']);
const ThemeEnum = z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum(['DARK', 'LIGHT'])
);

const timezoneSchema = z
    .string()
    .trim()
    .min(1, 'Timezone is required')
    .refine(
        (tz) => {
            try {
                Intl.DateTimeFormat(undefined, { timeZone: tz });
                return true;
            } catch {
                return false;
            }
        },
        { message: 'Invalid IANA timezone' }
    );

const updateProfileSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').optional(),
    timezone: timezoneSchema.optional(),
});

const notificationPreferencesSchema = z
    .object({
        inApp: z.boolean().optional(),
        overrunWarning: z.boolean().optional(),
        streakReminder: z.boolean().optional(),
        goalMilestone: z.boolean().optional(),
        inAppTaskReminders: z.boolean().optional(),
        timerOverrunAlert: z.boolean().optional(),
        streakReminders: z.boolean().optional(),
        soundEffects: z.boolean().optional(),
    })
    .strict('Invalid notification preference key provided');

const ringtoneEnum = z.enum([
    'classic-bell',
    'digital-beep',
    'gentle-chime',
    'soft-notification',
    'double-bell',
    'piano-tone',
    'nature-tone',
    'minimal-alert',
]);

const soundPreferencesSchema = z
    .object({
        soundEnabled: z.boolean().optional(),
        focusSoundEnabled: z.boolean().optional(),
        breakSoundEnabled: z.boolean().optional(),
        focusRingtone: ringtoneEnum.optional(),
        breakRingtone: ringtoneEnum.optional(),
        volume: z.coerce.number().min(0).max(100).optional(),
    })
    .strict('Invalid sound preference key provided');

const updatePreferencesSchema = z.object({
    theme: ThemeEnum.optional(),
    defaultWorkspaceMode: ScopeEnum.optional(),
    recoveryBufferMinutes: z.coerce.number().int().min(5, 'Buffer must be at least 5 minutes').max(120, 'Buffer cannot exceed 120 minutes').optional(),
    autoRescheduleFlexible: z.boolean().optional(),
    workingHours: z.object({
        enabled: z.boolean().optional(),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid start time format (HH:mm)').optional(),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time format (HH:mm)').optional(),
        days: z.array(z.number().int().min(0).max(6)).optional(),
    }).passthrough().optional(),
    notificationPreferences: notificationPreferencesSchema.optional(),
    soundPreferences: soundPreferencesSchema.optional(),
    defaultFocusDurationMinutes: z.coerce.number({
        invalid_type_error: 'Focus duration must be a valid number of minutes',
    }).int({
        message: 'Focus duration must be a whole number of minutes',
    }).min(1, 'Please enter a duration greater than 0 minutes').optional(),
    defaultBreakDurationMinutes: z.coerce.number({
        invalid_type_error: 'Break duration must be a valid number of minutes',
    }).int({
        message: 'Break duration must be a whole number of minutes',
    }).min(1, 'Please enter a duration greater than 0 minutes').optional(),
    dailyFocusTargetMinutes: z.coerce.number().int().min(15).max(1440).optional(),
    weekStart: z.enum(['MONDAY', 'SUNDAY']).optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
        .min(8, 'New password must be at least 8 characters')
        .max(128, 'New password must not exceed 128 characters')
        .regex(/[A-Za-z]/, 'New password must contain at least one letter')
        .regex(/[0-9]/, 'New password must contain at least one number'),
});

const deleteAccountSchema = z.object({
    password: z.string().min(1, 'Current password is required to delete your account'),
});

module.exports = {
    updateProfileSchema,
    updatePreferencesSchema,
    changePasswordSchema,
    deleteAccountSchema,
    timezoneSchema,
    notificationPreferencesSchema,
    soundPreferencesSchema,
    ringtoneEnum,
};
