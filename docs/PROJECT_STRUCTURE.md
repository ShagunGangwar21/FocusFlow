# FocusFlow Directory & Architecture Structure

This document outlines the finalized project directory structure for FocusFlow across the frontend (React + Tailwind CSS) and backend (Node.js + Express + PostgreSQL + Prisma).

---

## 1. Top-Level Repository Structure

```text
FocusFlow/
├── backend/                  # Node.js + Express + Prisma API service
├── frontend/                 # React (Vite) + Tailwind CSS client
├── docs/                     # Architecture, Database, & API specifications
│   ├── DATABASE_SCHEMA.md
│   ├── API_CONTRACTS.md
│   └── PROJECT_STRUCTURE.md
├── focusflow-feature-specification.md  # Original product & technical specification
├── package.json              # Monorepo root workspace scripts (optional orchestration)
├── .gitignore
└── README.md
```

---

## 2. Backend Structure (`backend/`)

The backend follows a **feature-oriented modular architecture**. Each functional domain encapsulates its routes, controllers, services, and validation schemas, keeping cross-domain coupling low and testing clean.

```text
backend/
├── prisma/
│   ├── schema.prisma              # Complete database model definitions
│   ├── migrations/                # Version-controlled migration history
│   │   ├── 00000000000000_init/
│   │   │   └── migration.sql
│   │   └── 20261017000000_partial_indexes_and_checks/
│   │       └── migration.sql      # Custom SQL: active timer partial index & check constraints
│   └── seed.js                    # Development seeds (test users, baseline achievements)
├── src/
│   ├── app.js                     # Express app configuration & middleware pipeline
│   ├── server.js                  # HTTP server listener & graceful shutdown handlers
│   ├── config/
│   │   ├── env.js                 # Environment variable validation (Zod)
│   │   ├── database.js            # PrismaClient singleton instance with query logging
│   │   └── storage.js             # Local disk file storage adapter configuration
│   ├── middleware/
│   │   ├── authenticate.js        # Verifies HttpOnly session cookie, populates req.user
│   │   ├── authorize.js           # Team role & resource ownership authorization guards
│   │   ├── csrfProtection.js      # Compares X-CSRF-Token header against cookie
│   │   ├── errorHandler.js        # Centralized error formatter returning standard error JSON
│   │   ├── rateLimit.js           # Endpoint rate-limiting (auth, proposals, uploads)
│   │   └── validate.js            # Middleware factory for Zod schema validation
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.validation.js
│   │   ├── users/
│   │   │   ├── users.routes.js
│   │   │   ├── users.controller.js
│   │   │   ├── users.service.js
│   │   │   └── users.validation.js
│   │   ├── tasks/
│   │   │   ├── tasks.routes.js
│   │   │   ├── tasks.controller.js
│   │   │   ├── tasks.service.js
│   │   │   └── tasks.validation.js
│   │   ├── calendar/
│   │   │   ├── calendar.routes.js
│   │   │   ├── calendar.controller.js
│   │   │   └── calendar.service.js
│   │   ├── timer/
│   │   │   ├── timer.routes.js
│   │   │   ├── timer.controller.js
│   │   │   ├── timer.service.js      # Server timestamp tracking & single-timer rule
│   │   │   └── timer.validation.js
│   │   ├── scheduling/
│   │   │   ├── scheduling.routes.js
│   │   │   ├── scheduling.controller.js
│   │   │   ├── scheduling.service.js  # Conflict analyzer & deterministic recovery engine
│   │   │   └── scheduling.validation.js
│   │   ├── resources/
│   │   │   ├── resources.routes.js
│   │   │   ├── resources.controller.js
│   │   │   ├── resources.service.js
│   │   │   ├── storage.adapter.js     # Abstract file storage interface (Local disk dev)
│   │   │   └── resources.validation.js
│   │   ├── recurrence/
│   │   │   ├── recurrence.routes.js
│   │   │   ├── recurrence.service.js  # Rolling 30-day window task materialization
│   │   │   └── recurrence.job.js      # Daily rollover worker script
│   │   ├── analytics/
│   │   │   ├── analytics.routes.js
│   │   │   ├── analytics.controller.js
│   │   │   └── analytics.service.js   # Planned vs. actual, streak calculations
│   │   ├── goals/
│   │   │   ├── goals.routes.js
│   │   │   ├── goals.controller.js
│   │   │   └── goals.service.js
│   │   ├── teams/
│   │   │   ├── teams.routes.js
│   │   │   ├── teams.controller.js
│   │   │   ├── teams.service.js       # Invitations, SHA-256 tokens, RBAC checks
│   │   │   └── teams.validation.js
│   │   └── projects/
│   │       ├── projects.routes.js
│   │       ├── projects.controller.js
│   │       └── projects.service.js
│   ├── shared/
│   │   ├── constants/
│   │   │   └── statusCodes.js
│   │   ├── errors/
│   │   │   ├── AppError.js
│   │   │   ├── NotFoundError.js
│   │   │   ├── UnauthorizedError.js
│   │   │   ├── ForbiddenError.js
│   │   │   └── ConflictError.js
│   │   └── utils/
│   │       ├── dateUtils.js           # Timezone-aware date calculations
│   │       ├── tokenGenerator.js      # Cryptographic token generator & hash utilities
│   │       └── logger.js              # Structured logger with requestId tagging
│   └── tests/
│       ├── unit/
│       │   ├── scheduling.test.js     # Validates fixed tasks never move automatically
│       │   ├── timer.test.js          # Duration calculation & pause/resume segments
│       │   └── privacy.test.js        # Personal data boundary tests
│       └── integration/
│           ├── auth.test.js
│           ├── tasks.test.js
│           └── teams.test.js
├── .env.example
├── package.json
└── vitest.config.js (or jest.config.js)
```

