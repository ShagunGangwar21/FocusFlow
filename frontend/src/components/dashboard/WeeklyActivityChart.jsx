import React, { useState } from 'react';
import { IconBarChart3 } from '../common/Icons';

export default function WeeklyActivityChart({ data = [] }) {
  const [hoveredDay, setHoveredDay] = useState(null);

  const currentDayShort = new Date().toLocaleDateString('en-US', { weekday: 'short' });

  // Fallback to empty week if data is missing
  const daysList = data.length > 0 ? data : [
    { day: 'Mon', date: '', planned: 0, actual: 0 },
    { day: 'Tue', date: '', planned: 0, actual: 0 },
    { day: 'Wed', date: '', planned: 0, actual: 0 },
    { day: 'Thu', date: '', planned: 0, actual: 0 },
    { day: 'Fri', date: '', planned: 0, actual: 0 },
    { day: 'Sat', date: '', planned: 0, actual: 0 },
    { day: 'Sun', date: '', planned: 0, actual: 0 },
  ];

  // Maximum scale limit for bars (min 4 hours for good vertical proportion)
  const maxHours = Math.max(...daysList.map((d) => Math.max(d.planned, d.actual)), 4);

  const totalActual = daysList.reduce((acc, curr) => acc + (curr.actual || 0), 0);
  const totalPlanned = daysList.reduce((acc, curr) => acc + (curr.planned || 0), 0);

  const totalActualFormatted = totalActual.toFixed(1);
  const totalPlannedFormatted = totalPlanned.toFixed(1);

  // Compute planning accuracy percentage if planned hours exist
  const planningAccuracy = totalPlanned > 0
    ? Math.min(100, Math.round((Math.min(totalActual, totalPlanned) / totalPlanned) * 100))
    : null;

  const hasData = totalActual > 0 || totalPlanned > 0;

  return (
    <div className="flex flex-col p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-colors">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <IconBarChart3 className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-base font-bold tracking-tight text-[var(--text-main)]">
              Weekly Focus Activity
            </h2>
          </div>
          <p className="text-xs text-[var(--text-dim)] mt-0.5">
            Planned vs. actual focus hours across the current week
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent)]" />
            <span className="text-[var(--text-muted)]">Actual ({totalActualFormatted}h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[var(--border-subtle)] border border-[var(--text-dim)]/40" />
            <span className="text-[var(--text-dim)]">Planned ({totalPlannedFormatted}h)</span>
          </div>
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="pt-6 pb-2 relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 bg-[var(--bg-card)]/70 backdrop-blur-[1px] text-center rounded-lg">
            <p className="text-xs font-semibold text-[var(--text-main)]">
              No weekly focus activity recorded yet
            </p>
            <p className="text-[11px] text-[var(--text-dim)] mt-0.5 max-w-xs">
              Schedule or complete tasks to visualize your weekly planned vs. actual focus time.
            </p>
          </div>
        )}

        <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 sm:h-52 px-1">
          {daysList.map((item) => {
            const actualHeight = hasData ? Math.round(((item.actual || 0) / maxHours) * 100) : 0;
            const plannedHeight = hasData ? Math.round(((item.planned || 0) / maxHours) * 100) : 0;
            const isToday = item.day === currentDayShort;

            return (
              <div
                key={item.day}
                className="flex flex-col items-center h-full justify-end group relative"
                onMouseEnter={() => hasData && setHoveredDay(item)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* Tooltip on Hover */}
                {hoveredDay?.day === item.day && hasData && (
                  <div className="absolute -top-12 z-20 px-2.5 py-1.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] shadow-md text-[11px] font-semibold text-[var(--text-main)] whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95">
                    <div>{item.date || item.day}: {item.actual || 0}h actual / {item.planned || 0}h planned</div>
                  </div>
                )}

                {/* Bars Container */}
                <div className="flex items-end justify-center gap-1 w-full max-w-[40px] h-full">
                  {/* Planned Bar */}
                  <div
                    className="w-1/2 rounded-t-xs bg-[var(--border-subtle)] transition-all duration-300 group-hover:opacity-80"
                    style={{ height: `${Math.max(plannedHeight, hasData && item.planned > 0 ? 4 : 2)}%` }}
                    title={`Planned: ${item.planned || 0}h`}
                  />

                  {/* Actual Focus Bar (Golden Yellow Accent) */}
                  <div
                    className={`w-1/2 rounded-t-xs transition-all duration-300 group-hover:brightness-110 ${
                      item.actual > 0 ? 'bg-[var(--accent)] shadow-xs' : 'bg-transparent'
                    }`}
                    style={{ height: `${Math.max(actualHeight, item.actual > 0 ? 6 : 0)}%` }}
                    title={`Actual: ${item.actual || 0}h`}
                  />
                </div>

                {/* Day Labels */}
                <div className="mt-3 text-center">
                  <span
                    className={`block text-xs font-semibold ${
                      isToday
                        ? 'text-[var(--accent)] underline underline-offset-4 decoration-2 font-bold'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {item.day}
                  </span>
                  <span className="hidden sm:block text-[10px] text-[var(--text-dim)] font-medium">
                    {item.actual > 0 ? `${item.actual}h` : '0h'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-dim)]">
        <span>
          Current Week • Planning Accuracy:{' '}
          {planningAccuracy !== null ? (
            <strong className="text-[var(--status-success)] font-semibold">{planningAccuracy}%</strong>
          ) : (
            <strong className="text-[var(--text-dim)] font-semibold">N/A</strong>
          )}
        </span>
        <span className="text-[var(--text-muted)] text-[11px]">
          {hasData ? 'Derived from authenticated user task data' : 'Awaiting logged focus sessions'}
        </span>
      </div>
    </div>
  );
}
