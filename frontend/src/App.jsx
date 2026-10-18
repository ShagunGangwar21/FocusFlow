import { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthView from './components/auth/AuthView';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import StatCards from './components/dashboard/StatCards';
import WeeklyActivityChart from './components/dashboard/WeeklyActivityChart';
import UpcomingTasks from './components/dashboard/UpcomingTasks';
import FocusSessionHistory from './components/dashboard/FocusSessionHistory';
import CalendarModule from './components/calendar/CalendarModule';
import TeamsModule from './components/teams/TeamsModule';
import QuickAddTaskModal from './components/dashboard/QuickAddTaskModal';
import EditTaskModal from './components/dashboard/EditTaskModal';
import ActiveTimerBanner from './components/dashboard/ActiveTimerBanner';
import {
  fetchTasks,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
} from './api/tasks';
import {
  fetchActiveSession,
  startTaskSession,
  pauseSession,
  resumeSession,
  finishSession,
  discardSession,
} from './api/timer';
import {
  IconClock,
  IconShieldCheck,
  IconCalendar,
  IconBarChart3,
  IconTarget,
  IconUsers,
  IconSettings
} from './components/common/Icons';

function MainAppContent() {
  const { user, isLoading, logout } = useAuth();

  // Theme state: dark navy default, persisted in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('focusflow_theme') || 'dark';
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('overview');

  // Real Task States
  const [tasks, setTasks] = useState([]);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);

  // Server-Authoritative Active Timer Session State
  const [activeSession, setActiveSession] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerMutating, setIsTimerMutating] = useState(false);
  const [timerError, setTimerError] = useState(null);

  const activeTaskId = activeSession ? activeSession.taskId : null;
  const isTimerPaused = activeSession ? activeSession.status === 'PAUSED' : false;

  // Sync theme with HTML document class & localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('focusflow_theme', theme);
  }, [theme]);

  // Bootstrap and restore active session on application startup / user change
  useEffect(() => {
    if (!user) {
      setActiveSession(null);
      setTimerSeconds(0);
      return;
    }

    let isMounted = true;

    async function restoreActiveSession() {
      try {
        const session = await fetchActiveSession();
        if (isMounted) {
          if (session) {
            setActiveSession(session);
            setTimerSeconds(session.elapsedSeconds || 0);
          } else {
            setActiveSession(null);
            setTimerSeconds(0);
          }
        }
      } catch (err) {
        console.error('Failed to restore active focus session:', err);
      }
    }

    restoreActiveSession();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // 1-second interval effect: strictly one task accumulates focus time;
  // ticks only when the server session is RUNNING
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'RUNNING') return;

    const timer = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch real authenticated tasks from the API
  const loadTasks = useCallback(async () => {
    if (!user) return;
    setIsTasksLoading(true);
    setTasksError(null);
    try {
      const data = await fetchTasks();
      setTasks(data.tasks);
    } catch (err) {
      if (err.status === 401) {
        logout();
        return;
      }
      setTasksError(err);
    } finally {
      setIsTasksLoading(false);
    }
  }, [user, logout]);

  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user, loadTasks]);

  // Create Task handler
  const handleAddTask = async (taskPayload) => {
    const created = await createTask(taskPayload);
    setTasks((prev) => [created, ...prev]);
    return created;
  };

  // Update Task handler
  const handleUpdateTask = async (taskId, updatePayload) => {
    const updated = await updateTask(taskId, updatePayload);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    return updated;
  };

  // Toggle complete / reopen handler
  const handleToggleComplete = async (taskId) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    try {
      if (target.status === 'COMPLETED') {
        const reopened = await reopenTask(taskId);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? reopened : t)));
      } else {
        // If completing a task that is currently active, finish its server session
        if (activeSession && activeSession.taskId === taskId) {
          await finishSession(activeSession.id, { markTaskComplete: true });
          setActiveSession(null);
          setTimerSeconds(0);
          await loadTasks();
          return;
        }

        const completed = await completeTask(taskId, {});
        setTasks((prev) => prev.map((t) => (t.id === taskId ? completed : t)));
      }
    } catch (err) {
      console.error('Failed to toggle task status:', err);
      loadTasks();
    }
  };

  // Delete Task handler
  const handleDeleteTask = async (taskId) => {
    // If active session belongs to this task, discard it first
    if (activeSession && activeSession.taskId === taskId) {
      try {
        await discardSession(activeSession.id);
      } catch (e) {
        console.error('Failed to discard active session on deleted task:', e);
      }
      setActiveSession(null);
      setTimerSeconds(0);
    }
    await deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // Starts or resumes focusing on a task with server-authoritative session
  const handleStartFocus = async (taskId) => {
    if (isTimerMutating) return;
    setIsTimerMutating(true);
    setTimerError(null);

    try {
      if (activeSession) {
        // If clicking on the currently active task
        if (activeSession.taskId === taskId) {
          if (activeSession.status === 'PAUSED') {
            const resumed = await resumeSession(activeSession.id);
            setActiveSession(resumed);
            setTimerSeconds(resumed.elapsedSeconds || 0);
          }
          return;
        }

        // Switching tasks: safely finish previous session without completing task
        await finishSession(activeSession.id, { markTaskComplete: false });
        setActiveSession(null);
      }

      // Start new server session for taskId
      const newSession = await startTaskSession(taskId);
      setActiveSession(newSession);
      setTimerSeconds(newSession.elapsedSeconds || 0);
      await loadTasks();
    } catch (err) {
      console.error('Failed to start focus session:', err);
      setTimerError(err.message || 'Failed to start session');
      try {
        const currentActive = await fetchActiveSession();
        setActiveSession(currentActive);
        if (currentActive) {
          setTimerSeconds(currentActive.elapsedSeconds || 0);
        }
      } catch (syncErr) {
        console.error('Failed to resync active session after error:', syncErr);
      }
      await loadTasks();
    } finally {
      setIsTimerMutating(false);
    }
  };

  const handleToggleTimerPause = async () => {
    if (!activeSession || isTimerMutating) return;
    setIsTimerMutating(true);
    setTimerError(null);

    try {
      if (activeSession.status === 'RUNNING') {
        const paused = await pauseSession(activeSession.id);
        setActiveSession(paused);
        setTimerSeconds(paused.elapsedSeconds || 0);
      } else if (activeSession.status === 'PAUSED') {
        const resumed = await resumeSession(activeSession.id);
        setActiveSession(resumed);
        setTimerSeconds(resumed.elapsedSeconds || 0);
      }
    } catch (err) {
      console.error('Failed to toggle timer pause:', err);
      setTimerError(err.message || 'Failed to pause/resume timer');
    } finally {
      setIsTimerMutating(false);
    }
  };

  // Finish session: completes the task and records true tracked minutes in database
  const handleFinishSession = async (taskId) => {
    if (!activeSession || isTimerMutating) return;
    setIsTimerMutating(true);
    setTimerError(null);

    try {
      await finishSession(activeSession.id, { markTaskComplete: true });
      setActiveSession(null);
      setTimerSeconds(0);
      await loadTasks();
    } catch (err) {
      console.error('Failed to complete task session:', err);
      setTimerError(err.message || 'Failed to finish session');
      loadTasks();
    } finally {
      setIsTimerMutating(false);
    }
  };

  const handleDiscardSession = async () => {
    if (!activeSession || isTimerMutating) return;
    setIsTimerMutating(true);
    setTimerError(null);

    try {
      await discardSession(activeSession.id);
      setActiveSession(null);
      setTimerSeconds(0);
    } catch (err) {
      console.error('Failed to discard session:', err);
      setTimerError(err.message || 'Failed to discard session');
    } finally {
      setIsTimerMutating(false);
    }
  };

  // Compute live per-task elapsed seconds based on database duration + active session
  const taskElapsedSeconds = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const taskCompletedSeconds = t.accumulatedFocusSeconds !== undefined
        ? t.accumulatedFocusSeconds
        : (t.actualDurationMinutes || 0) * 60;

      if (activeSession && activeSession.taskId === t.id) {
        const priorSeconds = activeSession.accumulatedFocusSeconds !== undefined
          ? activeSession.accumulatedFocusSeconds
          : taskCompletedSeconds;
        map[t.id] = priorSeconds + timerSeconds;
      } else {
        map[t.id] = taskCompletedSeconds;
      }
    });
    return map;
  }, [tasks, activeSession, timerSeconds]);

  // Compute Weekly Activity dataset dynamically from the user's real tasks
  const weeklyActivityData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return weekDays.map((dayName, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const dateStr = date.toISOString().split('T')[0];
      const monthDayStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Match tasks scheduled or created on this date
      const plannedMinutes = tasks
        .filter((t) => {
          const taskDate = (t.startAt || t.createdAt)
            ? new Date(t.startAt || t.createdAt).toISOString().split('T')[0]
            : null;
          return taskDate === dateStr;
        })
        .reduce((sum, t) => sum + (t.estimatedDurationMinutes || 0), 0);

      // Match tasks completed on this date
      const actualMinutes = tasks
        .filter((t) => {
          if (t.status !== 'COMPLETED' || !t.completedAt) return false;
          const completedDate = new Date(t.completedAt).toISOString().split('T')[0];
          return completedDate === dateStr;
        })
        .reduce((sum, t) => sum + (t.actualDurationMinutes || t.estimatedDurationMinutes || 0), 0);

      return {
        day: dayName,
        date: monthDayStr,
        planned: parseFloat((plannedMinutes / 60).toFixed(1)),
        actual: parseFloat((actualMinutes / 60).toFixed(1)),
      };
    });
  }, [tasks]);

  // 1. Loading Splash Screen
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-app)] text-[var(--text-main)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Loading FocusFlow...
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Show Auth Screen and keep protected content inaccessible
  if (!user) {
    return <AuthView theme={theme} onToggleTheme={handleToggleTheme} />;
  }

  const activeTask = activeSession
    ? tasks.find((t) => t.id === activeSession.taskId) || activeSession.task
    : null;
  const firstName = user.name ? user.name.split(' ')[0] : 'there';

  // Dynamic real task counts
  const fixedCount = tasks.filter((t) => t.scheduleType === 'FIXED').length;
  const flexibleCount = tasks.filter((t) => t.scheduleType === 'FLEXIBLE').length;

  // 3. Authenticated Dashboard
  return (
    <div className="flex min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] transition-colors">
      {/* Left Collapsible Navigation Sidebar */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Canvas */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header Bar with Safe Logout Dialog */}
        <Header
          pageTitle={
            activeNav === 'overview'
              ? 'Dashboard'
              : activeNav.charAt(0).toUpperCase() + activeNav.slice(1)
          }
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          user={user}
          onLogout={logout}
        />

        {/* Dynamic Page View Area */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {activeNav === 'overview' ? (
            <>
              {/* Greeting & Differentiator Recovery Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 rounded-2xl bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-subtle)] border border-[var(--border-subtle)] shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
                    <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-main)]">
                      Welcome, {firstName}
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                    {tasks.length === 0 ? (
                      'You have no tasks scheduled for today. Create your first task to get started.'
                    ) : (
                      <>
                        You have <strong className="text-[var(--text-main)]">{fixedCount} fixed {fixedCount === 1 ? 'commitment' : 'commitments'}</strong> and{' '}
                        <strong className="text-[var(--text-main)]">{flexibleCount} flexible {flexibleCount === 1 ? 'task' : 'tasks'}</strong> planned for today.
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                  <IconShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-[var(--text-main)]">Recovery Engine:</span>{' '}
                    <span className="text-[var(--text-muted)]">
                      {tasks.length === 0 ? 'Ready • No active schedule' : `Active • ${flexibleCount} flexible slots`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Core Summary Metric Cards (Dynamic from real task + active timer data) */}
              <StatCards tasks={tasks} activeFocusSeconds={timerSeconds} />

              {/* Grid: Tasks List & Weekly Activity Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Upcoming Schedule & Tasks (7 cols on desktop) */}
                <div className="lg:col-span-7">
                  <UpcomingTasks
                    tasks={tasks}
                    isLoading={isTasksLoading}
                    error={tasksError}
                    onRetry={loadTasks}
                    onToggleComplete={handleToggleComplete}
                    activeTaskId={activeTaskId}
                    taskElapsedSeconds={taskElapsedSeconds}
                    isTimerMutating={isTimerMutating}
                    onStartFocus={handleStartFocus}
                    onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                    onEditTask={setTaskToEdit}
                    onDeleteTask={handleDeleteTask}
                  />
                </div>

                {/* Weekly Focus Activity Chart (5 cols on desktop, Dynamic from real tasks) */}
                <div className="lg:col-span-5">
                  <WeeklyActivityChart data={weeklyActivityData} />
                </div>
              </div>
            </>
          ) : activeNav === 'focus' ? (
            /* Dedicated Focus Sessions & History Module */
            <FocusSessionHistory
              tasks={tasks}
              onStartFocus={handleStartFocus}
              activeSession={activeSession}
            />
          ) : activeNav === 'calendar' ? (
            /* Dedicated Phase 5 Calendar & Scheduling Recovery Module */
            <CalendarModule
              onStartFocus={handleStartFocus}
              onEditTask={setTaskToEdit}
              onOpenQuickAdd={() => setIsQuickAddOpen(true)}
              onTasksChanged={loadTasks}
              activeSession={activeSession}
            />
          ) : activeNav === 'teams' ? (
            /* Dedicated Phase 6 Team Mode & Collaboration Hub */
            <TeamsModule
              onStartFocus={handleStartFocus}
              onEditTask={setTaskToEdit}
              activeSession={activeSession}
            />
          ) : (
            /* Informative Module Placeholder View */
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] text-[var(--accent)] mb-4">
                {activeNav === 'tasks' && <IconShieldCheck className="w-8 h-8" />}
                {activeNav === 'calendar' && <IconCalendar className="w-8 h-8" />}
                {activeNav === 'analytics' && <IconBarChart3 className="w-8 h-8" />}
                {activeNav === 'goals' && <IconTarget className="w-8 h-8" />}
                {activeNav === 'teams' && <IconUsers className="w-8 h-8" />}
                {activeNav === 'settings' && <IconSettings className="w-8 h-8" />}
              </div>
              <h2 className="text-lg font-bold text-[var(--text-main)] capitalize">
                {activeNav} Module
              </h2>
              <p className="max-w-md text-xs sm:text-sm text-[var(--text-muted)] mt-1.5">
                The {activeNav} module views will be connected during subsequent implementation phases. Return to the Overview dashboard or Focus module to manage your schedule.
              </p>
              <button
                type="button"
                onClick={() => setActiveNav('overview')}
                className="mt-5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer"
              >
                Return to Overview Dashboard
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Floating Focus Timer Banner (When session is active) */}
      {activeTask && (
        <ActiveTimerBanner
          task={activeTask}
          elapsedSeconds={timerSeconds}
          accumulatedSeconds={activeSession?.accumulatedFocusSeconds || 0}
          isPaused={isTimerPaused}
          isMutating={isTimerMutating}
          errorMessage={timerError}
          onTogglePause={handleToggleTimerPause}
          onFinishSession={handleFinishSession}
          onDiscardSession={handleDiscardSession}
        />
      )}

      {/* Quick Add Task Modal */}
      <QuickAddTaskModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddTask={handleAddTask}
      />

      {/* Edit Task Modal */}
      <EditTaskModal
        isOpen={Boolean(taskToEdit)}
        task={taskToEdit}
        onClose={() => setTaskToEdit(null)}
        onUpdateTask={handleUpdateTask}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
