import React, { useState, useEffect, useCallback } from 'react';
import { fetchAnalyticsSummary, fetchWeeklyReview } from '../../api/analytics';
import { fetchTeams } from '../../api/teams';
import {
  IconBarChart3,
  IconClock,
  IconCheckSquare,
  IconFlame,
  IconShieldCheck,
  IconAlertTriangle,
  IconRefreshCw,
  IconSparkles,
  IconUsers,
  IconTarget,
} from '../common/Icons';

export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '0m';
  const totalMins = Math.round(Number(minutes));
  if (isNaN(totalMins) || totalMins <= 0) return '0m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AnalyticsModule() {
  const [scope, setScope] = useState('PERSONAL'); // 'PERSONAL' | 'TEAM'
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const [summary, setSummary] = useState(null);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load teams if any exist
  useEffect(() => {
    async function loadUserTeams() {
      try {
        const teamList = await fetchTeams();
        setTeams(teamList || []);
        if (teamList && teamList.length > 0) {
          setSelectedTeamId(teamList[0].id);
        }
      } catch (err) {
        console.error('Failed to load teams for analytics:', err);
      }
    }
    loadUserTeams();
  }, []);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { scope };
      if (scope === 'TEAM' && selectedTeamId) {
        params.teamId = selectedTeamId;
      }

      const [summaryData, reviewData] = await Promise.all([
        fetchAnalyticsSummary(params),
        fetchWeeklyReview(params),
      ]);

      setSummary(summaryData);
      setWeeklyReview(reviewData);
    } catch (err) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  }, [scope, selectedTeamId]);

  useEffect(() => {
    if (scope === 'TEAM' && !selectedTeamId) return;
    loadAnalytics();
  }, [loadAnalytics, scope, selectedTeamId]);

  const daysList = weeklyReview?.dailyBreakdown || weeklyReview?.days || [];
  const maxMinutes = Math.max(
    ...daysList.map((d) =>
      Math.max(
        d.plannedMinutes ?? (d.plannedHours ? Math.round(d.plannedHours * 60) : 0) ?? 0,
        d.actualMinutes ?? (d.actualHours ? Math.round(d.actualHours * 60) : 0) ?? 0
      )
    ),
    120
  );
  const insights = weeklyReview?.insights || [];
  const weeklyGoals = weeklyReview?.weeklyGoals || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Scope Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconBarChart3 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
              Productivity Analytics & Review
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            Server-authoritative metrics for planned vs. actual focus, task accuracy, and weekly progress.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Scope Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setScope('PERSONAL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                scope === 'PERSONAL'
                  ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              Personal
            </button>
            {teams.length > 0 && (
              <button
                onClick={() => setScope('TEAM')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  scope === 'TEAM'
                    ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <IconUsers className="w-3.5 h-3.5" />
                Team
              </button>
            )}
          </div>

          {scope === 'TEAM' && teams.length > 0 && (
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-hidden focus:border-[var(--accent)]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={loadAnalytics}
            title="Refresh analytics"
            className="p-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <IconRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/20 text-xs text-[var(--status-danger)]">
          {error}
        </div>
      )}

      {/* 5 Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Actual Focus Time */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Actual Focus</span>
            <div className="p-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconClock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {summary ? formatMinutes(summary.actualFocusMinutes) : '0m'}
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {summary ? `${summary.actualFocusMinutes || 0}m completed focus` : '0m completed'}
            </p>
          </div>
        </div>

        {/* 2. Planned Focus Time */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Planned Focus</span>
            <div className="p-2 rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
              <IconShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {summary ? formatMinutes(summary.plannedMinutes) : '0m'}
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {summary ? `${summary.plannedMinutes || 0}m estimated tasks` : '0m estimated'}
            </p>
          </div>
        </div>

        {/* 3. Task Completion Rate */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Completion Rate</span>
            <div className="p-2 rounded-lg bg-[var(--status-success)]/15 text-[var(--status-success)]">
              <IconCheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-[var(--status-success)]">
              {summary ? `${summary.completionRate || 0}%` : '0%'}
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {summary ? `${summary.completedTasksCount || 0} of ${summary.totalTasksCount || 0} tasks` : '0 tasks'}
            </p>
          </div>
        </div>

        {/* 4. Planning Accuracy */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Planning Accuracy</span>
            <div className="p-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconSparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-[var(--accent)]">
              {summary?.planningAccuracy !== null && summary?.planningAccuracy !== undefined
                ? `${summary.planningAccuracy}%`
                : 'N/A'}
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {summary?.overrunCount ? `${summary.overrunCount} task overruns` : 'Estimates on target'}
            </p>
          </div>
        </div>

        {/* 5. Flow Streak */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Current Streak</span>
            <div className="p-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconFlame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-[var(--accent)]">
              {summary ? `${summary.currentStreakDays || 0} Days` : '0 Days'}
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {summary ? `Best: ${summary.longestStreakDays || 0} days` : 'Build your streak'}
            </p>
          </div>
        </div>
      </div>

      {/* Weekly Focus Breakdown & Engine Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Weekly Activity Bar Chart (7 Cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border-subtle)]">
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                7-Day Focus & Planning Breakdown
              </h3>
              <p className="text-xs text-[var(--text-dim)] mt-0.5">
                Daily comparison of planned estimates vs. actual recorded focus time
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent)]" />
                <span className="text-[var(--text-muted)]">Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[var(--border-subtle)] border border-[var(--text-dim)]/40" />
                <span className="text-[var(--text-dim)]">Planned</span>
              </div>
            </div>
          </div>

          {/* Bars */}
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-52 px-1 pt-6 pb-2">
            {daysList.map((item) => {
              const actMins = item.actualMinutes ?? (item.actualHours ? Math.round(item.actualHours * 60) : 0) ?? 0;
              const planMins = item.plannedMinutes ?? (item.plannedHours ? Math.round(item.plannedHours * 60) : 0) ?? 0;
              const actualH = Math.round((actMins / maxMinutes) * 100);
              const plannedH = Math.round((planMins / maxMinutes) * 100);

              return (
                <div key={item.day} className="flex flex-col items-center h-full justify-end group relative">
                  <div className="flex items-end justify-center gap-1 w-full max-w-[36px] h-full">
                    {/* Planned */}
                    <div
                      style={{ height: `${planMins > 0 ? Math.max(6, plannedH) : 0}%` }}
                      className="w-1/2 rounded-t-sm bg-[var(--border-subtle)] border border-[var(--text-dim)]/30 transition-all duration-300"
                      title={`${item.day}: ${formatMinutes(planMins)} planned`}
                    />
                    {/* Actual */}
                    <div
                      style={{ height: `${actMins > 0 ? Math.max(6, actualH) : 0}%` }}
                      className="w-1/2 rounded-t-sm bg-[var(--accent)] transition-all duration-300 group-hover:brightness-110"
                      title={`${item.day}: ${formatMinutes(actMins)} actual`}
                    />
                  </div>
                  <span className="mt-2 text-xs font-semibold text-[var(--text-dim)]">
                    {item.day}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {formatMinutes(actMins)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Qualitative Engine Insights & Goals (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <IconSparkles className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Productivity Engine Insights
              </h3>
            </div>

            {insights.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                Log focus sessions and complete scheduled tasks to unlock tailored planning insights.
              </p>
            ) : (
              <div className="space-y-2.5">
                {insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                    <p className="text-xs text-[var(--text-main)] leading-relaxed">
                      {insight}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Goals Widget */}
          {weeklyGoals.length > 0 && (
            <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                <IconTarget className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-main)]">
                  Weekly Goals Progress
                </h3>
              </div>
              <div className="space-y-2.5">
                {weeklyGoals.slice(0, 3).map((g) => {
                  const percent = Math.min(100, Math.round(g.progressPercent || 0));
                  return (
                    <div key={g.id} className="p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--text-main)] truncate max-w-[180px]">{g.title}</span>
                        <span className="font-bold text-[var(--accent)]">{percent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <div
                          style={{ width: `${percent}%` }}
                          className={`h-full rounded-full transition-all ${
                            percent >= 100 ? 'bg-emerald-500' : 'bg-[var(--accent)]'
                          }`}
                        />
                      </div>
                      <div className="text-[10px] text-[var(--text-dim)] flex items-center justify-between">
                        <span>
                          {g.targetMinutes ? `${formatMinutes(g.currentMinutes || 0)} / ${formatMinutes(g.targetMinutes)}` : `${g.currentTasks || 0} / ${g.targetTasks || 0} tasks`}
                        </span>
                        <span>{g.isCompleted ? 'Completed' : 'In Progress'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
        <h3 className="text-base font-bold text-[var(--text-main)] mb-3">
          Daily Activity Log
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-dim)] uppercase tracking-wider">
                <th className="py-2.5 px-3">Day</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Actual Focus</th>
                <th className="py-2.5 px-3">Planned Focus</th>
                <th className="py-2.5 px-3">Tasks Completed</th>
                <th className="py-2.5 px-3">Tasks Planned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-muted)]">
              {daysList.map((d) => {
                const actMins = d.actualMinutes ?? (d.actualHours ? Math.round(d.actualHours * 60) : 0) ?? 0;
                const planMins = d.plannedMinutes ?? (d.plannedHours ? Math.round(d.plannedHours * 60) : 0) ?? 0;
                const compTasks = d.completedTasks ?? d.completedTasksCount ?? 0;
                const planTasks = d.plannedTasks ?? (planMins > 0 ? 1 : 0);

                return (
                  <tr key={d.day} className="hover:bg-[var(--bg-subtle)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[var(--text-main)]">{d.day}</td>
                    <td className="py-2.5 px-3">{d.date || '—'}</td>
                    <td className="py-2.5 px-3 text-[var(--accent)] font-semibold">{formatMinutes(actMins)}</td>
                    <td className="py-2.5 px-3">{formatMinutes(planMins)}</td>
                    <td className="py-2.5 px-3 text-[var(--status-success)] font-medium">{compTasks}</td>
                    <td className="py-2.5 px-3">{planTasks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
