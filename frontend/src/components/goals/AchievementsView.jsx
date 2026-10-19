import React, { useState, useEffect } from 'react';
import { fetchAchievements } from '../../api/achievements';
import {
  IconTrophy,
  IconAward,
  IconZap,
  IconCompass,
  IconClock,
  IconCheckSquare,
  IconFlame,
  IconTarget,
  IconLock,
  IconCheck,
  IconRefreshCw
} from '../common/Icons';

export default function AchievementsView() {
  const [achievements, setAchievements] = useState([]);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAchievements();
      setAchievements(data.achievements || []);
      setUnlockedCount(data.unlockedCount || 0);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load achievements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getBadgeIcon = (iconName, unlocked) => {
    const iconClass = `w-6 h-6 ${unlocked ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`;
    switch (iconName) {
      case 'zap': return <IconZap className={iconClass} />;
      case 'clock': return <IconClock className={iconClass} />;
      case 'compass': return <IconCompass className={iconClass} />;
      case 'check-circle': return <IconCheckSquare className={iconClass} />;
      case 'award': return <IconAward className={iconClass} />;
      case 'flame': return <IconFlame className={iconClass} />;
      case 'trophy': return <IconTrophy className={iconClass} />;
      case 'target': return <IconTarget className={iconClass} />;
      default: return <IconAward className={iconClass} />;
    }
  };

  const unlockedPercent = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconTrophy className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
              Achievements & Milestones
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            Server-verified productivity milestones unlocked as you focus, build streaks, and complete goals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-[var(--accent)]">
              {unlockedCount} of {total} Unlocked
            </span>
            <span className="text-[11px] text-[var(--text-dim)]">
              {unlockedPercent}% completion rate
            </span>
          </div>
          <button
            onClick={loadData}
            title="Refresh achievements"
            className="p-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <IconRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--status-success)] transition-all duration-500 rounded-full"
          style={{ width: `${unlockedPercent}%` }}
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/20 text-xs text-[var(--status-danger)]">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className={`flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 ${
                ach.unlocked
                  ? 'bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-subtle)] border-[var(--accent)]/40 shadow-xs'
                  : 'bg-[var(--bg-card)]/50 border-[var(--border-subtle)] opacity-70'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-3 rounded-2xl ${ach.unlocked ? 'bg-[var(--accent)]/15 shadow-xs' : 'bg-[var(--bg-subtle)]'}`}>
                    {getBadgeIcon(ach.badgeIcon, ach.unlocked)}
                  </div>
                  {ach.unlocked ? (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--status-success)]/15 text-[var(--status-success)] border border-[var(--status-success)]/30">
                      <IconCheck className="w-3 h-3" /> Unlocked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-subtle)] text-[var(--text-dim)] border border-[var(--border-subtle)]">
                      <IconLock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-[var(--text-main)] mb-1">
                  {ach.name}
                </h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {ach.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]/60 text-[11px]">
                {ach.unlocked ? (
                  <span className="text-[var(--text-dim)]">
                    Earned on {new Date(ach.unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                ) : (
                  <span className="text-[var(--text-dim)] italic">
                    Milestone in progress
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
