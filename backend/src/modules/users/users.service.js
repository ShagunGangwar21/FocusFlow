'use strict';

/**
 * backend/src/modules/users/users.service.js
 *
 * User Profile, Preferences, Password Management, and Data Export Service.
 * Ensures strict security: password hashing with Argon2id, authenticated user isolation,
 * and double verification before destructive actions.
 */

const { getPrisma } = require('../../../db/prisma');
const { hashPassword, verifyPassword } = require('../../shared/utils/password');
const {
    NotFoundError,
    BadRequestError,
    UnauthorizedError,
} = require('../../shared/errors/AppError');
const { sanitizeUser } = require('../auth/auth.service');

const DEFAULT_SOUND_PREFERENCES = {
    soundEnabled: true,
    focusSoundEnabled: true,
    breakSoundEnabled: true,
    focusRingtone: 'gentle-chime',
    breakRingtone: 'classic-bell',
    volume: 70,
};

/**
 * Get user profile and preferences.
 */
async function getUserSettings(userId) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            preferences: true,
        },
    });

    if (!user) {
        throw new NotFoundError('User not found');
    }

    // Provision default preference if missing
    if (!user.preferences) {
        const pref = await prisma.userPreference.create({
            data: {
                userId,
                defaultWorkspaceMode: 'PERSONAL',
                theme: 'DARK',
                recoveryBufferMinutes: 15,
                autoRescheduleFlexible: false,
                workingHours: {
                    enabled: true,
                    start: '09:00',
                    end: '17:00',
                    days: [1, 2, 3, 4, 5],
                    defaultFocusDurationMinutes: 45,
                    defaultBreakDurationMinutes: 5,
                    dailyFocusTargetMinutes: 240,
                    weekStart: 'MONDAY',
                },
                notificationPreferences: {
                    inApp: true,
                    overrunWarning: true,
                    streakReminder: true,
                    goalMilestone: true,
                    inAppTaskReminders: true,
                    timerOverrunAlert: true,
                    streakReminders: true,
                    soundEffects: true,
                    soundPreferences: DEFAULT_SOUND_PREFERENCES,
                },
            },
        });
        user.preferences = pref;
    }

    if (user.preferences) {
        const notif = typeof user.preferences.notificationPreferences === 'object' && user.preferences.notificationPreferences !== null
            ? user.preferences.notificationPreferences
            : {};
        user.preferences.soundPreferences = notif.soundPreferences || DEFAULT_SOUND_PREFERENCES;

        const wh = typeof user.preferences.workingHours === 'object' && user.preferences.workingHours !== null
            ? { ...user.preferences.workingHours }
            : {};
        if (wh.defaultBreakDurationMinutes === undefined) {
            wh.defaultBreakDurationMinutes = 5;
        }
        user.preferences.workingHours = wh;
    }

    return sanitizeUser(user);
}

/**
 * Update basic user profile (name, timezone).
 */
async function updateUserProfile(userId, data) {
    const prisma = await getPrisma();

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.timezone !== undefined) updateData.timezone = data.timezone.trim();

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
            preferences: true,
        },
    });

    if (updatedUser.preferences) {
        const notif = typeof updatedUser.preferences.notificationPreferences === 'object' && updatedUser.preferences.notificationPreferences !== null
            ? updatedUser.preferences.notificationPreferences
            : {};
        updatedUser.preferences.soundPreferences = notif.soundPreferences || DEFAULT_SOUND_PREFERENCES;
    }

    return sanitizeUser(updatedUser);
}

/**
 * Update user preferences (theme, recoveryBuffer, autoRescheduleFlexible, workingHours, focus defaults).
 */
