/**
 * Sample productivity data for the FocusFlow baseline dashboard demo.
 * NOTE: This mock data is strictly separated from future API integrations.
 */

export const INITIAL_SAMPLE_TASKS = [
  {
    id: "task_1",
    title: "Finalize FocusFlow Schema & Migrations",
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    durationMinutes: 90,
    priority: "HIGH",
    scheduleType: "FIXED", // Fixed commitment
    status: "COMPLETED",
    category: "Architecture"
  },
  {
    id: "task_2",
    title: "Implement Core Focus Timer Engine",
    startTime: "11:00 AM",
    endTime: "12:30 PM",
    durationMinutes: 90,
    priority: "HIGH",
    scheduleType: "FIXED", // Fixed commitment
    status: "IN_PROGRESS",
    category: "Development"
  },
  {
    id: "task_3",
    title: "Evaluate Schedule Recovery Buffer Rules",
    startTime: "02:00 PM",
    endTime: "02:45 PM",
    durationMinutes: 45,
    priority: "MEDIUM",
    scheduleType: "FLEXIBLE", // Can be rescheduled safely
    status: "PENDING",
    category: "Research"
  },
  {
    id: "task_4",
    title: "Draft Team Workspace Privacy Policies",
    startTime: "03:15 PM",
    endTime: "04:15 PM",
    durationMinutes: 60,
    priority: "LOW",
    scheduleType: "FLEXIBLE", // Can be rescheduled safely
    status: "PENDING",
    category: "Security"
  },
  {
    id: "task_5",
    title: "Weekly Planning & Contrast Accessibility Review",
    startTime: "04:30 PM",
    endTime: "05:15 PM",
    durationMinutes: 45,
    priority: "MEDIUM",
    scheduleType: "FLEXIBLE",
    status: "PENDING",
    category: "Design"
  }
];

export const SAMPLE_METRICS = {
  completion: {
    completed: 3,
    total: 5,
    percentage: 60
  },
  focusTime: {
    actualMinutes: 195, // 3h 15m
    plannedMinutes: 240, // 4h 00m
    percentage: 81
  },
  streak: {
    currentDays: 14,
    longestDays: 28,
    label: "Milestone: 2-Week Momentum"
  },
  recoveryStatus: {
    status: "HEALTHY",
    buffersRemainingMinutes: 45,
    conflictsDetected: 0,
    message: "Schedule is balanced. 45m buffer available for overruns."
  }
};

export const SAMPLE_WEEKLY_ACTIVITY = [
  { day: "Mon", date: "Oct 12", planned: 4.5, actual: 4.8 },
  { day: "Tue", date: "Oct 13", planned: 5.0, actual: 5.2 },
  { day: "Wed", date: "Oct 14", planned: 5.5, actual: 5.0 },
  { day: "Thu", date: "Oct 15", planned: 4.0, actual: 4.5 },
  { day: "Fri", date: "Oct 16", planned: 5.0, actual: 4.2 },
  { day: "Sat", date: "Oct 17", planned: 2.5, actual: 3.25 }, // Today
  { day: "Sun", date: "Oct 18", planned: 1.0, actual: 0.0 }
];
