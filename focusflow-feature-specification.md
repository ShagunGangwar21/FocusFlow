# FocusFlow --- Product & Technical Specification

**Status:** Baseline specification before implementation\
**Product:** FocusFlow\
**Purpose:** A personal and team productivity platform for planning
work, focusing, tracking actual time, recovering from schedule overruns,
and improving future estimates.

------------------------------------------------------------------------

## 1. Product vision

FocusFlow helps users turn intentions into realistic schedules, work on
tasks with focus sessions, compare planned time with actual time, and
recover intelligently when plans change.

The main product loop is:

**PLAN → FOCUS → TRACK → ADAPT → IMPROVE**

FocusFlow is not just a to-do list. Its key differentiator is schedule
recovery: it understands fixed and flexible tasks, detects overruns,
proposes safe changes, and asks before changing commitments that should
not move automatically.

### Product principles

1.  **Useful before intelligent:** core workflows must work without a
    paid AI provider or cloud ML service.
2.  **Private by default:** a user's personal tasks, timer history,
    notes, resources, and analytics are not exposed to teammates by
    default.
3.  **Predictable scheduling:** initial scheduling decisions use
    explicit, testable rules.
4.  **Human control:** proposed schedule changes are shown before
    applying them when they affect commitments, deadlines, or other
    people.
5.  **Explainable recommendations:** show why a conflict exists and why
    a time slot is suggested.
6.  **Incremental delivery:** implement, test, and review one vertical
    feature slice at a time.
7.  **Accessible and responsive:** support keyboard use, readable
    contrast, mobile layouts, and reduced motion where applicable.

## 2. Target users and modes

### Personal Mode

For students, professionals, and individuals planning their own work.

Capabilities: - Private tasks and schedules - Daily, weekly, and monthly
calendar views - Focus timer and work-session history - Personal
resources and notes - Personal productivity analytics - Goals, streaks,
and reminders - Smart schedule recovery

### Team Mode

For small groups collaborating on shared projects.

Capabilities: - Create a team and invite members - Team roles and
membership management - Shared projects and team tasks - Assign tasks to
members - Shared deadlines and project progress - Team calendar and
team-level analytics

### Privacy boundary

-   Personal tasks are private unless a user explicitly shares them.
-   Team tasks belong to a team/project and have explicit
    membership-based access rules.
-   Joining a team must not expose a user's personal calendar, personal
    notes, or personal analytics.
-   A team task's timer entries can be visible to authorized team
    members only according to the project's configured policy.
-   Team administrators cannot automatically access private personal
    task content.
-   Every API must enforce ownership/membership on the server; hiding UI
    controls is not authorization.

## 3. User roles and permissions

### Roles

-   **User:** manages their own account and private workspace.
-   **Team Owner:** manages the team, membership, roles, and team
    settings.
-   **Team Admin:** manages team membership and projects where granted.
-   **Team Member:** views team content and performs permitted task
    actions.
-   **Task Assignee:** a member assigned to a particular team task.

### Baseline permission rules

-   A user can read/update/delete their own private tasks.
-   A team member can access a team only while they have active
    membership.
-   Only authorized team roles can invite or remove members.
-   Team tasks can only be assigned to active members of that team.
-   A user cannot gain access by guessing a task, team, resource, or
    session ID.
-   Ownership and membership checks are enforced in backend services for
    every protected operation.
-   Sensitive actions such as removing a member or deleting a team
    require clear confirmation.
-   The initial release may implement a simple Owner/Member role model;
    finer-grained roles can be added after the core Team Mode works.

## 4. UI and design system

### Visual direction

Use the supplied weekly-review screenshot as inspiration for information
hierarchy and compact productivity cards, not as a pixel-for-pixel copy.

-   **Default theme:** dark navy
-   **Primary accent:** golden yellow
-   **Dark surfaces:** deep navy backgrounds and slightly lighter navy
    cards
-   **Light theme:** warm off-white background, white cards, dark navy
    text, same golden-yellow accent
-   **Status colors:** green for completed/success, amber for
    attention/conflicts, restrained red for errors or missed tasks
-   Avoid excessive gradients, neon glow, decorative charts, and
    unnecessary rounded cards.
-   Prefer consistent spacing, purposeful whitespace, clear typography,
    subtle borders, and a compact left sidebar.
-   The same layout and design tokens must work in both themes.

Suggested starting tokens (adjust after visual testing): - Dark
background: `#0B111B` - Dark card: `#151F2D` - Light background:
`#F5F5F0` - Light card: `#FFFFFF` - Primary accent: `#F5C84C` - Main
dark-theme text: `#F3F4F6` - Muted text: `#9CA3AF`