---

## 3. Frontend Structure (`frontend/`)

The frontend is organized by **reusable design system components**, **global layout shells**, and **feature modules**.

```text
frontend/
├── public/
│   ├── favicon.svg
│   └── sounds/                    # Optional subtle timer chime audio
├── src/
│   ├── app/
│   │   ├── App.jsx                # Main application entry
│   │   ├── router.jsx             # React Router route declarations
│   │   └── providers/
│   │       ├── AuthProvider.jsx   # Current user & session context
│   │       ├── ThemeProvider.jsx  # Dark/Light theme state & HTML class manager
│   │       ├── TimerProvider.jsx  # Global active timer status & interval tick
│   │       └── WorkspaceProvider.jsx # Personal vs. Team mode context
│   ├── components/
│   │   ├── ui/                    # Atomic, reusable design system components
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Badge.jsx
│   │   │   ├── Tooltip.jsx
│   │   │   ├── Tabs.jsx
│   │   │   └── Dropdown.jsx
│   │   ├── layout/                # Persistent application frame
│   │   │   ├── AppLayout.jsx
│   │   │   ├── Sidebar.jsx        # Compact left navigation
│   │   │   ├── Header.jsx         # Workspace selector, date context, notifications
│   │   │   ├── WorkspaceSelector.jsx # Personal / Team dropdown
│   │   │   └── ThemeToggle.jsx    # Dark Navy / Warm Light toggle button
│   │   └── feedback/
│   │       ├── Toast.jsx
│   │       ├── LoadingSpinner.jsx
│   │       └── EmptyState.jsx     # Consistent, explanatory empty states
│   ├── features/
│   │   ├── auth/
│   │   │   ├── LoginForm.jsx
│   │   │   ├── RegisterForm.jsx
│   │   │   └── ProtectedRoute.jsx
│   │   ├── dashboard/
│   │   │   ├── DashboardOverview.jsx
│   │   │   ├── TodayTaskList.jsx
│   │   │   ├── MetricCard.jsx
│   │   │   └── QuickTaskCreate.jsx
│   │   ├── tasks/
│   │   │   ├── TaskList.jsx
│   │   │   ├── TaskItem.jsx
│   │   │   ├── TaskDetailModal.jsx
│   │   │   ├── TaskForm.jsx
│   │   │   └── TaskFilterBar.jsx
│   │   ├── calendar/
│   │   │   ├── CalendarView.jsx
│   │   │   ├── DayView.jsx
│   │   │   ├── WeekView.jsx
│   │   │   ├── MonthView.jsx
│   │   │   └── CalendarEventCard.jsx
│   │   ├── focus/
│   │   │   ├── FocusTimerWidget.jsx # Floating / docked focus timer
│   │   │   ├── FocusSessionModal.jsx
│   │   │   └── SessionHistoryList.jsx
│   │   ├── scheduling/
│   │   │   ├── OverrunBanner.jsx    # Displays detected overruns & warnings
│   │   │   ├── RecoveryProposalModal.jsx # Preview before/after times with rationales
│   │   │   └── FixedTaskConsentAlert.jsx
│   │   ├── analytics/
│   │   │   ├── WeeklyReviewPage.jsx
│   │   │   ├── PlannedVsActualChart.jsx
│   │   │   ├── PlanningAccuracyCard.jsx
│   │   │   └── StreakCounter.jsx
│   │   ├── resources/
│   │   │   ├── ResourceList.jsx
│   │   │   ├── ResourceFormModal.jsx
│   │   │   └── FileUploadDropzone.jsx
│   │   ├── teams/
│   │   │   ├── TeamDashboard.jsx
│   │   │   ├── TeamMemberList.jsx
│   │   │   ├── InviteMemberModal.jsx
│   │   │   └── ProjectList.jsx
│   │   └── settings/
│   │       ├── ProfileSettings.jsx
│   │       ├── WorkingHoursConfig.jsx
│   │       └── NotificationPreferences.jsx
│   ├── services/
│   │   ├── apiClient.js           # Axios/Fetch wrapper with credentials: "include" & CSRF header
│   │   ├── authApi.js
│   │   ├── taskApi.js
│   │   ├── timerApi.js
│   │   ├── schedulingApi.js
│   │   ├── analyticsApi.js
│   │   └── teamApi.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useTimer.js
│   │   ├── useTasks.js
│   │   ├── useCalendar.js
│   │   └── useTheme.js
│   ├── styles/
│   │   ├── tokens.css             # Theme CSS variables (navy, golden-yellow, surfaces)
│   │   └── index.css              # Tailwind base, components, and utilities
│   └── utils/
│       ├── formatters.js          # Duration (HH:mm:ss), date/time formatters
│       └── validation.js
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 4. Theme & Design System Tokens

Tailwind CSS will map directly to the defined CSS custom properties to ensure dynamic runtime switching between **Dark Navy** and **Warm Light** without layout shifts:

| Token Name | Dark Theme Value (Default) | Light Theme Value | Usage Description |
| :--- | :--- | :--- | :--- |
| `--color-bg-base` | `#0B111B` (Deep Navy) | `#F5F5F0` (Warm Off-White) | App viewport background |
| `--color-bg-surface` | `#151F2D` (Lighter Navy) | `#FFFFFF` (Pure White) | Cards, sidebars, modals |
| `--color-bg-muted` | `#1E2D40` | `#EBEBE6` | Hover states, secondary buttons |
| `--color-accent` | `#F5C84C` (Golden Yellow) | `#F5C84C` (Golden Yellow) | Primary buttons, active states |
| `--color-accent-hover` | `#E0B33B` | `#E0B33B` | Button hover state |
| `--color-text-primary` | `#F3F4F6` (Near White) | `#111827` (Dark Navy Gray) | Main headlines, body copy |
| `--color-text-muted` | `#9CA3AF` (Muted Gray) | `#6B7280` (Medium Gray) | Labels, timestamps, hints |
| `--color-border` | `#223348` | `#E5E7EB` | Card dividers, table borders |
| `--color-success` | `#10B981` (Emerald) | `#059669` | Completed tasks, goal reached |
| `--color-warning` | `#F59E0B` (Amber) | `#D97706` | Overrun alert, flexible shift |
| `--color-danger` | `#EF4444` (Restrained Red) | `#DC2626` | Missed tasks, destructive action |
