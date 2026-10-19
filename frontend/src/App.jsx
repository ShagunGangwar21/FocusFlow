import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import GoalsModule from './components/goals/GoalsModule';
import AnalyticsModule from './components/analytics/AnalyticsModule';
import TasksModule from './components/tasks/TasksModule';
import SettingsModule from './components/settings/SettingsModule';
import { getLocalDateKey } from './components/calendar/CalendarModule';
import QuickAddTaskModal from './components/dashboard/QuickAddTaskModal';
import EditTaskModal from './components/dashboard/EditTaskModal';
import ActiveTimerBanner from './components/dashboard/ActiveTimerBanner';
import TimerAlarmModal from './components/timer/TimerAlarmModal';
import {
  playAlarmSound,
  stopAllSounds,
  getRingtoneName,
} from './utils/soundEngine';
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
import { fetchStreakSummary } from './api/streaks';
import { fetchWeeklyReview } from './api/analytics';
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
  const { user, isLoading, logout, updateUser } = useAuth();

  // Theme state: dark navy default, persisted in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('focusflow_theme') || 'dark';
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('overview');

  // Real Task States
  const [tasks, setTasks] = useState([]);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  // Server-Authoritative Streak & Weekly Review Data
  const [serverStreak, setServerStreak] = useState(null);
  const [serverWeeklyReview, setServerWeeklyReview] = useState(null);

  // Server-Authoritative Active Timer Session State
  const [activeSession, setActiveSession] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerMutating, setIsTimerMutating] = useState(false);
  const [timerError, setTimerError] = useState(null);

  const activeTaskId = activeSession ? activeSession.taskId : null;
  const isTimerPaused = activeSession ? activeSession.status === 'PAUSED' : false;

  // Break Timer State
  const [breakTimer, setBreakTimer] = useState({
    isActive: false,
    isPaused: false,
    totalSeconds: 300,
    elapsedSeconds: 0,
    taskId: null,
    taskTitle: '',
  });

  // Alarm Modal State
  const [alarmModal, setAlarmModal] = useState({
    isOpen: false,
    alarmType: 'focus', // 'focus' | 'break'
    taskTitle: '',
    durationFormatted: '',
    ringtoneName: '',
    isPlayingSound: false,
    isMuted: false,
    taskId: null,
  });

  // Duplicate alarm single-trigger guard refs
  const focusAlarmFiredRef = useRef(null);
  const breakAlarmFiredRef = useRef(false);

  // Active Task and Target Duration Computation
  const activeTask = useMemo(() => {
    if (!activeSession) return null;
    return (
      tasks.find((t) => t.id === activeSession.taskId) ||
      (activeSession.task ? activeSession.task : { id: activeSession.taskId, title: 'Focus Task' })
    );
  }, [tasks, activeSession]);

  const targetFocusMinutes = useMemo(() => {
    if (activeTask?.estimatedDurationMinutes) return activeTask.estimatedDurationMinutes;
    const prefMinutes = user?.preferences?.workingHours?.defaultFocusDurationMinutes;
    return prefMinutes || 25;
  }, [activeTask, user]);

  const targetFocusSeconds = targetFocusMinutes * 60;

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

  // Break Timer 1-second interval
  useEffect(() => {
    if (!breakTimer.isActive || breakTimer.isPaused) return;

    const interval = setInterval(() => {
      setBreakTimer((prev) => {
        if (!prev.isActive || prev.isPaused) return prev;
        return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [breakTimer.isActive, breakTimer.isPaused]);

  // Wall-clock & inactive tab reconciliation
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        if (activeSession) {
          fetchActiveSession()
            .then((session) => {
              if (session) {
                setActiveSession(session);
                setTimerSeconds(session.elapsedSeconds || 0);
              }
            })
            .catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeSession, user]);

  // Focus Completion Detection & Alarm Trigger
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'RUNNING') return;
    if (timerSeconds < targetFocusSeconds) return;

    if (focusAlarmFiredRef.current === activeSession.id) return;
    focusAlarmFiredRef.current = activeSession.id;

    const sp = user?.preferences?.soundPreferences || {};
    const soundEnabled = sp.soundEnabled ?? true;
    const focusSoundEnabled = sp.focusSoundEnabled ?? true;
    const focusRingtone = sp.focusRingtone || 'gentle-chime';
    const volume = sp.volume ?? 70;
    const shouldPlaySound = soundEnabled && focusSoundEnabled;

    if (shouldPlaySound) {
      playAlarmSound(focusRingtone, volume);
    }

    setAlarmModal({
      isOpen: true,
      alarmType: 'focus',
      taskTitle: activeTask?.title || 'Focus Task',
      durationFormatted: `${targetFocusMinutes} minutes`,
      ringtoneName: getRingtoneName(focusRingtone),
      isPlayingSound: shouldPlaySound,
      isMuted: !shouldPlaySound,
      taskId: activeSession.taskId,
    });
  }, [activeSession, timerSeconds, targetFocusSeconds, targetFocusMinutes, activeTask, user]);

  // Break Completion Detection & Alarm Trigger
  useEffect(() => {
    if (!breakTimer.isActive) return;
    if (breakTimer.elapsedSeconds < breakTimer.totalSeconds) return;

    if (breakAlarmFiredRef.current) return;
    breakAlarmFiredRef.current = true;
    setBreakTimer((prev) => ({ ...prev, isActive: false }));

    const sp = user?.preferences?.soundPreferences || {};
    const soundEnabled = sp.soundEnabled ?? true;
    const breakSoundEnabled = sp.breakSoundEnabled ?? true;
    const breakRingtone = sp.breakRingtone || 'classic-bell';
    const volume = sp.volume ?? 70;
    const shouldPlaySound = soundEnabled && breakSoundEnabled;

    if (shouldPlaySound) {
      playAlarmSound(breakRingtone, volume);
    }

    const formatBreakDurationDisplay = (totalSecs) => {
      const safe = Math.max(0, Math.floor(totalSecs || 0));
      const m = Math.floor(safe / 60);
      const s = safe % 60;
      if (m > 0 && s > 0) return `${m} min ${s} sec`;
      if (m > 0) return `${m} minute${m === 1 ? '' : 's'}`;
      return `${s} second${s === 1 ? '' : 's'}`;
    };

    setAlarmModal({
      isOpen: true,
      alarmType: 'break',
      taskTitle: breakTimer.taskTitle || 'Next Focus Task',
      durationFormatted: formatBreakDurationDisplay(breakTimer.totalSeconds),
      ringtoneName: getRingtoneName(breakRingtone),
      isPlayingSound: shouldPlaySound,
      isMuted: !shouldPlaySound,
      taskId: breakTimer.taskId,
    });
  }, [breakTimer, user]);

  const handleToggleTheme = (newTheme) => {
    if (typeof newTheme === 'string') {
      setTheme(newTheme);
    } else {
      setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }
  };

  // Fetch server-authoritative streak & weekly review metrics
  const loadMetrics = useCallback(async () => {
    if (!user) return;
    try {
      const [streakData, reviewData] = await Promise.all([
        fetchStreakSummary().catch(() => null),
        fetchWeeklyReview().catch(() => null),
      ]);
      if (streakData) setServerStreak(streakData);
      if (reviewData) setServerWeeklyReview(reviewData);
    } catch (err) {
      console.error('Failed to load server metrics:', err);
    }
  }, [user]);

  // Fetch real authenticated tasks from the API
  const loadTasks = useCallback(async () => {
    if (!user) return;
    setIsTasksLoading(true);
    setTasksError(null);
    try {
      const data = await fetchTasks();
      setTasks(data.tasks);
      // Refresh streak and weekly review authoritatively
      loadMetrics();
    } catch (err) {
      if (err.status === 401) {
        logout();
        return;
      }
      setTasksError(err);
    } finally {
      setIsTasksLoading(false);
    }
  }, [user, logout, loadMetrics]);

  useEffect(() => {
    if (user) {
      loadTasks();
      loadMetrics();
    } else {
      setTasks([]);
    }
  }, [user, loadTasks, loadMetrics]);

  // Create Task handler
  const handleAddTask = async (taskPayload) => {
    const created = await createTask(taskPayload);
    setTasks((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
    setTasksVersion((v) => v + 1);
    loadMetrics();
    return created;
  };

  // Update Task handler
  const handleUpdateTask = async (taskId, updatePayload) => {
    const updated = await updateTask(taskId, updatePayload);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    setTasksVersion((v) => v + 1);
    loadMetrics();
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
      setTasksVersion((v) => v + 1);
      loadMetrics();
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
    setTasksVersion((v) => v + 1);
    loadMetrics();
  };

  // Starts or resumes focusing on a task with server-authoritative session
  const handleStartFocus = async (taskOrId) => {
    const taskId = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId.id : taskOrId;
    if (!taskId) {
      setTimerError('Invalid task identifier provided');
      return;
    }

    if (isTimerMutating) return;
    setIsTimerMutating(true);
    setTimerError(null);

    try {
      stopAllSounds();
      focusAlarmFiredRef.current = null;
      setBreakTimer((prev) => ({ ...prev, isActive: false }));

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
        setTimerSeconds(0);
      }

      // Start new server session for taskId
      const newSession = await startTaskSession(taskId);
      setActiveSession(newSession);
      setTimerSeconds(newSession.elapsedSeconds || 0);
      await loadTasks();
    } catch (err) {
      console.error('Failed to start focus session:', err);
      setTimerError(err.message || 'Failed to start session');
      // Do not compound rate limits with secondary requests if 429 occurred
      if (err.status !== 429) {
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
      }
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
    stopAllSounds();
    focusAlarmFiredRef.current = null;

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
    stopAllSounds();
    focusAlarmFiredRef.current = null;

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

  // Break Timer Handlers
  const handleToggleBreakPause = () => {
    setBreakTimer((prev) => ({ ...prev, isPaused: !prev.isPaused }));
  };

  const handleSkipBreak = () => {
    stopAllSounds();
    setBreakTimer((prev) => ({ ...prev, isActive: false }));
  };

  // Alarm Modal Handlers
  const handleStopAlarmSound = () => {
    stopAllSounds();
    setAlarmModal((prev) => ({ ...prev, isPlayingSound: false }));
  };

  const handleDismissAlarm = () => {
    stopAllSounds();
    setAlarmModal((prev) => ({ ...prev, isOpen: false, isPlayingSound: false }));
  };

  const handleStartBreakFromAlarm = async (breakDurationArg) => {
    stopAllSounds();
    const breakTaskId = alarmModal.taskId;
    const breakTaskName = alarmModal.taskTitle;
    setAlarmModal((prev) => ({ ...prev, isOpen: false, isPlayingSound: false }));

    const savedDefaultMinutes = user?.preferences?.workingHours?.defaultBreakDurationMinutes || 5;
    let targetSeconds = 0;

    if (typeof breakDurationArg === 'object' && breakDurationArg !== null) {
      if (typeof breakDurationArg.totalSeconds === 'number' && breakDurationArg.totalSeconds > 0) {
        targetSeconds = breakDurationArg.totalSeconds;
      } else {
        const m = Number(breakDurationArg.minutes) || 0;
        const s = Number(breakDurationArg.seconds) || 0;
        targetSeconds = (m * 60) + s;
      }
    } else if (typeof breakDurationArg === 'number' && breakDurationArg > 0) {
      targetSeconds = breakDurationArg;
    }

    if (!targetSeconds || targetSeconds <= 0) {
      targetSeconds = savedDefaultMinutes * 60;
    }

    setBreakTimer({
      isActive: true,
      isPaused: false,
      totalSeconds: targetSeconds,
      elapsedSeconds: 0,
      taskId: breakTaskId,
      taskTitle: breakTaskName,
    });
    breakAlarmFiredRef.current = false;

    // Safely finish session in background without marking task complete
    if (activeSession) {
      try {
        await finishSession(activeSession.id, { markTaskComplete: false });
        setActiveSession(null);
        setTimerSeconds(0);
        await loadTasks();
      } catch (err) {
        console.error('Failed to finish session when starting break:', err);
      }
    }
  };

  const handleResumeFocusFromAlarm = () => {
    stopAllSounds();
    const resumeTaskId = alarmModal.taskId;
    setAlarmModal((prev) => ({ ...prev, isOpen: false, isPlayingSound: false }));
    if (resumeTaskId) {
      handleStartFocus(resumeTaskId);
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

    // If active session belongs to a team task not in personal tasks array, record it in map
    if (activeSession && map[activeSession.taskId] === undefined) {
      const priorSeconds = activeSession.accumulatedFocusSeconds || 0;
      map[activeSession.taskId] = priorSeconds + timerSeconds;
    }

    return map;
  }, [tasks, activeSession, timerSeconds]);

  // Compute Weekly Activity dataset dynamically from server review or real tasks
  const weeklyActivityData = useMemo(() => {
    if (serverWeeklyReview?.dailyBreakdown && serverWeeklyReview.dailyBreakdown.length === 7) {
      return serverWeeklyReview.dailyBreakdown.map((d) => ({
        day: d.day,
        date: d.date,
        planned: d.plannedHours ?? d.planned ?? 0,
        actual: d.actualHours ?? d.actual ?? 0,
      }));
    }

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
      const dateStr = getLocalDateKey(date);
      const monthDayStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Match tasks scheduled or created on this date
      const plannedMinutes = tasks
        .filter((t) => {
          const taskDate = (t.startAt || t.createdAt)
            ? getLocalDateKey(t.startAt || t.createdAt)
            : null;
          return taskDate === dateStr;
        })
        .reduce((sum, t) => sum + (t.estimatedDurationMinutes || 0), 0);

      // Match tasks completed on this date
      const actualMinutes = tasks
        .filter((t) => {
          if (t.status !== 'COMPLETED' || !t.completedAt) return false;
          const completedDate = getLocalDateKey(t.completedAt);
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
  }, [tasks, serverWeeklyReview]);

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

  const firstName = user.name ? user.name.split(' ')[0] : 'there';

  // Dynamic real task counts for today
  const todayKey = getLocalDateKey(new Date());
  const todayTasks = tasks.filter((t) => {
    const taskDate = (t.startAt || t.createdAt)
      ? getLocalDateKey(t.startAt || t.createdAt)
      : null;
    return taskDate === todayKey;
  });
  const fixedCount = todayTasks.filter((t) => t.scheduleType === 'FIXED').length;
  const flexibleCount = todayTasks.filter((t) => t.scheduleType === 'FLEXIBLE').length;

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
        taskCount={tasks.length}
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
          onSelectNav={setActiveNav}
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
                    {todayTasks.length === 0 ? (
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

              {/* 4 Core Summary Metric Cards (Dynamic from real task + active timer + server streak data) */}
              <StatCards
                tasks={tasks}
                activeFocusSeconds={timerSeconds}
                streakData={serverStreak}
                analyticsData={serverWeeklyReview?.summary}
              />

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
          ) : activeNav === 'tasks' ? (
            /* Dedicated Tasks Module */
            <TasksModule
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
              onNavigateToCalendar={(targetDate) => {
                setSelectedCalendarDate(targetDate);
                setActiveNav('calendar');
              }}
            />
          ) : activeNav === 'calendar' ? (
            /* Dedicated Phase 5 Calendar & Scheduling Recovery Module */
            <CalendarModule
              onStartFocus={handleStartFocus}
              onEditTask={setTaskToEdit}
              onOpenQuickAdd={() => setIsQuickAddOpen(true)}
              onTasksChanged={loadTasks}
              activeSession={activeSession}
              initialDate={selectedCalendarDate}
              tasksVersion={tasksVersion}
            />
          ) : activeNav === 'teams' ? (
            /* Dedicated Phase 6 Team Mode & Collaboration Hub */
            <TeamsModule
              onStartFocus={handleStartFocus}
              onEditTask={setTaskToEdit}
              activeSession={activeSession}
              isTimerMutating={isTimerMutating}
              timerError={timerError}
              taskElapsedSeconds={taskElapsedSeconds}
              timerSeconds={timerSeconds}
            />
          ) : activeNav === 'goals' ? (
            /* Dedicated Phase 7 Goals & Achievements Module */
            <GoalsModule />
          ) : activeNav === 'analytics' ? (
            /* Dedicated Phase 7 Analytics & Weekly Review Module */
            <AnalyticsModule />
          ) : activeNav === 'settings' ? (
            /* Dedicated Phase 7 Settings & Preferences Module */
            <SettingsModule
              theme={theme}
              onToggleTheme={handleToggleTheme}
              user={user}
              onUpdateUser={updateUser}
              onLogout={logout}
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

      {/* Floating Focus Timer Banner or Break Banner */}
      {(activeTask || breakTimer.isActive) && (
        <ActiveTimerBanner
          task={activeTask}
          elapsedSeconds={timerSeconds}
          accumulatedSeconds={activeSession?.accumulatedFocusSeconds || 0}
          targetFocusSeconds={targetFocusSeconds}
          isPaused={breakTimer.isActive ? breakTimer.isPaused : isTimerPaused}
          isMutating={isTimerMutating}
          errorMessage={timerError}
          isBreakMode={breakTimer.isActive}
          breakTotalSeconds={breakTimer.totalSeconds}
          breakElapsedSeconds={breakTimer.elapsedSeconds}
          breakTaskTitle={breakTimer.taskTitle}
          onToggleBreakPause={handleToggleBreakPause}
          onSkipBreak={handleSkipBreak}
          onClearError={() => setTimerError(null)}
          onTogglePause={handleToggleTimerPause}
          onFinishSession={handleFinishSession}
          onDiscardSession={handleDiscardSession}
        />
      )}

      {/* Visual Completion & Alarm Dialog */}
      <TimerAlarmModal
        isOpen={alarmModal.isOpen}
        alarmType={alarmModal.alarmType}
        taskTitle={alarmModal.taskTitle}
        durationFormatted={alarmModal.durationFormatted}
        ringtoneName={alarmModal.ringtoneName}
        isPlayingSound={alarmModal.isPlayingSound}
        isMuted={alarmModal.isMuted}
        defaultBreakDurationMinutes={user?.preferences?.workingHours?.defaultBreakDurationMinutes || 5}
        onStopSound={handleStopAlarmSound}
        onDismiss={handleDismissAlarm}
        onStartBreak={handleStartBreakFromAlarm}
        onResumeFocus={handleResumeFocusFromAlarm}
      />

      {/* Floating Error Toast if Timer Fails to Start */}
      {timerError && !activeTask && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 text-xs shadow-xl backdrop-blur-md flex items-center justify-between animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Timer Error:</span>
            <span>{timerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTimerError(null)}
            className="text-red-500 hover:text-red-400 font-bold ml-2 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
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