async function updateUserPreferences(userId, data) {
    const prisma = await getPrisma();

    // Fetch existing preferences
    let existingPref = await prisma.userPreference.findUnique({
        where: { userId },
    });

    if (!existingPref) {
        existingPref = await prisma.userPreference.create({
            data: {
                userId,
                defaultWorkspaceMode: 'PERSONAL',
                theme: 'DARK',
                recoveryBufferMinutes: 15,
                autoRescheduleFlexible: false,
                workingHours: {
                    enabled: true,
                    start: '09:00',
                    end: '17:00',
                    days: [1, 2, 3, 4, 5],
                    defaultFocusDurationMinutes: 45,
                    defaultBreakDurationMinutes: 5,
                    dailyFocusTargetMinutes: 240,
                    weekStart: 'MONDAY',
                },
                notificationPreferences: {
                    inApp: true,
                    overrunWarning: true,
                    streakReminder: true,
                    goalMilestone: true,
                    inAppTaskReminders: true,
                    timerOverrunAlert: true,
                    streakReminders: true,
                    soundEffects: true,
                },
            },
        });
    }

    const prefUpdate = {};

    if (data.theme !== undefined) {
        prefUpdate.theme = data.theme;
    }
    if (data.defaultWorkspaceMode !== undefined) {
        prefUpdate.defaultWorkspaceMode = data.defaultWorkspaceMode;
    }
    if (data.recoveryBufferMinutes !== undefined) {
        prefUpdate.recoveryBufferMinutes = Number(data.recoveryBufferMinutes);
    }
    if (data.autoRescheduleFlexible !== undefined) {
        prefUpdate.autoRescheduleFlexible = Boolean(data.autoRescheduleFlexible);
    }

    // Merge workingHours & productivity settings
    const currentWorkingHours = typeof existingPref.workingHours === 'object' && existingPref.workingHours !== null
        ? existingPref.workingHours
        : {};

    const updatedWorkingHours = {
        ...currentWorkingHours,
        ...(data.workingHours || {}),
    };

    if (data.defaultFocusDurationMinutes !== undefined) {
        updatedWorkingHours.defaultFocusDurationMinutes = Number(data.defaultFocusDurationMinutes);
    }
    if (data.defaultBreakDurationMinutes !== undefined) {
        updatedWorkingHours.defaultBreakDurationMinutes = Number(data.defaultBreakDurationMinutes);
    } else if (updatedWorkingHours.defaultBreakDurationMinutes !== undefined) {
        updatedWorkingHours.defaultBreakDurationMinutes = Number(updatedWorkingHours.defaultBreakDurationMinutes);
    }
    if (data.dailyFocusTargetMinutes !== undefined) {
        updatedWorkingHours.dailyFocusTargetMinutes = Number(data.dailyFocusTargetMinutes);
    }
    if (data.weekStart !== undefined) {
        updatedWorkingHours.weekStart = data.weekStart;
    }

    prefUpdate.workingHours = updatedWorkingHours;

    // Merge notificationPreferences and soundPreferences
    const currentNotif = typeof existingPref.notificationPreferences === 'object' && existingPref.notificationPreferences !== null
        ? existingPref.notificationPreferences
        : {};

    let mergedNotif = prefUpdate.notificationPreferences || { ...currentNotif };

    if (data.notificationPreferences) {
        mergedNotif = {
            ...mergedNotif,
            ...data.notificationPreferences,
            ...(currentNotif.soundPreferences ? { soundPreferences: currentNotif.soundPreferences } : {}),
        };
        prefUpdate.notificationPreferences = mergedNotif;
    }

    if (data.soundPreferences) {
        const currentSound = mergedNotif.soundPreferences || currentNotif.soundPreferences || DEFAULT_SOUND_PREFERENCES;
        mergedNotif = {
            ...mergedNotif,
            soundPreferences: {
                ...currentSound,
                ...data.soundPreferences,
            },
        };
        prefUpdate.notificationPreferences = mergedNotif;
    }

    const updatedPref = await prisma.userPreference.update({
        where: { userId },
        data: prefUpdate,
    });

    const finalNotif = typeof updatedPref.notificationPreferences === 'object' && updatedPref.notificationPreferences !== null
        ? updatedPref.notificationPreferences
        : {};

    return {
        ...updatedPref,
        soundPreferences: finalNotif.soundPreferences || DEFAULT_SOUND_PREFERENCES,
    };
}

/**
 * Secure password change.
 */
async function changePassword(userId, currentPassword, newPassword) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user) {
        throw new NotFoundError('User not found');
    }

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
        throw new BadRequestError('Current password is incorrect');
    }

    const newHash = await hashPassword(newPassword);

    await prisma.user.update({
        where: { id: userId },
        data: {
            passwordHash: newHash,
        },
    });

    return { message: 'Password changed successfully' };
}