These are starting values, not immutable requirements. Check contrast
before finalizing.

### Navigation

Primary navigation: - Overview - Tasks - Calendar - Focus - Weekly
Review / Analytics - Resources (may initially live inside tasks) -
Goals - Teams (when a user has Team Mode access) - Settings

Header controls: - Personal / Team workspace selector - Current page
title and date context - Notifications - Profile/account menu - Theme
toggle

### Main dashboard

Show only useful at-a-glance information: - Today's task list and next
scheduled task - Current/upcoming focus session - Planned versus actual
focus time - Completion progress - Schedule conflict or overdue warning
when relevant - Quick task creation - Weekly summary link

Do not fill the initial dashboard with every possible chart. Deeper
analytics belong on the weekly review page.

### Responsive behavior

-   Desktop: sidebar and multi-column dashboard/calendar.
-   Tablet: collapsible sidebar and adaptable cards.
-   Mobile: compact navigation, single-column cards, usable timer
    controls.
-   Theme preference persists after reload.
-   Theme choice is a UI preference, not a security setting.

## 5. Functional feature specification

### F1. Registration, login, and private accounts

**User flow** 1. User registers with name, email, and password. 2.
Backend validates input and checks whether the email is already
registered. 3. Password is hashed using a suitable password-hashing
library. 4. User logs in and receives a secure session/token mechanism.
5. Protected pages load only after authentication. 6. User logs out and
the session is invalidated according to the chosen auth design.

**Business rules** - Normalize email addresses and enforce uniqueness in
the database. - Never store plaintext passwords or log
passwords/tokens. - Validate all inputs on the server, even if the
frontend validates too. - Return generic login errors that do not reveal
whether an email exists. - Protect private routes and enforce ownership
in every relevant service. - Prefer short-lived access tokens with a
carefully designed refresh/session strategy. For a browser app, evaluate
secure, HttpOnly cookies and CSRF protections rather than placing
long-lived tokens in localStorage. - Add rate limiting to authentication
endpoints. - Email verification and password reset can follow after the
initial registration/login flow.

**Initial APIs** - `POST /api/v1/auth/register` -
`POST /api/v1/auth/login` - `POST /api/v1/auth/logout` -
`GET /api/v1/auth/me` - Later: password reset and email verification
endpoints.

### F2. Task management and calendar

**Task fields** - Title (required) - Description (optional) - Date -
Start time and end time, when scheduled - Estimated duration - Priority:
LOW, MEDIUM, HIGH - Status: PENDING, IN_PROGRESS, COMPLETED, PARTIAL,
MISSED, CANCELLED - Schedule type: FIXED or FLEXIBLE - Deadline
(optional) - Scope: PERSONAL or TEAM - Owner and, for team tasks,
team/project association - Optional assignees for team tasks -
Created/updated timestamps

**User flow** 1. Create a task. 2. Enter title, schedule, priority,
type, and optional details. 3. See overlap/conflict feedback before
saving or confirming. 4. View the task in list/calendar views. 5. Edit,
complete, partially complete, cancel, or delete it. 6. Filter by date,
status, priority, scope, or assignee.

**Business rules** - End time must be after start time. - Estimated
duration must be positive. - A task with no scheduled time may exist as
an unscheduled task. - Overlap checks apply to tasks that compete for
the same user's time; team tasks require a clearly defined
assignee/resource conflict policy. - Do not silently overwrite a task's
scheduled times when a conflict is found. - Use explicit status
transitions and validate them in the service layer. - Store timestamps
consistently; use a user/team time-zone preference for display and
scheduling calculations. - Handle daylight-saving transitions safely for
users in time zones that observe them.

**Initial APIs** - `POST /api/v1/tasks` - `GET /api/v1/tasks` -
`GET /api/v1/tasks/:taskId` - `PATCH /api/v1/tasks/:taskId` -
`DELETE /api/v1/tasks/:taskId` - `POST /api/v1/tasks/:taskId/complete` -
`GET /api/v1/calendar?from=...&to=...`

### F3. Focus timer and session history

**User flow** 1. User selects a task and starts a session. 2. Timer runs
in the client, while the backend records the session start. 3. User can
pause/resume or finish the session. 4. The backend calculates duration
from trusted timestamps rather than trusting a client-supplied total. 5.
Session history and actual task time update.

**Business rules** - Only one active focus session per user initially;
revisit if simultaneous sessions are a real use case. - A session must
belong to a task the user is authorized to access. - Store `startedAt`,
optional `endedAt`, and pause/resume events or equivalent duration
segments. - Avoid counting paused time as focused time. - Browser
refresh or temporary disconnection must not reset the true elapsed
time. - Prevent duplicate start/finish requests from creating duplicate
sessions. - Do not rely on a JavaScript interval alone for elapsed time;
compute from stored timestamps and session state. - Define how a user
can discard or correct an accidental session and retain an audit trail
where useful.

