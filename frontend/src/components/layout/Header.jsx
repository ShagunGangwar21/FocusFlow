import { useState } from 'react';
import {
  IconMenu,
  IconSun,
  IconMoon,
  IconBell,
  IconPlus,
  IconLogOut
} from '../common/Icons';
import ConfirmDialog from '../common/ConfirmDialog';

export default function Header({
  pageTitle = "Overview",
  theme,
  onToggleTheme,
  onOpenMobileSidebar,
  onOpenQuickAdd,
  user,
  onLogout
}) {
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const displayName = user?.name || 'Alex Chen';
  const displayInitials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AC';

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
            className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] lg:hidden"
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

        {/* Right section: Action Buttons, Theme Toggle, Profile & Logout */}
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

          {/* Working Theme Toggle Button */}
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

          {/* Notifications Icon with pulse dot */}
          <button
            type="button"
            className="relative p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
            aria-label="Notifications (1 unread)"
          >
            <IconBell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-app)]" />
          </button>

          {/* Profile Avatar & Info */}
          <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-main)] shadow-xs">
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

            {/* Sign Out Button - triggers confirmation modal */}
            {onLogout && (
              <button
                type="button"
                onClick={() => setIsLogoutDialogOpen(true)}
                className="ml-1 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <IconLogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Accessible Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        title="Sign Out"
        message="Are you sure you want to sign out of FocusFlow? Your active session will be closed safely."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        confirmVariant="danger"
        isLoading={isLoggingOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => {
          if (!isLoggingOut) {
            setIsLogoutDialogOpen(false);
          }
        }}
      />
    </>
  );
}
