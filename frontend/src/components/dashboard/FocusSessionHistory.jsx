import React, { useState, useEffect, useCallback } from 'react';
import {
  IconClock,
  IconCheckSquare,
  IconPlay,
  IconLock,
  IconUnlock,
  IconChevronLeft,
  IconChevronRight,
  IconShieldCheck,
} from '../common/Icons';
import { fetchSessionHistory } from '../../api/timer';

export default function FocusSessionHistory({
  onStartFocus,
  tasks = [],
  activeSession = null,
}) {
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'COMPLETED' | 'DISCARDED'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHistory = useCallback(async (page = 1, currentFilter = filter) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSessionHistory({
        page,
        limit: 10,
        status: currentFilter === 'ALL' ? undefined : currentFilter,
      });
      setSessions(data.sessions);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load session history:', err);
      setError(err.message || 'Failed to load focus session history');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadHistory(1, filter);
  }, [loadHistory, filter]);

  // Overall metrics calculation from loaded records
  const totalCompletedSecs = sessions
    .filter((s) => s.status === 'COMPLETED')
    .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const totalCompletedMinutes = Math.round(totalCompletedSecs / 60);
  const totalHours = Math.floor(totalCompletedMinutes / 60);
  const remainingMins = totalCompletedMinutes % 60;
  const formattedTotal = totalHours > 0
    ? `${totalHours}h ${remainingMins}m`
    : `${totalCompletedMinutes}m`;

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconClock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
              Focus Sessions & History
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            Server-authoritative log of all dedicated focus blocks and deep work sessions.
          </p>
        </div>

        {/* Aggregate Focus Pill */}
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Total Recorded Focus
            </div>
            <div className="text-lg font-bold font-mono text-[var(--accent)]">
              {formattedTotal}
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--border-subtle)]" />
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Completed Blocks
            </div>
            <div className="text-lg font-bold font-mono text-[var(--status-success)]">
              {pagination.total}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          {['ALL', 'COMPLETED', 'DISCARDED'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {tab === 'ALL' ? 'All Sessions' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => loadHistory(pagination.page, filter)}
          disabled={isLoading}
          className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Content State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-[var(--text-muted)]">
          Loading focus session records from server...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-dim)] mb-3">
            <IconClock className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-main)]">
            No focus sessions recorded yet
          </h3>
          <p className="max-w-sm text-xs text-[var(--text-muted)] mt-1 mb-5">
            Start focusing on your scheduled tasks to record server-authoritative deep work blocks and track your real productivity.
          </p>
          {tasks.length > 0 && onStartFocus && (
            <button
              type="button"
              onClick={() => onStartFocus(tasks[0].id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer"
            >
              <IconPlay className="w-3.5 h-3.5" />
              Start Focus on "{tasks[0].title}"
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-dim)] uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Started At</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Schedule Type</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sessions.map((session) => {
                  const isCompleted = session.status === 'COMPLETED';
                  const isDiscarded = session.status === 'DISCARDED';
                  const isRunning = session.status === 'RUNNING';
                  const isPaused = session.status === 'PAUSED';

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-[var(--text-main)]">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xs font-semibold">
                            {session.task?.title || 'Standalone Focus Session'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                        {formatDate(session.startedAt)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-[var(--accent)]">
                        {formatDuration(session.durationSeconds)}
                      </td>
                      <td className="py-3.5 px-4">
                        {session.task?.scheduleType === 'FIXED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--badge-fixed-bg)] text-[var(--badge-fixed-text)] text-[10px] font-bold">
                            <IconLock className="w-3 h-3" /> Fixed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--badge-flexible-bg)] text-[var(--badge-flexible-text)] text-[10px] font-bold">
                            <IconUnlock className="w-3 h-3" /> Flexible
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--status-success)]/15 text-[var(--status-success)]">
                            Completed
                          </span>
                        )}
                        {isDiscarded && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--bg-subtle)] text-[var(--text-dim)]">
                            Discarded
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
                            Running
                          </span>
                        )}
                        {isPaused && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-500">
                            Paused
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-2 text-xs text-[var(--text-muted)]">
              <div>
                Showing page <strong className="text-[var(--text-main)]">{pagination.page}</strong> of{' '}
                <strong className="text-[var(--text-main)]">{pagination.totalPages}</strong> (
                {pagination.total} sessions)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || isLoading}
                  onClick={() => loadHistory(pagination.page - 1, filter)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 transition-colors cursor-pointer"
                  title="Previous page"
                >
                  <IconChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => loadHistory(pagination.page + 1, filter)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 transition-colors cursor-pointer"
                  title="Next page"
                >
                  <IconChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