/**
 * Comprehensive user data export (JSON format).
 */
async function exportUserData(userId) {
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            preferences: true,
            tasks: {
                where: { scope: 'PERSONAL' },
                include: {
                    timerSessions: {
                        select: {
                            id: true,
                            status: true,
                            durationSeconds: true,
                            startedAt: true,
                            endedAt: true,
                        },
                    },
                },
            },
            goals: true,
            achievements: {
                include: {
                    achievement: true,
                },
            },
        },
    });

    if (!user) {
        throw new NotFoundError('User not found');
    }

    return {
        exportedAt: new Date().toISOString(),
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            timezone: user.timezone,
            createdAt: user.createdAt,
        },
        preferences: user.preferences,
        tasks: user.tasks,
        goals: user.goals,
        achievements: user.achievements.map((ua) => ({
            key: ua.achievement.key,
            title: ua.achievement.title,
            unlockedAt: ua.unlockedAt,
        })),
    };
}

/**
 * Delete user account and associated personal data.
 */
async function deleteUserAccount(userId, password) {
    const prisma = await getPrisma();

    if (!password || typeof password !== 'string' || !password.trim()) {
        throw new BadRequestError('Current password is required to delete your account');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            ownedTeams: {
                include: {
                    memberships: {
                        where: { status: 'ACTIVE' },
                    },
                },
            },
        },
    });

    if (!user) {
        throw new NotFoundError('User not found');
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
        throw new BadRequestError('Incorrect password provided for account deletion');
    }

    // Check if user is the owner of any team with other active members
    const teamsWithOtherMembers = user.ownedTeams.filter((t) =>
        t.memberships.some((m) => m.userId !== userId)
    );
    if (teamsWithOtherMembers.length > 0) {
        throw new BadRequestError(
            `Cannot delete account: You are the owner of team "${teamsWithOtherMembers[0].name}" which has other active members. Please transfer team ownership or remove members first.`
        );
    }

    // Clean up user personal records and account transactionally
    await prisma.$transaction(async (tx) => {
        // 1. Delete teams owned solely by this user (which cascades to memberships, invitations, team goals, team projects, team tasks)
        if (user.ownedTeams.length > 0) {
            const ownedTeamIds = user.ownedTeams.map((t) => t.id);
            await tx.team.deleteMany({
                where: { id: { in: ownedTeamIds } },
            });
        }

        // 2. Unassign from any shared team tasks
        await tx.taskAssignee.deleteMany({
            where: { userId },
        });

        // 3. Delete personal timer sessions
        await tx.timerSession.deleteMany({ where: { userId } });

        // 4. Delete schedule proposals and changes
        await tx.scheduleChange.deleteMany({ where: { actorId: userId } });
        await tx.scheduleProposal.deleteMany({ where: { userId } });

        // 5. Delete personal goals and achievements
        await tx.goal.deleteMany({ where: { userId } });
        await tx.userAchievement.deleteMany({ where: { userId } });

        // 6. Delete personal tasks
        await tx.task.deleteMany({ where: { ownerId: userId, scope: 'PERSONAL' } });

        // 7. Delete resources created by user
        await tx.resource.deleteMany({ where: { createdById: userId } });

        // 8. Delete recurrence rules
        await tx.recurrenceRule.deleteMany({ where: { ownerId: userId } });

        // 9. Delete notifications
        await tx.notification.deleteMany({ where: { userId } });

        // 10. Delete user preferences & memberships
        await tx.userPreference.deleteMany({ where: { userId } });
        await tx.teamMembership.deleteMany({ where: { userId } });

        // 11. Delete the user record
        await tx.user.delete({ where: { id: userId } });
    });

    return { message: 'Account deleted successfully' };
}

/**
 * Get user notifications.
 */
async function getUserNotifications(userId) {
    const prisma = await getPrisma();
    const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    return notifications;
}

module.exports = {
    getUserSettings,
    updateUserProfile,
    updateUserPreferences,
    changePassword,
    exportUserData,
    deleteUserAccount,
    getUserNotifications,
};
