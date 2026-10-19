import { useState, useEffect } from 'react';
import {
  fetchUserSettings,
  updateUserProfile,
  updateUserPreferences,
  changePassword,
  exportUserData,
  deleteUserAccount,
} from '../../api/users';
import {
  IconSettings,
  IconSun,
  IconMoon,
  IconClock,
  IconShieldCheck,
  IconUsers,
  IconCheckSquare,
  IconVolume2,
  IconVolumeX,
  IconMusic,
  IconPlay,
  IconBell,
} from '../common/Icons';
import {
  RINGTONE_CATALOG,
  previewRingtone,
  stopAllSounds,
  playAlarmSound,
  getRingtoneName,
} from '../../utils/soundEngine';
import TimerAlarmModal from '../timer/TimerAlarmModal';
import { validateDurationInput } from '../dashboard/QuickAddTaskModal';

export default function SettingsModule({
  theme,
  onToggleTheme,
  user,
  onUpdateUser,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [feedback, setFeedback] = useState({ type: null, message: null });

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    timezone: user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    email: user?.email || '',
    joinedDate: user?.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'Active Member',
  });

  // Password Change Form State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Focus & Productivity Preferences State
  const [focusPrefs, setFocusPrefs] = useState({
    defaultFocusDurationMinutes: 25,
    defaultBreakDurationMinutes: 5,
    dailyFocusTargetMinutes: 240,
    recoveryBufferMinutes: 10,
    weekStart: 'MONDAY',
    workingHoursEnabled: true,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    workingDays: [1, 2, 3, 4, 5],
    autoRescheduleFlexible: true,
  });
  const [breakDurationError, setBreakDurationError] = useState(null);

  // Notifications State
  const [notificationPrefs, setNotificationPrefs] = useState({
    inAppTaskReminders: true,
    timerOverrunAlert: true,
    streakReminders: true,
    soundEffects: true,
  });

  // Sound & Alarms State
  const [soundPrefs, setSoundPrefs] = useState({
    soundEnabled: true,
    focusSoundEnabled: true,
    breakSoundEnabled: true,
    focusRingtone: 'gentle-chime',
    breakRingtone: 'classic-bell',
    volume: 70,
  });
  const [previewingRingtone, setPreviewingRingtone] = useState(null);
  const [testAlarmOpen, setTestAlarmOpen] = useState(false);
  const [isTestPlayingSound, setIsTestPlayingSound] = useState(false);

  // Danger Zone / Delete Account State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Supported IANA timezones list
  const commonTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];

  const daysOfWeek = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 },
  ];

  // Helper to flash feedback messages
  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback({ type: null, message: null });
    }, 4500);
  };

  // Load backend user settings & preferences
  const loadSettings = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchUserSettings();
      if (data?.user) {
        setProfileForm({
          name: data.user.name || '',
          timezone: data.user.timezone || 'UTC',
          email: data.user.email || '',
          joinedDate: data.user.createdAt
            ? new Date(data.user.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Active Member',
        });
      }

      if (data?.preferences) {
        const p = data.preferences;
        const wh = p.workingHours || {};
        const np = p.notificationPreferences || {};

        setFocusPrefs({
          defaultFocusDurationMinutes: wh.defaultFocusDurationMinutes || 25,
          defaultBreakDurationMinutes: wh.defaultBreakDurationMinutes || 5,
          dailyFocusTargetMinutes: wh.dailyFocusTargetMinutes || 240,
          recoveryBufferMinutes: p.recoveryBufferMinutes ?? 10,
          weekStart: wh.weekStart || 'MONDAY',
          workingHoursEnabled: wh.enabled ?? true,
          workingHoursStart: wh.start || '09:00',
          workingHoursEnd: wh.end || '17:00',
          workingDays: Array.isArray(wh.days) ? wh.days : [1, 2, 3, 4, 5],
          autoRescheduleFlexible: p.autoRescheduleFlexible ?? true,
        });

        setNotificationPrefs({
          inAppTaskReminders: np.inAppTaskReminders ?? true,
          timerOverrunAlert: np.timerOverrunAlert ?? true,
          streakReminders: np.streakReminders ?? true,
          soundEffects: np.soundEffects ?? true,
        });

        const sp = p.soundPreferences || {};
        setSoundPrefs({
          soundEnabled: sp.soundEnabled ?? true,
          focusSoundEnabled: sp.focusSoundEnabled ?? true,
          breakSoundEnabled: sp.breakSoundEnabled ?? true,
          focusRingtone: sp.focusRingtone || 'gentle-chime',
          breakRingtone: sp.breakRingtone || 'classic-bell',
          volume: sp.volume ?? 70,
        });
      }
    } catch (err) {
      console.error('Failed to load user settings:', err);
      const friendlyMsg =
        err.status === 404
          ? 'Settings service endpoint not reached. Please verify backend connection.'
          : err.message || 'Failed to load existing preferences from server.';
      setLoadError(friendlyMsg);
      showFeedback('error', friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup audio preview or alarm playback when switching tabs or closing
  useEffect(() => {
    return () => {
      stopAllSounds();
      setPreviewingRingtone(null);
      setIsTestPlayingSound(false);
    };
  }, [activeTab]);

  // Handle Profile Update
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      showFeedback('error', 'Name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await updateUserProfile({
        name: profileForm.name.trim(),
        timezone: profileForm.timezone,
      });

      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }
      showFeedback('success', 'Profile updated successfully.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      showFeedback('error', 'Current password is required.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showFeedback('error', 'New password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
      showFeedback('error', 'New password must contain at least one letter and one number.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showFeedback('error', 'New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      showFeedback('success', 'Password changed successfully. Please keep it safe.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Toggle Working Day
  const handleToggleDay = (dayValue) => {
    setFocusPrefs((prev) => {
      const currentDays = prev.workingDays || [];
      const hasDay = currentDays.includes(dayValue);
      const updatedDays = hasDay
        ? currentDays.filter((d) => d !== dayValue)
        : [...currentDays, dayValue];
      return { ...prev, workingDays: updatedDays.sort((a, b) => a - b) };
    });
  };

  // Handle Focus & Productivity Save
  const handleSaveFocusPrefs = async (e) => {
    e.preventDefault();
    const durErr = validateDurationInput(focusPrefs.defaultBreakDurationMinutes);
    if (durErr) {
      setBreakDurationError(durErr);
      showFeedback('error', durErr);
      return;
    }

    setIsSaving(true);
    try {
      const parsedBreak = parseInt(focusPrefs.defaultBreakDurationMinutes, 10);
      const parsedFocus = parseInt(focusPrefs.defaultFocusDurationMinutes, 10);
      const payload = {
        recoveryBufferMinutes: parseInt(focusPrefs.recoveryBufferMinutes, 10),
        autoRescheduleFlexible: Boolean(focusPrefs.autoRescheduleFlexible),
        workingHours: {
          enabled: Boolean(focusPrefs.workingHoursEnabled),
          start: focusPrefs.workingHoursStart,
          end: focusPrefs.workingHoursEnd,
          days: focusPrefs.workingDays,
          defaultFocusDurationMinutes: parsedFocus,
          defaultBreakDurationMinutes: parsedBreak,
          dailyFocusTargetMinutes: parseInt(focusPrefs.dailyFocusTargetMinutes, 10),
          weekStart: focusPrefs.weekStart,
        },
        defaultFocusDurationMinutes: parsedFocus,
        defaultBreakDurationMinutes: parsedBreak,
        dailyFocusTargetMinutes: parseInt(focusPrefs.dailyFocusTargetMinutes, 10),
        weekStart: focusPrefs.weekStart,
      };

      const updated = await updateUserPreferences(payload);
      if (updated?.workingHours) {
        setFocusPrefs((prev) => ({
          ...prev,
          defaultFocusDurationMinutes: updated.workingHours.defaultFocusDurationMinutes || prev.defaultFocusDurationMinutes,
          defaultBreakDurationMinutes: updated.workingHours.defaultBreakDurationMinutes || prev.defaultBreakDurationMinutes,
          dailyFocusTargetMinutes: updated.workingHours.dailyFocusTargetMinutes || prev.dailyFocusTargetMinutes,
          weekStart: updated.workingHours.weekStart || prev.weekStart,
          workingHoursEnabled: updated.workingHours.enabled ?? prev.workingHoursEnabled,
          workingHoursStart: updated.workingHours.start || prev.workingHoursStart,
          workingHoursEnd: updated.workingHours.end || prev.workingHoursEnd,
          workingDays: Array.isArray(updated.workingHours.days) ? updated.workingHours.days : prev.workingDays,
        }));
      }

      if (onUpdateUser && updated) {
        onUpdateUser({
          preferences: {
            ...(user?.preferences || {}),
            ...updated,
            workingHours: {
              ...(user?.preferences?.workingHours || {}),
              ...(updated.workingHours || {}),
            },
          },
        });
      }

      showFeedback('success', 'Focus and productivity preferences saved.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to save focus preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Notification Preferences Save
  const handleSaveNotificationPrefs = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        notificationPreferences: notificationPrefs,
      };

      await updateUserPreferences(payload);
      showFeedback('success', 'Notification preferences saved.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to save notification preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Appearance Change
  const handleSelectTheme = async (newTheme) => {
    onToggleTheme(newTheme);
    try {
      await updateUserPreferences({ theme: newTheme });
      showFeedback('success', `Theme switched to ${newTheme} mode.`);
    } catch (err) {
      console.warn('Failed to sync theme preference to server:', err);
    }
  };

  // Handle Data Export
  const handleExportData = async () => {
    setIsSaving(true);
    try {
      const data = await exportUserData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `focusflow-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showFeedback('success', 'Your complete data export has been downloaded.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to export your data.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Account Deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Please enter your current password.');
      return;
    }

    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteUserAccount(deletePassword);
      setDeleteModalOpen(false);
      if (onLogout) {
        onLogout();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account. Ensure your password is correct.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Handle Sound Preferences Save
  const handleSaveSoundPrefs = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        soundPreferences: soundPrefs,
      };
      const res = await updateUserPreferences(payload);
      if (res?.preferences?.soundPreferences) {
        setSoundPrefs(res.preferences.soundPreferences);
      }
      showFeedback('success', 'Sound and alarm preferences saved.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to save sound preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Preview Toggle
  const handleTogglePreview = (ringtoneId) => {
    if (previewingRingtone === ringtoneId) {
      stopAllSounds();
      setPreviewingRingtone(null);
    } else {
      setPreviewingRingtone(ringtoneId);
      previewRingtone(ringtoneId, soundPrefs.volume, () => {
        setPreviewingRingtone(null);
      });
    }
  };

  // Handle Test Alarm modal trigger
  const handleTestAlarm = () => {
    stopAllSounds();
    setPreviewingRingtone(null);
    setTestAlarmOpen(true);
    if (soundPrefs.soundEnabled && soundPrefs.focusSoundEnabled) {
      setIsTestPlayingSound(true);
      playAlarmSound(soundPrefs.focusRingtone, soundPrefs.volume);
    } else {
      setIsTestPlayingSound(false);
    }
  };

  const handleStopTestSound = () => {
    stopAllSounds();
    setIsTestPlayingSound(false);
  };

  const handleDismissTestAlarm = () => {
    stopAllSounds();
    setIsTestPlayingSound(false);
    setTestAlarmOpen(false);
  };

  const tabs = [
    { id: 'profile', label: 'Profile & Account', icon: IconSettings },
    { id: 'appearance', label: 'Appearance', icon: IconSun },
    { id: 'focus', label: 'Focus & Productivity', icon: IconClock },
    { id: 'sound', label: 'Sound & Alarms', icon: IconVolume2 },
    { id: 'notifications', label: 'Notifications', icon: IconCheckSquare },
    { id: 'privacy', label: 'Privacy & Data', icon: IconShieldCheck },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-center">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Loading preferences...
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 rounded-2xl bg-[var(--bg-card)] border border-red-500/30 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <IconShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-[var(--text-main)]">Unable to Load Settings</h2>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={loadSettings}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconSettings className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-main)]">
              Account & Preferences
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Configure your personal workflow, recovery buffers, active schedule, and data privacy.
          </p>
        </div>

        {/* User Identity Chip */}
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] self-start sm:self-auto">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-bold flex items-center justify-center text-sm shadow-xs">
            {profileForm.name ? profileForm.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[var(--text-main)] leading-tight">
              {profileForm.name || 'FocusFlow Member'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] leading-tight truncate max-w-[150px]">
              {profileForm.email || user?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Global Toast Feedback Message */}
      {feedback.message && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-all animate-in fade-in ${
            feedback.type === 'error'
              ? 'bg-red-500/10 border-red-500/25 text-red-500'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback({ type: null, message: null })}
            className="hover:opacity-75 font-bold cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navigation Sidebar Tabs (3 cols) */}
        <div className="lg:col-span-3 flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer text-left ${
                  isCurrent
                    ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Cards (9 cols) */}
        <div className="lg:col-span-9 space-y-6">
          {/* TAB 1: PROFILE & ACCOUNT */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Details Card */}
              <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-5">
                <div className="border-b border-[var(--border-subtle)] pb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[var(--text-main)]">Profile Details</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Your personal information and active display preferences.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-[var(--text-dim)] font-medium">Joined:</span>{' '}
                    <span className="text-xs font-semibold text-[var(--text-main)]">{profileForm.joinedDate}</span>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                        Email Address (Read-only)
                      </label>
                      <input
                        type="email"
                        value={profileForm.email || user?.email || ''}
                        disabled
                        className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] text-[var(--text-muted)] text-sm cursor-not-allowed"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                        Account email is locked for security.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                        Local Timezone (IANA)
                      </label>
                      <select
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      >
                        {commonTimezones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                        Used to schedule calendar recovery windows accurately.
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Password Change Card */}
              <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-5">
                <div className="border-b border-[var(--border-subtle)] pb-4">
                  <h2 className="text-base font-bold text-[var(--text-main)]">Change Password</h2>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Update your account password using Argon2id-verified hashing.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                        }
                        required
                        minLength={8}
                        placeholder="At least 8 characters (letters & numbers)"
                        className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                        }
                        required
                        minLength={8}
                        placeholder="Repeat new password"
                        className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isChangingPassword ? 'Updating Password...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Danger Zone: Account Deletion */}
              <div className="p-5 md:p-6 rounded-2xl bg-red-500/5 border border-red-500/20 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-red-500">
                  <IconShieldCheck className="w-5 h-5" />
                  <h2 className="text-base font-bold">Danger Zone</h2>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Permanently delete your FocusFlow account along with your personal tasks, timer history,
                  goals, and preferences. Requires your current password verification.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteModalOpen(true);
                      setDeleteError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h2 className="text-base font-bold text-[var(--text-main)]">Theme & Visual Experience</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Select your preferred interface color palette. Changes are saved and applied immediately.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Dark Theme Option */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme('dark')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-36 ${
                    theme === 'dark'
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/20'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="p-2 rounded-lg bg-[#0F172A] text-amber-400">
                      <IconMoon className="w-5 h-5" />
                    </span>
                    {theme === 'dark' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-text)]">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-main)]">Deep Navy Dark</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      High contrast dark navy and warm gold accents designed for deep focus.
                    </p>
                  </div>
                </button>

                {/* Light Theme Option */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme('light')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-36 ${
                    theme === 'light'
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/20'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
                      <IconSun className="w-5 h-5" />
                    </span>
                    {theme === 'light' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-text)]">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-main)]">Clean Light</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Bright, crisp daytime interface with subtle borders and amber highlights.
                    </p>
                  </div>
                </button>
              </div>

              {/* Visual preview callout */}
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start gap-3">
                <IconShieldCheck className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                  <strong className="text-[var(--text-main)]">FocusFlow Palette Integrity:</strong> All
                  views, including the calendar grid, focus timer, goals streak badges, and team task boards,
                  adapt automatically to ensure optimal contrast and readability.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FOCUS & PRODUCTIVITY */}
          {activeTab === 'focus' && (
            <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h2 className="text-base font-bold text-[var(--text-main)]">Focus & Productivity Engine</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Configure your standard pomodoro focus lengths, recovery buffers, active working hours, and calendar start.
                </p>
              </div>

              <form onSubmit={handleSaveFocusPrefs} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Default Focus Duration */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Default Focus Session
                    </label>
                    <select
                      value={focusPrefs.defaultFocusDurationMinutes}
                      onChange={(e) =>
                        setFocusPrefs({
                          ...focusPrefs,
                          defaultFocusDurationMinutes: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value={15}>15 minutes (Quick Sprint)</option>
                      <option value={25}>25 minutes (Standard Pomodoro)</option>
                      <option value={45}>45 minutes (Deep Block)</option>
                      <option value={60}>60 minutes (Extended Focus)</option>
                      <option value={90}>90 minutes (Ultradian Rhythm)</option>
                    </select>
                  </div>

                  {/* Default Break Duration */}
                  <div>
                    <label htmlFor="settings-break-duration" className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Default Break Duration <span className="text-red-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="settings-break-duration"
                        type="number"
                        min="1"
                        step="1"
                        value={focusPrefs.defaultBreakDurationMinutes}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFocusPrefs((prev) => ({
                            ...prev,
                            defaultBreakDurationMinutes: val,
                          }));
                          setBreakDurationError(validateDurationInput(val));
                        }}
                        disabled={isSaving}
                        placeholder="e.g. 5"
                        aria-invalid={!!breakDurationError}
                        aria-describedby={breakDurationError ? 'settings-break-duration-error' : undefined}
                        className={`w-full px-3.5 py-2 pr-20 rounded-xl bg-[var(--bg-subtle)] border text-[var(--text-main)] text-sm focus:outline-none transition-colors ${
                          breakDurationError
                            ? 'border-red-500 focus:border-red-500'
                            : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                        }`}
                      />
                      <span className="absolute right-3.5 text-xs font-medium text-[var(--text-muted)] pointer-events-none select-none">
                        minutes
                      </span>
                    </div>

                    {breakDurationError && (
                      <p id="settings-break-duration-error" className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">
                        {breakDurationError}
                      </p>
                    )}

                    {/* Quick-select duration buttons */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {[5, 10, 15].map((preset) => {
                        const isHighlighted =
                          !breakDurationError &&
                          parseInt(focusPrefs.defaultBreakDurationMinutes, 10) === preset &&
                          !String(focusPrefs.defaultBreakDurationMinutes).includes('.');
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setFocusPrefs((prev) => ({
                                ...prev,
                                defaultBreakDurationMinutes: preset,
                              }));
                              setBreakDurationError(null);
                            }}
                            disabled={isSaving}
                            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                              isHighlighted
                                ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)] font-semibold shadow-xs'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-main)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            {preset} min
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Daily Focus Target */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Daily Focus Target
                    </label>
                    <select
                      value={focusPrefs.dailyFocusTargetMinutes}
                      onChange={(e) =>
                        setFocusPrefs({
                          ...focusPrefs,
                          dailyFocusTargetMinutes: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value={120}>2 hours / day</option>
                      <option value={180}>3 hours / day</option>
                      <option value={240}>4 hours / day (Recommended)</option>
                      <option value={300}>5 hours / day</option>
                      <option value={360}>6 hours / day</option>
                    </select>
                    <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                      Powers the daily progress ring and streak qualifications.
                    </span>
                  </div>

                  {/* Calendar Week Start */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                      Calendar Week Starts On
                    </label>
                    <select
                      value={focusPrefs.weekStart}
                      onChange={(e) =>
                        setFocusPrefs({ ...focusPrefs, weekStart: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="MONDAY">Monday (Default)</option>
                      <option value="SUNDAY">Sunday</option>
                    </select>
                    <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                      Affects Calendar Week view and Weekly Review analytics.
                    </span>
                  </div>
                </div>

                {/* Working Hours & Working Days Schedule */}
                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Enable Working Hours Schedule
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Constrain calendar focus sessions and automatic rescheduling to active working hours.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={focusPrefs.workingHoursEnabled}
                      onChange={(e) =>
                        setFocusPrefs({
                          ...focusPrefs,
                          workingHoursEnabled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>

                  {focusPrefs.workingHoursEnabled && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[var(--border-subtle)] pt-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                            Working Hours Start
                          </label>
                          <input
                            type="time"
                            value={focusPrefs.workingHoursStart}
                            onChange={(e) =>
                              setFocusPrefs({ ...focusPrefs, workingHoursStart: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                            Working Hours End
                          </label>
                          <input
                            type="time"
                            value={focusPrefs.workingHoursEnd}
                            onChange={(e) =>
                              setFocusPrefs({ ...focusPrefs, workingHoursEnd: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>
                      </div>

                      {/* Working Days Selector */}
                      <div className="border-t border-[var(--border-subtle)] pt-3 space-y-1.5">
                        <label className="block text-[11px] font-semibold text-[var(--text-main)]">
                          Active Working Days
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {daysOfWeek.map((d) => {
                            const isSelected = focusPrefs.workingDays?.includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => handleToggleDay(d.value)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]'
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Recovery Engine Settings */}
                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Automatic Flexible Rescheduling
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Permit the Schedule Recovery Engine to suggest new slots when fixed commitments overrun.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={focusPrefs.autoRescheduleFlexible}
                      onChange={(e) =>
                        setFocusPrefs({
                          ...focusPrefs,
                          autoRescheduleFlexible: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Recovery Buffer Between Tasks
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Buffer time injected after high-focus tasks to prevent schedule cascades.
                      </div>
                    </div>
                    <select
                      value={focusPrefs.recoveryBufferMinutes}
                      onChange={(e) =>
                        setFocusPrefs({
                          ...focusPrefs,
                          recoveryBufferMinutes: parseInt(e.target.value, 10),
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs focus:outline-none"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSaving || !!breakDurationError}
                    className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Focus Preferences'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: SOUND & ALARMS */}
          {activeTab === 'sound' && (
            <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                    <IconVolume2 className="w-5 h-5 text-[var(--accent)]" />
                    Sound & Timer Alarms
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Customize audible ringtones, volume levels, and completion alerts for focus and break intervals.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestAlarm}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-[var(--accent)] text-xs font-semibold border border-[var(--accent)]/30 transition-all cursor-pointer"
                    title="Preview the alarm dialog and selected ringtone"
                  >
                    <IconBell className="w-3.5 h-3.5" />
                    Test Alarm Dialog
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopAllSounds();
                      setPreviewingRingtone(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] text-xs font-medium border border-[var(--border-subtle)] transition-all cursor-pointer"
                    title="Instantly stop any active sound or preview"
                  >
                    <IconVolumeX className="w-3.5 h-3.5" />
                    Stop Sound
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveSoundPrefs} className="space-y-6">
                {/* Master Sound Switch */}
                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                      {soundPrefs.soundEnabled ? <IconVolume2 className="w-5 h-5" /> : <IconVolumeX className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Master Sound Toggle
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {soundPrefs.soundEnabled
                          ? 'Audio alarms enabled for focus and break completions.'
                          : 'All timer alarms muted. Visual notifications and session tracking continue uninterrupted.'}
                      </div>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soundPrefs.soundEnabled}
                      onChange={(e) =>
                        setSoundPrefs({
                          ...soundPrefs,
                          soundEnabled: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[var(--bg-card)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border-subtle)]" />
                  </label>
                </div>

                {/* Volume Slider Card */}
                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconVolume2 className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-xs font-bold text-[var(--text-main)]">Alarm & Preview Volume</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[var(--accent)]">
                      {soundPrefs.volume}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      disabled={!soundPrefs.soundEnabled}
                      value={soundPrefs.volume}
                      onChange={(e) =>
                        setSoundPrefs({
                          ...soundPrefs,
                          volume: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full h-2 bg-[var(--bg-card)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)] disabled:opacity-50"
                    />
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-[var(--text-dim)]">Comfortable Default: 70%</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: 'Mute', val: 0 },
                        { label: '50%', val: 50 },
                        { label: '70%', val: 70 },
                        { label: '100%', val: 100 },
                      ].map(({ label, val }) => (
                        <button
                          key={label}
                          type="button"
                          disabled={!soundPrefs.soundEnabled}
                          onClick={() => setSoundPrefs({ ...soundPrefs, volume: val })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                            soundPrefs.volume === val
                              ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                              : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Individual Completion Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Focus Completion Sound */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                        <IconMusic className="w-3.5 h-3.5 text-amber-500" />
                        Focus Completion Sound
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Play chime when your active focus session countdown completes.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!soundPrefs.soundEnabled}
                      checked={soundPrefs.focusSoundEnabled}
                      onChange={(e) =>
                        setSoundPrefs({
                          ...soundPrefs,
                          focusSoundEnabled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer disabled:opacity-40 shrink-0 mt-0.5"
                    />
                  </div>

                  {/* Break Completion Sound */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                        <IconMusic className="w-3.5 h-3.5 text-emerald-500" />
                        Break Completion Sound
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Play chime when your break or recovery interval reaches zero.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!soundPrefs.soundEnabled}
                      checked={soundPrefs.breakSoundEnabled}
                      onChange={(e) =>
                        setSoundPrefs({
                          ...soundPrefs,
                          breakSoundEnabled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer disabled:opacity-40 shrink-0 mt-0.5"
                    />
                  </div>
                </div>

                {/* Focus Ringtone Selector */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                        Focus Completion Ringtone
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Chosen sound for deep focus session completions.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--accent)]">
                      Current: {getRingtoneName(soundPrefs.focusRingtone)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {RINGTONE_CATALOG.map((tone) => {
                      const isSelected = soundPrefs.focusRingtone === tone.id;
                      const isPreviewing = previewingRingtone === tone.id;
                      return (
                        <div
                          key={`focus-${tone.id}`}
                          onClick={() => setSoundPrefs({ ...soundPrefs, focusRingtone: tone.id })}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-xs'
                              : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] hover:border-[var(--border-main)]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-bold text-[var(--text-main)] truncate">
                                {tone.name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-card)] text-[var(--text-dim)] border border-[var(--border-subtle)]">
                                {tone.category}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-tight">
                              {tone.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[var(--border-subtle)]/60">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                                    : 'border-[var(--text-dim)]'
                                }`}
                              >
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-text)]" />}
                              </span>
                              <span className="text-[10px] font-medium text-[var(--text-dim)]">
                                {isSelected ? 'Selected' : 'Select'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePreview(tone.id);
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                                isPreviewing
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                              }`}
                            >
                              <IconPlay className="w-2.5 h-2.5" />
                              {isPreviewing ? 'Stop' : 'Preview'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Break Ringtone Selector */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                        Break Completion Ringtone
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Chosen sound when break or rest timer concludes.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--accent)]">
                      Current: {getRingtoneName(soundPrefs.breakRingtone)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {RINGTONE_CATALOG.map((tone) => {
                      const isSelected = soundPrefs.breakRingtone === tone.id;
                      const isPreviewing = previewingRingtone === tone.id;
                      return (
                        <div
                          key={`break-${tone.id}`}
                          onClick={() => setSoundPrefs({ ...soundPrefs, breakRingtone: tone.id })}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-xs'
                              : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] hover:border-[var(--border-main)]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-bold text-[var(--text-main)] truncate">
                                {tone.name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-card)] text-[var(--text-dim)] border border-[var(--border-subtle)]">
                                {tone.category}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-tight">
                              {tone.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[var(--border-subtle)]/60">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                                    : 'border-[var(--text-dim)]'
                                }`}
                              >
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-text)]" />}
                              </span>
                              <span className="text-[10px] font-medium text-[var(--text-dim)]">
                                {isSelected ? 'Selected' : 'Select'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePreview(tone.id);
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                                isPreviewing
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                              }`}
                            >
                              <IconPlay className="w-2.5 h-2.5" />
                              {isPreviewing ? 'Stop' : 'Preview'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Honest Browser Audio & Autoplay Notice */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)]">
                    <IconVolume2 className="w-4 h-4 text-[var(--accent)]" />
                    <span>Browser Audio & Tab Inactivity Notice</span>
                  </div>
                  <ul className="text-[11px] text-[var(--text-muted)] space-y-1 list-disc pl-4 leading-relaxed">
                    <li>
                      <strong>Autoplay Policy:</strong> Modern browsers require at least one user interaction on the page before playing audio. Audio is initialized on your first click.
                    </li>
                    <li>
                      <strong>Inactive Background Tabs:</strong> FocusFlow continues tracking focus and breaks accurately in inactive tabs using timestamp reconciliation.
                    </li>
                    <li>
                      <strong>Device Sleep Limitations:</strong> When your device is completely shut down or asleep, JavaScript execution is paused by the operating system. FocusFlow immediately catches up and displays the completion dialog as soon as your device wakes and the tab resumes.
                    </li>
                  </ul>
                </div>

                {/* Submit Save Button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-sm active:scale-95"
                  >
                    {isSaving ? 'Saving...' : 'Save Sound & Alarm Preferences'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h2 className="text-base font-bold text-[var(--text-main)]">Notifications & Reminders</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Manage active in-app schedule reminders and timer alerts.
                </p>
              </div>

              <form onSubmit={handleSaveNotificationPrefs} className="space-y-4">
                <div className="space-y-3">
                  {/* Working In-App Reminders */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        In-App Task Due Reminders
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Show visual reminder chips when tasks approach their scheduled start window.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.inAppTaskReminders}
                      onChange={(e) =>
                        setNotificationPrefs({
                          ...notificationPrefs,
                          inAppTaskReminders: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>

                  {/* Timer Overrun Alert */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Focus Timer Overrun Alert
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Display persistent banner indicator when an active focus block exceeds estimated duration.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.timerOverrunAlert}
                      onChange={(e) =>
                        setNotificationPrefs({
                          ...notificationPrefs,
                          timerOverrunAlert: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>

                  {/* Daily Streak Reminders */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Streak Preservation Alerts
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Remind when an active daily streak is at risk of expiring before midnight.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.streakReminders}
                      onChange={(e) =>
                        setNotificationPrefs({
                          ...notificationPrefs,
                          streakReminders: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>

                  {/* Sound Effects */}
                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        Sound Chimes & Completion Effects
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Play subtle audio cue when completing focus pomodoros or transition breaks.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.soundEffects}
                      onChange={(e) =>
                        setNotificationPrefs({
                          ...notificationPrefs,
                          soundEffects: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* External Push / Email Infrastructure Notice */}
                <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-2">
                  <div className="flex items-center gap-2 text-amber-500 text-xs font-bold">
                    <span>Email & Push Notifications</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                      Requires SMTP / WebPush Setup
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Browser WebPush and external email notifications require an active VAPID key and SMTP mail relay.
                    In-app reminders above are fully functional and operate client-side without external dependencies.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Notification Preferences'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 5: PRIVACY & DATA */}
          {activeTab === 'privacy' && (
            <div className="p-5 md:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h2 className="text-base font-bold text-[var(--text-main)]">Privacy & Data Governance</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Understand your data boundaries and take ownership of your personal productivity history.
                </p>
              </div>

              {/* Personal vs Team Data Architecture Explanation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <IconShieldCheck className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Personal Workspace (Private)
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Your personal tasks, scheduled calendar blocks, daily focus timer recordings, streak
                    progress, and weekly review metrics are strictly private to your account. No team member
                    or team manager can view them.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    <IconUsers className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Team Mode (Shared)
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Only tasks explicitly created inside a Team Workspace or assigned to team projects are
                    visible to your team members. When you focus on a team task, your tracked duration counts
                    towards the shared project total.
                  </p>
                </div>
              </div>

              {/* Data Export Card */}
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-[var(--text-main)]">
                    Export Complete Workspace (JSON)
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Download an exhaustive, machine-readable JSON archive containing all your tasks, focus sessions,
                    goals, streak data, and preferences.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isSaving ? 'Exporting...' : 'Export My Data'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--bg-card)] border border-red-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-500">
              <IconShieldCheck className="w-6 h-6" />
              <h2 className="text-lg font-bold text-[var(--text-main)]">Confirm Account Deletion</h2>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              This action is permanent and cannot be undone. All your personal tasks, timer history, and
              preferences will be purged from the database.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {deleteError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Type <strong className="text-red-500">DELETE</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Current Password:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || deleteConfirmationText !== 'DELETE' || !deletePassword}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeletingAccount ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Alarm Dialog Preview */}
      <TimerAlarmModal
        isOpen={testAlarmOpen}
        alarmType="test"
        taskTitle="Deep Work Sprint"
        durationFormatted="25m 00s"
        ringtoneName={getRingtoneName(soundPrefs.focusRingtone)}
        isPlayingSound={isTestPlayingSound}
        isMuted={!soundPrefs.soundEnabled || !soundPrefs.focusSoundEnabled}
        onStopSound={handleStopTestSound}
        onDismiss={handleDismissTestAlarm}
      />
    </div>
  );
}