**Initial APIs** - `POST /api/v1/tasks/:taskId/sessions` -
`POST /api/v1/sessions/:sessionId/pause` -
`POST /api/v1/sessions/:sessionId/resume` -
`POST /api/v1/sessions/:sessionId/finish` -
`GET /api/v1/sessions?from=...&to=...` -
`GET /api/v1/tasks/:taskId/sessions`

### F4. Dashboard and weekly analytics

**Metrics** - Tasks completed / planned - Total actual focus time -
Planned versus actual time - Completion rate - Goal completion - Current
and longest streak - Planning accuracy, once sufficient history exists -
Overruns and schedule changes - Week-over-week trends

**Business rules** - Define every metric precisely and calculate it
consistently. - Exclude cancelled tasks from completion denominators
unless the metric explicitly says otherwise. - Distinguish scheduled
duration from actual focused duration. - Do not imply causation from
simple correlations. - Avoid judging productivity solely by hours; make
metrics transparent and useful. - Analytics are scoped to the active
personal workspace or authorized team/project. - Empty states must
explain that more activity is needed to show trends.

**Initial APIs** - `GET /api/v1/analytics/summary?from=...&to=...` -
`GET /api/v1/analytics/daily?from=...&to=...` -
`GET /api/v1/analytics/weekly-review?week=...` -
`GET /api/v1/analytics/planning-accuracy` (after adequate data exists)

### F5. Fixed/flexible scheduling and conflict recovery

This is a primary differentiator.

**Definitions** - **Fixed task:** should not move automatically. -
**Flexible task:** can be rescheduled within its constraints. -
**Overrun:** actual work continues beyond the planned end or the user
reports that more time is needed. - **Recovery buffer:** reserved time
that can absorb small overruns without destabilizing the day.

**User flow** 1. User starts or completes a task. 2. Actual duration or
remaining-work estimate indicates an overrun. 3. Scheduler identifies
affected tasks and available slots. 4. It creates a proposed recovery
plan. 5. User sees the reason for each proposed move and the impact on
deadlines. 6. Flexible tasks may be shifted automatically only when the
user has enabled that preference and the change stays within defined
constraints; otherwise show a proposal. 7. Fixed tasks are never moved
without explicit user approval. 8. User accepts, edits, or rejects the
plan. 9. The system applies the plan atomically and records the schedule
changes.

**Initial deterministic rules** 1. Never create a new overlap for the
same person. 2. Never move a fixed task without explicit confirmation.
3. Preserve task deadlines and minimum required durations where
possible. 4. Prefer moving flexible tasks to available slots on the same
day. 5. Use recovery buffers before moving other tasks, if a suitable
buffer exists. 6. Minimize the number of changed tasks. 7. Prefer the
smallest schedule displacement. 8. Respect user working hours, breaks,
and configured unavailable periods. 9. If no safe plan exists, explain
why and offer alternatives instead of silently forcing a schedule. 10.
Return a proposed plan with before/after times and reasons.

**Initial APIs** - `POST /api/v1/scheduling/analyze` -
`POST /api/v1/scheduling/proposals` -
`GET /api/v1/scheduling/proposals/:proposalId` -
`POST /api/v1/scheduling/proposals/:proposalId/accept` -
`POST /api/v1/scheduling/proposals/:proposalId/reject` -
`GET /api/v1/scheduling/conflicts?from=...&to=...`

**Technical safeguards** - Apply a proposal in a database transaction. -
Revalidate affected tasks immediately before applying, because the
schedule may have changed since the proposal was generated. - Use
versioning or optimistic concurrency checks to prevent stale proposals
overwriting newer edits. - Record the original and new times, reason,
actor, and timestamp. - Provide an undo path where feasible.

### F6. Links, notes, and file attachments

**Resource types** - Website link - YouTube video/playlist - Note -
Uploaded file (PDF, document, image, within configured limits)

**User flow** 1. Add a resource to a task. 2. Validate its type and
metadata. 3. Store notes/URLs or upload the file to the configured
storage adapter. 4. Show the resource on the task page. 5. Enforce the
same access scope as the parent task.

**Business rules** - A resource cannot be more visible than its parent
task. - Validate URL schemes and reject unsafe schemes such as
`javascript:`. - Restrict file size and allowed content types; do not
trust only the filename or browser-provided MIME type. - Store files
outside the public web root; use authenticated access or short-lived
signed links if object storage is used later. - Do not require AWS/S3
for the core application. Start with a local development storage adapter
and define an interface that can later be replaced. - Treat file uploads
as untrusted input and consider malware scanning before production use.

