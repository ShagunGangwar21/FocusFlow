import React, { useState, useEffect, useCallback } from 'react';
import { fetchGoals, createGoal, updateGoal, deleteGoal } from '../../api/goals';
import GoalModal from './GoalModal';
import AchievementsView from './AchievementsView';
import {
  IconTarget,
  IconClock,
  IconCheckSquare,
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefreshCw,
  IconCheck,
  IconTrophy,
  IconSparkles
} from '../common/Icons';

export default function GoalsModule() {
  const [activeTab, setActiveTab] = useState('goals'); // 'goals' | 'achievements'
  const [periodFilter, setPeriodFilter] = useState('ALL'); // 'ALL' | 'DAILY' | 'WEEKLY'
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'FOCUS_TIME' | 'TASK_COMPLETION'

  const [goals, setGoals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [goalToEdit, setGoalToEdit] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState(null);

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchGoals();
      setGoals(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load goals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const handleOpenCreate = () => {
    setGoalToEdit(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (goal) => {
    setGoalToEdit(goal);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveGoal = async (payload) => {
    setIsSaving(true);
    setModalError(null);
    try {
      if (goalToEdit) {
        await updateGoal(goalToEdit.id, payload);
      } else {
        await createGoal(payload);
      }
      setIsModalOpen(false);
      await loadGoals();
    } catch (err) {
      setModalError(err.message || 'Failed to save goal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;
    setDeletingId(id);
    try {
      await deleteGoal(id);
      await loadGoals();
    } catch (err) {
      alert(err.message || 'Failed to delete goal');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter goals
  const filteredGoals = goals.filter((g) => {
    if (periodFilter !== 'ALL' && g.period !== periodFilter) return false;
    if (typeFilter !== 'ALL' && g.type !== typeFilter) return false;
    return true;
  });

  const completedGoalsCount = goals.filter((g) => g.isCompleted).length;
  const activeGoalsCount = goals.length;
  const overallRate = activeGoalsCount > 0 ? Math.round((completedGoalsCount / activeGoalsCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'goals'
                ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'
            }`}
          >
            <IconTarget className="w-4 h-4" />
            Productivity Goals ({goals.length})
          </button>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'achievements'
                ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'
            }`}
          >
            <IconTrophy className="w-4 h-4" />
            Achievements
          </button>
        </div>

        {activeTab === 'goals' && (
          <div className="flex items-center gap-2">
            <button
              onClick={loadGoals}
              title="Refresh goals"
              className="p-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <IconRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 transition-opacity shadow-xs"
            >
              <IconPlus className="w-4 h-4" />
              <span>New Goal</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'achievements' ? (
        <AchievementsView />
      ) : (
        <>
          {/* Summary Stat Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Active Goals</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-[var(--text-main)]">{activeGoalsCount}</span>
                <span className="text-xs text-[var(--text-muted)]">tracked</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Goals Completed</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-[var(--status-success)]">{completedGoalsCount}</span>
                <span className="text-xs text-[var(--text-muted)]">met current target</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Completion Rate</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-[var(--accent)]">{overallRate}%</span>
                <span className="text-xs text-[var(--text-muted)]">overall progress</span>
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-dim)] mr-1">Period:</span>
              {['ALL', 'DAILY', 'WEEKLY'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    periodFilter === p
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {p === 'ALL' ? 'All Periods' : p === 'DAILY' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-dim)] mr-1">Type:</span>
              {[
                { id: 'ALL', label: 'All Types' },
                { id: 'FOCUS_TIME', label: 'Focus Time' },
                { id: 'TASK_COMPLETION', label: 'Tasks' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    typeFilter === t.id
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/20 text-xs text-[var(--status-danger)]">
              {error}
            </div>
          )}

          {/* Goals Card Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 animate-pulse" />
              ))}
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="p-4 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-3">
                <IconTarget className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-main)] mb-1">
                {goals.length === 0 ? 'No Goals Created Yet' : 'No Goals Match Selected Filters'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
                {goals.length === 0
                  ? 'Set daily or weekly targets for focus sessions or task completions to keep your productivity high.'
                  : 'Try changing your period or metric filter to see other goals.'}
              </p>
              {goals.length === 0 && (
                <button
                  onClick={handleOpenCreate}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 transition-opacity shadow-xs"
                >
                  <IconPlus className="w-4 h-4" />
                  <span>Create Your First Goal</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGoals.map((goal) => {
                const percent = Math.min(100, goal.progressPercentage || 0);
                const isCompleted = goal.isCompleted || percent >= 100;

                return (
                  <div
                    key={goal.id}
                    className="flex flex-col justify-between p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-subtle)]/80"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            {goal.period}
                          </span>
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20">
                            {goal.type === 'FOCUS_TIME' ? <IconClock className="w-3 h-3" /> : <IconCheckSquare className="w-3 h-3" />}
                            {goal.type === 'FOCUS_TIME' ? 'Focus Time' : 'Tasks'}
                          </span>
                        </div>

                        {isCompleted ? (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--status-success)]/15 text-[var(--status-success)] border border-[var(--status-success)]/30">
                            <IconCheck className="w-3 h-3" /> Completed
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-[var(--text-dim)]">
                            {percent}%
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="text-base font-bold text-[var(--text-main)] mb-1 truncate">
                        {goal.title || (goal.type === 'FOCUS_TIME' ? `${goal.targetValue}m Focus Time` : `${goal.targetValue} Tasks Completed`)}
                      </h4>

                      {/* Progress Numbers */}
                      <div className="flex items-baseline justify-between text-xs mt-3 mb-1.5">
                        <span className="text-[var(--text-muted)]">Progress</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {goal.type === 'FOCUS_TIME'
                            ? `${goal.currentValue || 0}m / ${goal.targetValue}m`
                            : `${goal.currentValue || 0} / ${goal.targetValue} tasks`}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted ? 'bg-[var(--status-success)]' : 'bg-[var(--accent)]'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--border-subtle)] text-xs">
                      <span className="text-[11px] text-[var(--text-dim)]">
                        {goal.period === 'DAILY' ? 'Resets at midnight' : 'Resets Sunday midnight'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(goal)}
                          title="Edit target"
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
                        >
                          <IconEdit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          disabled={deletingId === goal.id}
                          title="Delete goal"
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger)]/10 transition-colors"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Goal Modal */}
      <GoalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveGoal}
        goalToEdit={goalToEdit}
        isSaving={isSaving}
        error={modalError}
      />
    </div>
  );
}
