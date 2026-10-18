# FocusFlow API Contracts & Specifications

**Base URL:** `/api/v1`  
**Data Format:** JSON (`application/json`), except multipart uploads (`multipart/form-data`) and file streams.  
**Authentication Standard:** Secure `HttpOnly`, `SameSite=Lax`, `Secure` session cookies.  
**CSRF Defense:** Double-submit CSRF cookie pattern (`XSRF-TOKEN` cookie validated against `X-CSRF-Token` request header on mutating requests: `POST`, `PUT`, `PATCH`, `DELETE`).

---

## 1. Global Envelopes & Conventions

### 1.1 Success Response Envelope
```json
{
  "data": { ... },
  "meta": {
    "requestId": "cuid-or-uuid",
    "timestamp": "2026-10-17T12:00:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

### 1.2 Error Response Envelope
```json
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
    "requestId": "req_ck3928190"
  }
}
```

**Standard Error Codes:**
- `BAD_REQUEST`: Malformed body or parameters.
- `VALIDATION_ERROR`: Zod schema validation failed.
- `UNAUTHORIZED`: Missing or invalid session cookie.
- `FORBIDDEN`: User does not have ownership or required team permissions.
- `NOT_FOUND`: Resource does not exist or user lacks access.
- `CONFLICT`: Optimistic lock version mismatch, stale proposal, or active timer race.
- `UNPROCESSABLE_ENTITY`: Fixed task moved without explicit confirmation or domain rule broken.
- `TOO_MANY_REQUESTS`: Rate limit exceeded.
- `INTERNAL_SERVER_ERROR`: Unhandled server exception.

---

## 2. Authentication & Preferences API

### `GET /auth/csrf-token`
- **Auth:** Public.
- **Behavior:** Generates a cryptographically random CSRF token, sets readable `XSRF-TOKEN` cookie (`SameSite=Lax`), and returns token in response payload for initial frontend SPA bootstrap.
- **Status:** `200 OK`

### `POST /auth/register`
- **Auth:** Public (Rate-limited: 5 requests / min / IP).
- **Validation (Zod):**
  - `name`: string, min 2, max 100 characters.
  - `email`: string, valid email format, lowercased.
  - `password`: string, min 8, max 128 characters, at least 1 number and 1 letter.
  - `timezone`: string, optional IANA time zone (defaults to `"UTC"`).
- **Behavior:** Hashes password with Argon2id, generates user + default `UserPreference`, sets `auth_session` HttpOnly cookie and readable `XSRF-TOKEN` cookie.
- **Status:** `201 Created`

### `POST /auth/login`
- **Auth:** Public (Rate-limited: 10 requests / min / IP).
- **Validation (Zod):**
  - `email`: string, email format.
  - `password`: string, min 1.
- **Behavior:** Generic error (`"Invalid email or password"`) on non-existent email or mismatched password. Sets session cookies on success.
- **Status:** `200 OK`

### `POST /auth/logout`
- **Auth:** Authenticated.
- **Behavior:** Clears session cookies on client and invalidates server-side session token.
- **Status:** `200 OK`

### `GET /auth/me`
- **Auth:** Authenticated.
- **Response:** Current user profile and preference settings.
- **Status:** `200 OK`

### `PATCH /users/me/preferences`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `theme`: optional enum (`"DARK"`, `"LIGHT"`).
  - `defaultWorkspaceMode`: optional enum (`"PERSONAL"`, `"TEAM"`).
  - `recoveryBufferMinutes`: optional integer, 5 to 60.
  - `autoRescheduleFlexible`: optional boolean.
  - `workingHours`: optional object `{ enabled: boolean, start: "HH:mm", end: "HH:mm", days: number[] }`.
- **Status:** `200 OK`

---

## 3. Tasks & Calendar API

### `GET /tasks`
- **Auth:** Authenticated.
- **Query Params:**
  - `scope`: optional (`"PERSONAL"` | `"TEAM"`), default `"PERSONAL"`.
  - `teamId`: optional string (required if scope=TEAM).
  - `status`: optional comma-separated list of `TaskStatus`.
  - `priority`: optional `Priority`.
  - `from`, `to`: ISO timestamps for scheduled window.
  - `page`, `limit`: pagination (default 1, 20).
- **Status:** `200 OK`

### `POST /tasks`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `title`: string, min 1, max 200.
  - `description`: optional string, max 2000.
  - `scope`: enum (`"PERSONAL"`, `"TEAM"`), default `"PERSONAL"`.
  - `teamId`: string, required if `scope === "TEAM"`.
  - `projectId`: optional string.
  - `startAt`: optional ISO-8601 string.
  - `endAt`: optional ISO-8601 string (must be > `startAt` if present).
  - `deadlineAt`: optional ISO-8601 string.
  - `estimatedDurationMinutes`: integer >= 5 (default 30).
  - `priority`: enum (`"LOW"`, `"MEDIUM"`, `"HIGH"`), default `"MEDIUM"`.
  - `scheduleType`: enum (`"FIXED"`, `"FLEXIBLE"`), default `"FLEXIBLE"`.
- **Status:** `201 Created`

### `GET /tasks/:taskId`
- **Auth:** Authenticated. Checks `ownerId === user.id` OR active team membership.
- **Status:** `200 OK`

### `PATCH /tasks/:taskId`
- **Auth:** Authenticated (Owner or assigned Team Member).
- **Validation (Zod):** Partial of `POST /tasks` plus:
  - `status`: optional `TaskStatus`.
  - `version`: integer (required for optimistic concurrency protection).
- **Status:** `200 OK` (`409 Conflict` if version mismatch).

### `POST /tasks/:taskId/complete`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `actualDurationMinutes`: optional integer >= 0.
  - `completionNotes`: optional string.
- **Behavior:** Updates `status = 'COMPLETED'`, records server timestamp `completedAt = now()`, saves `actualDurationMinutes`, and finishes any active timer session on this task.
- **Status:** `200 OK`

### `DELETE /tasks/:taskId`
- **Auth:** Authenticated (Owner or Team Admin/Owner).
- **Status:** `200 OK`

### `GET /calendar`
- **Auth:** Authenticated.
- **Query Params:**
  - `from`: ISO timestamp (required).
  - `to`: ISO timestamp (required).
  - `scope`: optional (`"PERSONAL"` | `"TEAM"`).
  - `teamId`: optional string.
- **Response:** List of scheduled tasks, recurring occurrences, and scheduled focus sessions formatted for day/week/month calendar rendering.
- **Status:** `200 OK`

---

## 4. Server-Authoritative Focus Timer API

**Rule:** Exactly one active focus timer (`RUNNING` or `PAUSED`) per user globally, backed by database partial index `unique_active_timer_per_user`.

### `POST /tasks/:taskId/sessions`
- **Auth:** Authenticated. Must have task access.
- **Behavior:**
  1. Checks for existing active session.
  2. If an active session exists, returns `409 Conflict` (`ACTIVE_SESSION_EXISTS`).
  3. Inserts `TimerSession` (`status = RUNNING`, `startedAt = now()`) and first `TimerSegment` (`eventType = START`).
  4. Concurrent duplicate calls are trapped by DB unique constraint `unique_active_timer_per_user` -> `409 Conflict`.
- **Status:** `201 Created`

### `POST /sessions/:sessionId/pause`
- **Auth:** Authenticated (session owner only).
- **Behavior:** Inserts `TimerSegment` (`eventType = PAUSE`), sets `TimerSession.status = PAUSED`.
- **Status:** `200 OK`

### `POST /sessions/:sessionId/resume`
- **Auth:** Authenticated.
- **Behavior:** Inserts `TimerSegment` (`eventType = RESUME`), sets `TimerSession.status = RUNNING`.
- **Status:** `200 OK`

### `POST /sessions/:sessionId/finish`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `markTaskComplete`: optional boolean (default false).
- **Behavior:**
  1. Inserts `TimerSegment` (`eventType = FINISH`).
  2. Calculates elapsed seconds from server segment timestamps.
  3. Sets `endedAt = now()`, `durationSeconds = calculated`, `status = COMPLETED`.
  4. If `markTaskComplete = true`, sets task `status = COMPLETED`, `completedAt = now()`, and `actualDurationMinutes = round(durationSeconds / 60)`.
- **Status:** `200 OK`

### `GET /sessions/active`
- **Auth:** Authenticated.
- **Response:** Current user's active session, task details, and server-side computed elapsed seconds. Returns `null` if none.
- **Status:** `200 OK`

---

## 5. Deterministic Scheduling & Conflict Recovery API

**Rule:** Fixed tasks (`scheduleType = 'FIXED'`) are **never moved automatically**. Recovery proposals are generated deterministically and require task-specific human confirmation.

### `POST /scheduling/analyze`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `date`: ISO date string (YYYY-MM-DD).
  - `timezone`: string.
- **Response:** Identifies overlaps, overruns, and missing recovery buffers for the given date.
- **Status:** `200 OK`

### `POST /scheduling/proposals`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `overrunTaskId`: string.
  - `extensionMinutes`: integer > 0.
- **Algorithm Behavior:**
  1. Identifies tasks following `overrunTaskId`.
  2. Absorbs time into available recovery buffer first.
  3. If buffer is insufficient, identifies `FLEXIBLE` tasks and finds nearest open slots within working hours.
  4. If a `FIXED` task must be moved to avoid conflict, tags proposal item with `isFixed = true` and `requiresConsent = true`.
  5. Saves `ScheduleProposal` with `expiresAt = now() + 15 minutes` and creates `ScheduleProposalItem` records.
- **Status:** `201 Created`

### `POST /scheduling/proposals/:proposalId/accept`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `taskVersions`: array of `{ taskId: string, version: number }` (required).
  - `acceptedFixedTaskIds`: array of string (list of task IDs where the user explicitly consented to moving a FIXED task).
- **Behavior (Atomic Transaction):**
  1. Opens Prisma `$transaction`.
  2. Re-verifies proposal status is `PENDING` and not expired (`now() < expiresAt`).
  3. **Re-reads each affected task directly from DB**:
     ```javascript
     const tasks = await tx.task.findMany({ where: { id: { in: taskIds } } });
     ```
  4. Checks `version` matches submitted `taskVersions`. If changed, aborts with `409 Conflict (STALE_PROPOSAL)`.
  5. **Enforces Fixed Invariant:** For each task, checks its live `scheduleType`. If `task.scheduleType === 'FIXED'`, verifies that `acceptedFixedTaskIds.includes(task.id)`. If missing, aborts transaction with:
     ```json
     {
       "error": {
         "code": "FIXED_TASK_CONFIRMATION_REQUIRED",
         "message": "Task 'ck...1' is marked FIXED and cannot be rescheduled without explicit confirmation.",
         "details": [{ "field": "acceptedFixedTaskIds", "taskId": "ck...1" }]
       }
     }
     ```
  6. Applies new `startAt` and `endAt` to all tasks, increments `version`.
  7. Inserts records into `ScheduleChange` audit table.
  8. Marks proposal `status = ACCEPTED`.
- **Status:** `200 OK`

### `POST /scheduling/proposals/:proposalId/reject`
- **Auth:** Authenticated.
- **Status:** `200 OK` (marks proposal `REJECTED`).

---

## 6. Resources & File Storage API

### `POST /tasks/:taskId/resources`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `type`: enum (`"LINK"`, `"YOUTUBE"`, `"NOTE"`).
  - `title`: string, min 1, max 100.
  - `url`: optional URL string (rejects `javascript:` or non-http/https schemes).
  - `noteContent`: optional markdown string, max 10000 chars.
- **Status:** `201 Created`

### `POST /tasks/:taskId/resources/files`
- **Auth:** Authenticated.
- **Content-Type:** `multipart/form-data`
- **Validation:** File size <= 10MB; MIME allowlist: PDF, PNG, JPEG, TXT, DOCX.
- **Behavior:** Stores file to local directory `uploads/{userId}/{taskId}/` via abstract storage provider; creates `Resource` record with `storageKey`.
- **Status:** `201 Created`

### `GET /resources/:resourceId/file`
- **Auth:** Authenticated (verifies task ownership or team access).
- **Behavior:** Streams file content with secure `Content-Type` and `Content-Disposition`.
- **Status:** `200 OK`

---

## 7. Recurring Tasks API (Rolling 30-Day Materialization)

### `POST /tasks/:taskId/recurrence`
- **Auth:** Authenticated (Task owner only).
- **Validation (Zod):**
  - `frequency`: enum (`"DAILY"`, `"WEEKDAYS"`, `"WEEKLY"`, `"CUSTOM"`).
  - `interval`: integer >= 1.
  - `daysOfWeek`: array of integers (0 = Sunday to 6 = Saturday).
  - `startsAt`: ISO timestamp.
  - `endsAt`: optional ISO timestamp.
- **Behavior:**
  1. Creates `RecurrenceRule` with `ownerId = req.user.id` and `sourceTaskId = taskId`.
  2. Materializes recurring task instances in PostgreSQL up to `min(startsAt + 30 days, endsAt)`.
  3. Uses `prisma.task.createMany({ skipDuplicates: true })` backed by `@@unique([recurrenceRuleId, recurrenceInstanceDate])` to guarantee idempotency.
- **Status:** `201 Created`

---

## 8. Dashboard & Analytics API

### `GET /analytics/summary`
- **Auth:** Authenticated.
- **Query Params:** `from`, `to` (ISO dates), `scope` (`"PERSONAL"` | `"TEAM"`).
- **Response:**
  - `plannedMinutes`: total planned time of scheduled tasks.
  - `actualFocusMinutes`: total focused minutes from completed timer sessions.
  - `completedTasksCount`: number of completed tasks (filtered by `completedAt`).
  - `totalTasksCount`: total tasks (excluding cancelled).
  - `completionRate`: percentage float (0.0 to 100.0).
  - `overrunCount`: count of sessions exceeding estimated duration.
- **Status:** `200 OK`

### `GET /analytics/weekly-review`
- **Auth:** Authenticated.
- **Query Params:** `week` (e.g., `2026-W42`), `timezone`.
- **Response:** Comprehensive weekly dataset (daily breakdown of planned vs. actual, top tags/projects, planning accuracy percentage, streak metrics, empty-state explanation when insufficient data).
- **Status:** `200 OK`

---

## 9. Teams & Collaboration API

### `POST /teams`
- **Auth:** Authenticated.
- **Validation (Zod):** `name`: string, min 2, max 80.
- **Behavior:** Creates `Team` and adds caller as `TeamMembership (role = OWNER)`.
- **Status:** `201 Created`

### `POST /teams/:teamId/invitations`
- **Auth:** Authenticated (`OWNER` or `ADMIN` role in `teamId`).
- **Validation (Zod):**
  - `email`: string, valid email.
  - `role`: enum (`"ADMIN"`, `"MEMBER"`).
- **Behavior:** Generates a secure random 32-byte hex token. Hashes token using SHA-256 and stores in `TeamInvitation`. Returns unhashed token in response.
- **Status:** `201 Created`

### `POST /invitations/:token/accept`
- **Auth:** Authenticated.
- **Behavior:** Hashes incoming token, locates valid unexpired, unrevoked invitation. Creates `TeamMembership` with role, marks invitation `acceptedAt = now()`.
- **Status:** `200 OK`

---

## 10. Goals, Streaks & Achievements API

### `POST /goals`
- **Auth:** Authenticated.
- **Validation (Zod):**
  - `type`: enum (`"FOCUS_TIME"`, `"TASK_COMPLETION"`).
  - `targetValue`: integer > 0 (minutes or task count).
  - `period`: enum (`"DAILY"`, `"WEEKLY"`).
  - `startsAt`: ISO timestamp.
  - `endsAt`: optional ISO timestamp.
  - `teamId`: optional string.
- **Status:** `201 Created`

### `GET /goals`
- **Auth:** Authenticated.
- **Query Params:** `period` (optional), `teamId` (optional).
- **Status:** `200 OK`

### `PATCH /goals/:goalId`
- **Auth:** Authenticated (Goal owner only).
- **Validation (Zod):** Partial of `POST /goals`.
- **Status:** `200 OK`

### `DELETE /goals/:goalId`
- **Auth:** Authenticated (Goal owner only).
- **Status:** `200 OK`

### `GET /streaks/summary`
- **Auth:** Authenticated.
- **Response:**
  - `currentStreakDays`: integer.
  - `longestStreakDays`: integer.
  - `lastActiveDate`: ISO date.
  - `streakCriteria`: description of goal criteria used.
- **Status:** `200 OK`

### `GET /achievements`
- **Auth:** Authenticated.
- **Response:** List of all achievements with user's earned status and `earnedAt` timestamps.
- **Status:** `200 OK`

---

## 11. Projects & Team Membership Management API

### `POST /teams/:teamId/projects`
- **Auth:** Authenticated (`OWNER` or `ADMIN` in `teamId`).
- **Validation (Zod):**
  - `name`: string, min 1, max 100.
  - `description`: optional string.
- **Status:** `201 Created`

### `GET /teams/:teamId/projects`
- **Auth:** Authenticated (active team member).
- **Status:** `200 OK`

### `PATCH /teams/:teamId/members/:userId`
- **Auth:** Authenticated (Team `OWNER` only).
- **Validation (Zod):**
  - `role`: enum (`"ADMIN"`, `"MEMBER"`).
- **Status:** `200 OK`

### `DELETE /teams/:teamId/members/:userId`
- **Auth:** Authenticated (Team `OWNER` or member removing themselves).
- **Behavior:** Revokes membership immediately. Does not delete personal user data or shared project tasks; unassigns user from pending team tasks.
- **Status:** `200 OK`