**Initial APIs** - `POST /api/v1/tasks/:taskId/resources` -
`GET /api/v1/tasks/:taskId/resources` -
`PATCH /api/v1/resources/:resourceId` -
`DELETE /api/v1/resources/:resourceId` -
`POST /api/v1/tasks/:taskId/resources/files` (multipart upload) -
`GET /api/v1/resources/:resourceId/file` (authorized download/stream)

### F7. Dark/light theme

**Behavior** - Dark navy + golden-yellow is the default. - Light theme
uses the same golden accent with warm off-white and white surfaces. -
Theme toggle is available from the global header/settings. - Theme
preference persists locally and can later be synchronized to the user's
account. - All components use shared design tokens; no page hardcodes a
conflicting palette. - Check contrast for text, buttons, disabled
states, charts, and focus outlines.

**Initial APIs:** none required if stored locally. Later the user
preference can be saved through `PATCH /api/v1/users/me/preferences`.

### F8. Team Mode, invitations, and shared projects

**User flow** 1. User creates a team and becomes its owner. 2. Owner
invites a person by email or through a secure invitation link. 3.
Invitee accepts while authenticated or after registration. 4. Team
members create projects and shared tasks. 5. Tasks are assigned to
active team members. 6. Members see permitted team tasks and project
progress. 7. Owner/admin can manage membership and roles.

**Business rules** - Use unguessable, expiring invitation tokens; store
only a secure hash of the token where practical. - Invitations can be
accepted once and must be revocable. - Check membership on every team
resource request. - Removing a member revokes future access
immediately. - Personal tasks remain private. - Define behavior for
projects/tasks when a member leaves or a team is deleted. - Do not
expose private user analytics in team reports. - Team scheduling must
handle shared tasks and assignee calendars without silently moving other
members' fixed commitments.

**Initial APIs** - `POST /api/v1/teams` - `GET /api/v1/teams` -
`GET /api/v1/teams/:teamId` - `PATCH /api/v1/teams/:teamId` -
`POST /api/v1/teams/:teamId/invitations` -
`POST /api/v1/invitations/:token/accept` -
`DELETE /api/v1/teams/:teamId/members/:userId` -
`POST /api/v1/teams/:teamId/projects` -
`GET /api/v1/teams/:teamId/projects` - Team task operations use the same
task API pattern but enforce team membership and scope.

### F9. Recurring tasks and reminders

**Capabilities** - Daily, weekly, selected weekdays, and custom
recurrence intervals. - Start/end date for a recurrence where
applicable. - Reminders before a task starts or at a configured time. -
Notification preferences and quiet hours.

**Business rules** - Recurrence rules must have a clear time zone. -
Editing a recurring task must let the user choose: this occurrence, this
and future occurrences, or the whole series. - Avoid generating
duplicate occurrences on repeated requests. - Missed occurrences should
not silently shift every future occurrence. - Browser notifications
require permission and may not fire if the browser/device is closed. A
reliable server-side notification channel can be added later. -
Email/push delivery is an enhancement; core task data and schedules must
still work without it.

**Initial APIs** - `POST /api/v1/tasks/:taskId/recurrence` -
`PATCH /api/v1/recurrences/:recurrenceId` -
`DELETE /api/v1/recurrences/:recurrenceId` -
`GET /api/v1/notifications` -
`PATCH /api/v1/users/me/preferences/notifications` - Later:
`POST /api/v1/notifications/:notificationId/read`

### F10. Streaks, goals, and achievements

**Capabilities** - Daily/weekly focus goals - Task completion goals -
Current and longest streak - Milestone achievements - Progress
indicators

**Business rules** - Users should configure what counts toward a streak
(e.g., completing a goal or recording a minimum amount of focus time). -
Use the user's time zone to define a day. - Define how missed days,
travel, and paused goals affect streaks. - Avoid misleading or punitive
messaging. - Recalculate derived metrics from source records where
practical rather than trusting a client-side counter.

**Initial APIs** - `POST /api/v1/goals` - `GET /api/v1/goals` -
`PATCH /api/v1/goals/:goalId` - `DELETE /api/v1/goals/:goalId` -
`GET /api/v1/achievements` - `GET /api/v1/streaks/summary`

### F11. Local ML for duration prediction

**Purpose** Predict likely task duration from a user's historical data
once enough trustworthy data exists.

**Possible input features** - Task category/type - User-provided
estimate - Priority - Time of day and day of week - Historical duration
for similar tasks - Recent estimation error - Completion/interruption
history, if captured transparently

