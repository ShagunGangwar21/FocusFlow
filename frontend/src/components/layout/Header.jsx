import { useState, useEffect, useRef } from 'react';
import {
  IconMenu,
  IconSun,
  IconMoon,
  IconBell,
  IconPlus,
  IconLogOut,
  IconSettings,
} from '../common/Icons';
import ConfirmDialog from '../common/ConfirmDialog';
import { fetchUserNotifications } from '../../api/users';

export default function Header({
  pageTitle = "Overview",
  theme,
  onToggleTheme,
  onOpenMobileSidebar,
  onOpenQuickAdd,
  user,
  onLogout,
  onSelectNav,
}) {
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Dropdown states
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const notificationsRef = useRef(null);
  const profileRef = useRef(null);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const displayName = user?.name || 'FocusFlow Member';
  const displayEmail = user?.email || '';
  const displayInitials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'FF';

  // Outside click & escape key listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setIsProfileOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
        setIsProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch notifications on mount or when opening
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    async function loadNotifications() {
      setIsLoadingNotifications(true);
      try {
        const list = await fetchUserNotifications();
        if (isMounted) setNotifications(list);
      } catch (e) {
        console.warn('Failed to load notifications:', e);
      } finally {
        if (isMounted) setIsLoadingNotifications(false);
      }
    }

    if (isNotificationsOpen) {
      loadNotifications();
    }
  }, [user, isNotificationsOpen]);

  const handleConfirmLogout = async () => {
    if (!onLogout || isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutDialogOpen(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-8 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 backdrop-blur-md transition-colors">
        {/* Left section: Mobile Menu Toggle & Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] lg:hidden cursor-pointer"
            aria-label="Open mobile navigation"
          >
            <IconMenu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-main)]">
                {pageTitle}
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                Personal Workspace
              </span>
            </div>
            <p className="text-xs text-[var(--text-dim)] font-medium">
              {currentDate}
            </p>
          </div>
        </div>

        {/* Right section: Action Buttons, Theme Toggle, Notifications & Profile Dropdowns */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Add Task Button */}
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all shadow-xs cursor-pointer active:scale-95"
            aria-label="Quick add task"
          >
            <IconPlus className="w-4 h-4" />
            <span className="hidden sm:inline">New Task</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label={`Toggle theme (currently ${theme})`}
          >
            {theme === 'dark' ? (
              <IconSun className="w-4 h-4 text-[var(--accent)]" />
            ) : (
              <IconMoon className="w-4 h-4 text-[var(--text-main)]" />
            )}
          </button>

          {/* Interactive Notifications Bell Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen((prev) => !prev);
                setIsProfileOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={isNotificationsOpen}
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                isNotificationsOpen
                  ? 'bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-subtle)]'
              }`}
              aria-label="Notifications"
            >
              <IconBell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-app)] animate-pulse" />
              )}
            </button>

            {/* Notifications Panel */}
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between p-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-main)]">Notifications</span>
                    {notifications.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)] text-[var(--accent-text)]">
                        {notifications.length}
                      </span>
                    )}
                  </div>
                  {onSelectNav && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNav('settings');
                        setIsNotificationsOpen(false);
                      }}
                      className="text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Preferences
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                  {isLoadingNotifications ? (
                    <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Loading notifications...
                    </div>
                  ) : notifications.length > 0 ? (
                    notifications.map((item) => (
                      <div key={item.id} className="p-3.5 hover:bg-[var(--bg-subtle)] transition-colors">
                        <div className="text-xs font-semibold text-[var(--text-main)]">{item.title}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{item.message}</div>
                        <div className="text-[10px] text-[var(--text-dim)] mt-1.5">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
                        <IconBell className="w-5 h-5 opacity-70" />
                      </div>
                      <div className="text-xs font-bold text-[var(--text-main)]">
                        No New Notifications
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto leading-relaxed">
                        You&apos;re completely caught up! Task due reminders, focus timer alerts, and daily schedule notifications will appear here.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-2.5 bg-[var(--bg-subtle)]/40 border-t border-[var(--border-subtle)] text-center">
                  <span className="text-[11px] text-[var(--text-dim)]">
                    In-app reminders run client-side in real-time
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Profile & Avatar Dropdown */}
          <div className="relative pl-2 border-l border-[var(--border-subtle)]" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen((prev) => !prev);
                setIsNotificationsOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={isProfileOpen}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-[var(--bg-card)] transition-colors cursor-pointer text-left focus:outline-none"
              aria-label="User profile menu"
            >
              <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--accent-text)] text-xs font-bold shadow-xs">
                <span>{displayInitials}</span>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--status-success)] ring-2 ring-[var(--bg-app)]" />
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-[var(--text-main)] leading-none truncate max-w-[120px]">
                  {displayName}
                </span>
                <span className="text-[10px] text-[var(--text-dim)] leading-tight mt-0.5">
                  Focus Mode
                </span>
              </div>
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                {/* User Summary Header */}
                <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 space-y-1">
                  <div className="text-xs font-bold text-[var(--text-main)] truncate">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {displayEmail}
                  </div>
                  <div className="pt-1">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)]">
                      Personal Workspace
                    </span>
                  </div>
                </div>

                {/* Dropdown Action Links */}
                <div className="p-1.5 space-y-1">
                  {onSelectNav && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNav('settings');
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                    >
                      <IconSettings className="w-4 h-4 text-[var(--accent)]" />
                      <span>Settings & Preferences</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      {theme === 'dark' ? (
                        <IconMoon className="w-4 h-4 text-amber-400" />
                      ) : (
                        <IconSun className="w-4 h-4 text-amber-600" />
                      )}
                      <span>Theme Mode</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {theme}
                    </span>
                  </button>

                  <div className="h-px bg-[var(--border-subtle)] my-1" />

                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        setIsLogoutDialogOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
                    >
                      <IconLogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        title="Sign Out"
        message="Are you sure you want to sign out of FocusFlow? Your progress and timers are safely saved in the cloud."
        confirmLabel={isLoggingOut ? "Signing out..." : "Sign Out"}
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutDialogOpen(false)}
        variant="danger"
      />
    </>
  );
}
