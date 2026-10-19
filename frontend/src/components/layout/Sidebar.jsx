import React from 'react';
import {
  IconLayoutDashboard,
  IconCheckSquare,
  IconCalendar,
  IconClock,
  IconBarChart3,
  IconTarget,
  IconUsers,
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
  IconX
} from '../common/Icons';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: IconLayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: IconCheckSquare },
  { id: 'calendar', label: 'Calendar', icon: IconCalendar },
  { id: 'focus', label: 'Focus', icon: IconClock, badge: 'Active' },
  { id: 'analytics', label: 'Analytics', icon: IconBarChart3 },
  { id: 'goals', label: 'Goals', icon: IconTarget },
  { id: 'teams', label: 'Teams', icon: IconUsers },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

export default function Sidebar({
  activeNav,
  onSelectNav,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  taskCount,
  tasks,
}) {
  const effectiveTaskCount = taskCount !== undefined
    ? taskCount
    : (Array.isArray(tasks) ? tasks.length : undefined);

  const navItems = NAV_ITEMS.map((item) => {
    if (item.id === 'tasks') {
      return {
        ...item,
        badge: effectiveTaskCount !== undefined ? String(effectiveTaskCount) : undefined,
      };
    }
    return item;
  });
  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation sidebar"
          onClick={onCloseMobile}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onCloseMobile(); }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden cursor-pointer"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col shrink-0 transition-all duration-300 ease-in-out border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] lg:static ${
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-bold shadow-xs shrink-0">
              <span className="text-base tracking-tight">FF</span>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-base font-bold tracking-tight text-[var(--text-main)]">
                  Focus<span className="text-[var(--accent)]">Flow</span>
                </span>
                <span className="text-[11px] font-medium text-[var(--text-dim)] uppercase tracking-wider">
                  Personal Space
                </span>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] lg:hidden"
            aria-label="Close sidebar"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectNav(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                title={isCollapsed ? item.label : undefined}
                className={`group relative flex items-center w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                {/* Active Indicator Accent Pill */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-[var(--accent)]" />
                )}

                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-dim)] group-hover:text-[var(--text-muted)]'
                  }`}
                />

                {!isCollapsed && (
                  <span className="ml-3 truncate font-medium text-left flex-1">
                    {item.label}
                  </span>
                )}

                {!isCollapsed && (item.badge !== undefined && item.badge !== null && item.badge !== '') && (
                  <span
                    id={item.id === 'tasks' ? 'sidebar-tasks-badge' : undefined}
                    data-testid={item.id === 'tasks' ? 'sidebar-tasks-badge' : undefined}
                    className={`ml-auto px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                      item.badge === 'Active'
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: User Mode & Collapse Toggle */}
        <div className="p-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-full px-3 py-2 text-xs font-medium rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <IconChevronRight className="w-4 h-4" />
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-[12px] text-[var(--text-dim)]">Collapse sidebar</span>
                <IconChevronLeft className="w-4 h-4" />
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