**Principles** - Begin with a simple baseline and compare ML predictions
against it. - Use only data the user has permitted the application to
use for this purpose. - Do not send personal data to a third-party AI
service by default. - Display estimates as uncertain predictions, not
facts. - Do not automatically move fixed tasks based only on ML
predictions. - Keep the core application usable if the Python service is
offline. - Add model versioning, evaluation, input validation, and a
fallback to deterministic estimates.

**Architecture** - Node/Express remains the main backend. - A separate
local Python service can expose a small internal API for predictions. -
Node calls the service with a timeout and handles failure gracefully. -
The model can initially run in development/local hosting; deployment
strategy is a later decision.

**Possible internal endpoint** - `POST /predict-duration` -
Request/response schema and service authentication must be defined
before implementation. - Do not expose an unauthenticated prediction
service to the public internet.

### F12. AI-assisted task breakdown and weekly reviews

**Capabilities** - Suggest subtasks from a large task/goal. - Draft a
weekly summary from task and timer history. - Suggest schedule
improvements and planning questions.

**Rules** - Clearly distinguish suggestions from saved changes. - Ask
for confirmation before creating many tasks or changing schedules. -
Validate generated output against a schema before using it. - Never let
generated text bypass authorization, task validation, or scheduling
rules. - Core task creation, analytics, and scheduling must work if the
AI provider is unavailable. - Provider choice, privacy terms, usage
limits, and cost controls must be evaluated before enabling a hosted
model. - If no provider is configured, offer deterministic/manual
alternatives and show the feature as unavailable rather than breaking
the app.

**Possible APIs** - `POST /api/v1/ai/task-breakdown` -
`POST /api/v1/ai/weekly-review` - Treat these as optional modules and do
not implement them before the core features are stable.

## 6. Database requirements

Use PostgreSQL with Prisma ORM. Names below are logical model names;
exact Prisma field names and migrations should be finalized in the
schema design.

### Core models

#### User

-   `id`
-   `name`
-   `email` (unique, normalized)
-   `passwordHash`
-   `timezone`
-   `createdAt`
-   `updatedAt`

#### UserPreference

-   `id`
-   `userId` (unique relation)
-   `defaultWorkspaceMode` (PERSONAL or TEAM)
-   `theme` (DARK or LIGHT)
-   `workingHours` / availability settings, modeled in a structured way
-   `notificationPreferences`
-   `createdAt`
-   `updatedAt`

#### Team

-   `id`
-   `name`
-   `ownerId`
-   `createdAt`
-   `updatedAt`

#### TeamMembership

-   `id`
-   `teamId`
-   `userId`
-   `role`
-   `status`
-   `joinedAt`
-   Unique constraint on `(teamId, userId)`

#### TeamInvitation

-   `id`
-   `teamId`
-   `invitedEmail`
-   `tokenHash`
-   `role`
-   `expiresAt`
-   `acceptedAt`
-   `revokedAt`
-   `createdById`
-   `createdAt`

#### Project

-   `id`
-   `name`
-   `description`
-   `scope` (PERSONAL or TEAM)
-   `ownerId`
-   nullable `teamId`
-   `createdAt`
-   `updatedAt`

#### Task

-   `id`
-   `title`
-   `description`
-   `scope` (PERSONAL or TEAM)
-   `ownerId`
-   nullable `teamId`
-   nullable `projectId`
-   `date` / scheduled start and end timestamps
-   `deadlineAt` (optional)
-   `estimatedDurationMinutes`
-   `priority`
-   `status`
-   `scheduleType` (FIXED or FLEXIBLE)
-   `createdAt`
-   `updatedAt`
-   optional `version` for optimistic concurrency

Use a consistent representation for scheduled times. Prefer
timestamp-aware instants for actual moments plus a user/team time-zone
setting for calendar interpretation. Do not store a local time without
enough context if it must identify a unique instant.

#### TaskAssignee

-   `id`
-   `taskId`
-   `userId`
-   `assignedById`
-   `createdAt`
-   Unique constraint on `(taskId, userId)`

#### TimerSession

-   `id`
-   `taskId`
-   `userId`
-   `startedAt`
-   `endedAt` (nullable while active)
-   `status`
-   `createdAt`
-   `updatedAt`

#### TimerSegment or SessionEvent

-   `id`
-   `sessionId`
-   `eventType` (PAUSE, RESUME, FINISH, etc.)
-   `occurredAt`
-   Used to calculate active duration correctly and preserve
    pause/resume history.

#### Resource

-   `id`
-   `taskId`
-   `title`
-   `type`
-   `url` (nullable)
-   `storageKey` (nullable)
-   `fileName` (nullable)
-   `mimeType` (nullable)
-   `sizeBytes` (nullable)
-   `createdById`
-   `createdAt`
-   `updatedAt`

#### ScheduleProposal

-   `id`
-   `userId`
-   `status` (PENDING, ACCEPTED, REJECTED, EXPIRED, STALE)
-   `reason`
-   `createdAt`
-   `expiresAt`
-   `acceptedAt`

#### ScheduleProposalItem

-   `id`
-   `proposalId`
-   `taskId`
-   `oldStartAt`
-   `oldEndAt`
-   `newStartAt`
-   `newEndAt`
-   `reason`

#### ScheduleChange

-   `id`
-   `taskId`
-   `actorId`
-   `proposalId` (nullable)
-   `oldStartAt`
-   `oldEndAt`
-   `newStartAt`
-   `newEndAt`
-   `reason`
-   `createdAt`

#### Goal

-   `id`
-   `userId`
-   nullable `teamId`
-   `type`
-   `targetValue`
-   `period`
-   `startsAt`
-   `endsAt`
-   `createdAt`
-   `updatedAt`

#### RecurrenceRule

-   `id`
-   `taskId` or series identifier
-   recurrence configuration (structured fields or a validated rule)
-   `timezone`
-   `startsAt`
-   nullable `endsAt`
-   `createdAt`
-   `updatedAt`

#### Notification

-   `id`
-   `userId`
-   `type`
-   `title`
-   `message`
-   `scheduledAt`
-   `readAt`
-   `deliveryStatus`
-   `createdAt`

#### Achievement

-   `id`
-   `code` (unique)
-   `name`
-   `description`
-   `criteria` (versioned/configured data)

#### UserAchievement

-   `id`
-   `userId`
-   `achievementId`
-   `earnedAt`
-   Unique constraint on `(userId, achievementId)`

#### Audit/event records

For important operations such as membership changes, accepted schedule
changes, and security-sensitive actions, record a minimal audit event
without secrets or unnecessary personal content.

### Data modeling decisions

-   Use foreign keys and database constraints for integrity.
-   Add indexes for frequent queries: tasks by owner/date, tasks by
    team/project/date, sessions by user/start time, and memberships by
    team/user.
-   Use transactions for multi-record operations such as accepting a
    schedule proposal or creating a team with its owner membership.
-   Decide deletion policy explicitly. Prefer soft deletion or
    controlled archival where historical analytics depend on records.
-   Do not store derived analytics as the source of truth unless later
    performance measurements justify a cache.
-   Avoid over-normalizing the first schema; keep it understandable and
    migrate incrementally.
-   Use Prisma migrations and commit migration files to version control.
-   Never commit production secrets or `.env` files.

## 7. API conventions

Base path: `/api/v1`

### General conventions

-   JSON request/response bodies, except file uploads/downloads.
-   Consistent status codes and error format.
-   Validate request bodies, route parameters, and query parameters.
-   Authenticate protected requests and authorize the specific resource.
-   Use pagination for potentially large lists.
-   Use ISO-8601 timestamps with explicit time-zone offsets in API
    contracts.
-   Define sorting and filtering parameters explicitly.
-   Avoid returning password hashes, token hashes, internal secrets, or
    unnecessary personal data.
-   Use idempotency or duplicate-request protection for operations where
    retries can cause harm.

### Example error response

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The task end time must be after its start time.",
    "details": [
      {
        "field": "endAt",
        "issue": "Must be later than startAt"
      }
    ],
    "requestId": "request-id"
  }
}
```

### API groups

-   Authentication and user settings
-   Tasks and calendar
-   Timer sessions
-   Resources and files
-   Scheduling proposals and conflicts
-   Analytics and weekly review
-   Goals, streaks, and achievements
-   Teams, invitations, projects, and assignments
-   Notifications
-   Optional AI and ML integration

The endpoint lists in each feature section are the initial contract
candidates. Confirm the final request/response schema before
implementing each feature.

## 8. Backend code architecture

Use feature-oriented modules with clear responsibilities:

``` text
backend/
  src/
    app.js
    server.js
    config/
      env.js
      database.js
    middleware/
      authenticate.js
      authorize.js
      validate.js
      errorHandler.js
      rateLimit.js
    modules/
      auth/
        auth.routes.js
        auth.controller.js
        auth.service.js
        auth.validation.js
      users/
      tasks/
      timer/
      resources/
      scheduling/
      analytics/
      goals/
      notifications/
      teams/
      projects/
      ai/
    shared/
      errors/
      utils/
      constants/
  prisma/
    schema.prisma
    migrations/
  tests/
```

Responsibilities: - **Routes:** map HTTP methods/paths to controllers
and attach middleware. - **Controllers:** parse validated inputs, call
services, and return responses. - **Services:** implement business rules
and transactions. - **Data access:** Prisma queries and database
operations, kept out of UI and preferably out of complex controllers. -
**Middleware:** authentication, authorization, validation, rate
limiting, and error handling. - **Tests:** verify behavior and prevent
regressions.

Keep modules small. Do not create empty abstractions everywhere just for
the appearance of architecture; introduce shared utilities when they
have real use.

## 9. Frontend architecture

Suggested structure:

``` text
frontend/
  src/
    app/
      router.jsx
      providers/
    components/
      ui/
      layout/
      feedback/
    features/
      auth/
      dashboard/
      tasks/
      calendar/
      focus/
      analytics/
      resources/
      scheduling/
      goals/
      teams/
      settings/
    services/
      apiClient.js
    hooks/
    styles/
      tokens.css
    utils/
```

Frontend requirements: - Keep API calls in a shared client layer. -
Handle loading, empty, success, and error states. - Do not treat
frontend route guards as security; the server is authoritative. - Use
reusable buttons, forms, dialogs, cards, tables, calendar elements, and
notification components. - Centralize theme tokens and theme
switching. - Avoid fake/demo metrics in production views. Clearly label
seed data if used for development. - Ensure forms are keyboard
accessible and errors are associated with fields. - Protect against
duplicate form submissions and provide clear success/error feedback.

## 10. Non-functional requirements

### Security

-   Hash passwords with a reputable password-hashing algorithm.
-   Keep secrets in environment variables.
-   Validate and sanitize untrusted inputs.
-   Use HTTPS in deployment.
-   Configure CORS narrowly for the real frontend origin.
-   Rate-limit authentication and sensitive endpoints.
-   Apply authorization at the service/resource level.
-   Secure uploads and invitations.
-   Avoid logging tokens, passwords, private notes, or uploaded content.

### Reliability

-   Centralized error handling.
-   Health endpoint for deployment diagnostics.
-   Database migrations run in a controlled deployment step.
-   Graceful handling of unavailable optional ML/AI services.
-   Database transactions for operations that must be atomic.
-   Backups and recovery procedures before production use.

### Performance

-   Paginate task/session lists.
-   Index common filtering and date-range queries.
-   Avoid loading all historical sessions for every dashboard render.
-   Add caching only after measuring a real bottleneck.

### Accessibility and usability

-   Readable contrast in both themes.
-   Keyboard navigation and visible focus states.
-   Clear form labels and validation errors.
-   Do not rely on color alone to convey status.
-   Respect reduced-motion preferences.
-   Responsive layouts for desktop and mobile.

### Observability

-   Structured server logs with request IDs.
-   Useful error logs without sensitive data.
-   Basic health checks.
-   Optional performance/error monitoring later.

## 11. Testing strategy

Each feature should include tests before it is considered complete.

### Unit tests

-   Task time validation and status transitions
-   Fixed/flexible scheduling rules
-   Duration calculations and pause/resume
-   Analytics calculations
-   Permission checks
-   Recurrence generation
-   Streak and goal calculations

### Integration tests

-   API + database operations
-   Registration/login and protected endpoints
-   Task ownership isolation
-   Team membership and access revocation
-   Resource/file authorization
-   Schedule proposal acceptance and stale proposal handling

### End-to-end tests

-   Register, log in, create task, start timer, finish task, view weekly
    review
-   Detect conflict and accept/reject recovery plan
-   Toggle theme and verify persistence
-   Create team, invite member, assign shared task
-   Verify a teammate cannot access private tasks
-   Verify optional ML outage does not break core workflows

### Minimum acceptance criteria

-   No user can read or mutate another user's private data.
-   Fixed tasks are never moved without approval.
-   Schedule proposals are revalidated before application.
-   Timer duration is calculated correctly across pause/resume and
    refresh.
-   Analytics match the underlying task/session records.
-   Core task management and scheduling work without ML/AI.
-   Both themes are usable and consistent.

## 12. Phased implementation plan

### Phase 0 --- Specification and design

-   Confirm requirements and user flows.
-   Finalize ER diagram and Prisma schema.
-   Finalize API request/response contracts.
-   Define the design tokens and main page wireframes.
-   Create the project architecture and implementation checklist.

**Exit criteria:** no major ambiguous rules remain for the first
vertical slice.

### Phase 1 --- Project foundation

-   Create frontend and backend projects.
-   Configure environment variables and PostgreSQL.
-   Configure Prisma and first migration.
-   Add shared API/error patterns.
-   Add theme tokens and responsive app shell.
-   Add basic health endpoint and tests.

**Exit criteria:** app starts locally, database connects, migrations
run, health check passes.

### Phase 2 --- Authentication and private tasks

-   Registration/login/logout/current-user flow.
-   Secure protected API middleware.
-   Task CRUD and task validation.
-   Basic daily/weekly calendar.
-   Ownership isolation tests.

**Exit criteria:** authenticated users can manage their own tasks and
cannot access another user's tasks.

### Phase 3 --- Timer and tracking

-   Start/pause/resume/finish sessions.
-   Persist session events/timestamps.
-   Task actual-duration calculations.
-   Timer UI and session history.

**Exit criteria:** elapsed focus time remains correct after refresh and
pause/resume.

### Phase 4 --- Dashboard and weekly review

-   Summary cards and daily progress.
-   Planned versus actual time.
-   Completion metrics and streak basics.
-   Weekly review page with accurate empty states.

**Exit criteria:** displayed numbers reconcile with database records.

### Phase 5 --- Deterministic scheduling

-   Conflict detection.
-   Fixed/flexible rules.
-   Working hours and recovery buffers.
-   Proposal preview, accept/reject, transaction, audit trail, and undo
    where possible.

**Exit criteria:** tests prove fixed tasks are protected and no
conflicting schedule is applied.

### Phase 6 --- Resources, goals, recurrence, reminders

-   Task links/notes/uploads.
-   Goals and achievements.
-   Recurring task generation.
-   Notification preferences and initial reminder mechanism.

**Exit criteria:** access rules, duplicate prevention, and time-zone
behavior are tested.

### Phase 7 --- Team Mode

-   Team creation, membership and invitations.
-   Projects and task assignments.
-   Shared calendar and team analytics.
-   Team permission tests and privacy isolation.

**Exit criteria:** team collaboration works without exposing private
personal content.

### Phase 8 --- Local ML

-   Define and collect suitable historical features.
-   Build a simple baseline predictor.
-   Train/evaluate a local model against the baseline.
-   Add optional prediction service and fallback behavior.

**Exit criteria:** prediction quality is measured, outputs are treated
as estimates, and app remains functional when the service is
unavailable.

### Phase 9 --- Optional generative AI and production hardening

-   Task breakdown and weekly-review drafts.
-   Explicit confirmation before applying generated suggestions.
-   Security review, deployment configuration, backups, accessibility
    and end-to-end testing.

**Exit criteria:** optional AI is isolated from core business rules and
the product is documented for demonstration.

## 13. Antigravity working agreement

Do not ask the coding agent to implement the entire application in one
prompt.

For each phase: 1. Read this specification and the relevant design docs.
2. Inspect the existing repository before changing files. 3. Propose a
short implementation plan and list files to create/change. 4. Implement
one vertical slice only. 5. Add or update tests. 6. Run lint, tests, and
relevant build checks. 7. Report changed files, commands run, results,
known limitations, and next steps. 8. Stop and ask before making
destructive changes, changing major architecture, adding paid services,
or introducing new dependencies with meaningful security/cost
implications.

The agent must not: - invent successful test results; - remove existing
work without approval; - hardcode credentials; - bypass validation or
authorization; - use fake analytics as real user data; - implement
automatic fixed-task movement; - make ML/AI required for core
operations.

## 14. Initial definition of done

The first portfolio-ready MVP is complete when a user can: 1. Register
and log in securely. 2. Create, edit, complete, and schedule personal
tasks. 3. Run a focus timer and retain accurate session history. 4. View
meaningful daily and weekly productivity metrics. 5. Detect scheduling
conflicts and review recovery proposals. 6. Add resources to tasks. 7.
switch between dark and light themes. 8. Create a team and share project
tasks without exposing private personal data. 9. Set recurring tasks,
reminders, and goals. 10. Run all core features without a hosted AI
service.

Local ML and generative AI are advanced milestones after the above
workflows are stable and tested.

------------------------------------------------------------------------

## Open decisions to resolve during design

These should be explicitly decided before their respective features are
implemented: - Authentication/session strategy and password reset flow -
Whether email verification is required for the first release - Time-zone
and working-hours settings - Exact task status transition rules -
Whether one active timer per user is enforced - Team role model and
invitation expiry - File storage adapter and upload limits - Recurrence
rule format and editing behavior - Notification delivery mechanism -
Scheduling optimization priorities and user-configurable preferences -
ML training data threshold, evaluation metrics, and privacy controls -
Deployment platform and production environment configuration

This specification is a baseline. Update it when decisions change, and
keep the code, migrations, tests, and documentation aligned.
