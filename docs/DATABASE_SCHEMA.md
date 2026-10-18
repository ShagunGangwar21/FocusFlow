# FocusFlow Database Schema Specification

**Document Status:** Finalized Design Baseline (Updated & Verified)  
**ORM / Database:** Prisma ORM with PostgreSQL (v15+)  
**Primary Key Convention:** CUID (`@default(cuid())`) for URL-safe, secure, sortable identifiers without IDOR risk.  
**Timestamp Standard:** UTC timestamps (`TIMESTAMPTZ` via Prisma `DateTime @db.Timestamptz`) paired with IANA time-zone strings stored in user preferences.

---

## 1. Architectural & Privacy Constraints in Schema

1. **Privacy Boundary Enforcement**:
   - `Task` records have an explicit `scope` (`PERSONAL` or `TEAM`).
   - Personal tasks (`scope = 'PERSONAL'`) must have `teamId = null` and strictly reference `ownerId`.
   - Team tasks (`scope = 'TEAM'`) require a valid `teamId`. Team membership checks are enforced in service logic before queries or mutations.
2. **Single Active Focus Timer Rule (Concurrency-Safe)**:
   - Each user may have at most **one** active (`RUNNING` or `PAUSED`) focus timer at any given moment.
   - Concurrency safety is enforced at the database engine level via a PostgreSQL partial unique index:
     ```sql
     CREATE UNIQUE INDEX unique_active_timer_per_user 
     ON "TimerSession" ("userId") 
     WHERE "status" IN ('RUNNING', 'PAUSED');
     ```
3. **Idempotent Recurring Tasks (Rolling 30-Day Window)**:
   - Recurrence rules are configured via `RecurrenceRule`, linked to the owning `User`.
   - Concrete task instances are materialized in PostgreSQL up to 30 days into the future.
   - Guaranteed idempotent across concurrent worker runs via a compound unique constraint: `@@unique([recurrenceRuleId, recurrenceInstanceDate])` paired with `ON CONFLICT DO NOTHING` / `skipDuplicates: true`.
4. **Schedule Recovery Invariant & Optimistic Concurrency**:
   - `Task` includes a `scheduleType` (`FIXED` vs. `FLEXIBLE`) and a `version Int @default(1)` field.
   - When accepting a `ScheduleProposal`, the update runs inside a database transaction (`$transaction`). The service re-reads the latest `scheduleType` of every affected task. **Fixed tasks are never moved automatically without explicit, task-specific confirmation in `acceptedFixedTaskIds`**. If any task's version has drifted, the transaction aborts with `409 Conflict`.

---

## 2. Complete Prisma Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ----------------------------------------------------
// ENUMS
// ----------------------------------------------------

enum Scope {
  PERSONAL
  TEAM
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  PARTIAL
  MISSED
  CANCELLED
}

enum ScheduleType {
  FIXED     // Invariant: Never moved automatically by scheduler
  FLEXIBLE  // Can be shifted within working hours / buffers upon user approval
}

enum TimerSessionStatus {
  RUNNING
  PAUSED
  COMPLETED
  DISCARDED
}

enum TimerEventType {
  START
  PAUSE
  RESUME
  FINISH
  DISCARD
}

enum ResourceType {
  LINK
  YOUTUBE
  NOTE
  FILE
}

enum ProposalStatus {
  PENDING
  ACCEPTED
  REJECTED
  EXPIRED
  STALE
}

enum TeamRole {
  OWNER
  ADMIN
  MEMBER
}

enum MembershipStatus {
  ACTIVE
  INVITED
  SUSPENDED
}

enum GoalType {
  FOCUS_TIME
  TASK_COMPLETION
}

enum GoalPeriod {
  DAILY
  WEEKLY
}

enum RecurrenceFrequency {
  DAILY
  WEEKDAYS
  WEEKLY
  CUSTOM
}

enum NotificationType {
  SCHEDULE_OVERRUN
  TASK_REMINDER
  RECOVERY_PROPOSAL
  TEAM_INVITE
  GOAL_MILESTONE
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

// ----------------------------------------------------
// USER & PREFERENCES
// ----------------------------------------------------

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  timezone     String   @default("UTC")
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  // Relations
  preferences       UserPreference?
  ownedTeams        Team[]             @relation("TeamOwner")
  teamMemberships   TeamMembership[]
  assignedTasks     TaskAssignee[]
  ownedProjects     Project[]
  tasks             Task[]             @relation("TaskOwner")
  timerSessions     TimerSession[]
  goals             Goal[]
  recurrenceRules   RecurrenceRule[]   @relation("RecurrenceOwner")
  scheduleProposals ScheduleProposal[]
  scheduleChanges   ScheduleChange[]   @relation("ActorScheduleChange")
  resources         Resource[]         @relation("ResourceCreator")
  notifications     Notification[]
  achievements      UserAchievement[]
  sentInvitations   TeamInvitation[]   @relation("InviteCreator")

  @@index([email])
}

model UserPreference {
  id                      String   @id @default(cuid())
  userId                  String   @unique
  user                    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  defaultWorkspaceMode    Scope    @default(PERSONAL)
  theme                   String   @default("DARK") // "DARK" | "LIGHT"
  
  // Working hours configuration (JSON schema: { enabled: bool, start: "09:00", end: "17:00", days: [1,2,3,4,5] })
  workingHours            Json     @default("{\"enabled\": true, \"start\": \"09:00\", \"end\": \"17:00\", \"days\": [1,2,3,4,5]}")
  
  // Default buffer between tasks in minutes
  recoveryBufferMinutes   Int      @default(15)
  autoRescheduleFlexible  Boolean  @default(false)
  notificationPreferences Json     @default("{\"inApp\": true, \"overrunWarning\": true}")
  
  createdAt               DateTime @default(now()) @db.Timestamptz
  updatedAt               DateTime @updatedAt @db.Timestamptz
}

// ----------------------------------------------------
// TEAMS & COLLABORATION
// ----------------------------------------------------

model Team {
  id        String   @id @default(cuid())
  name      String
  ownerId   String
  owner     User     @relation("TeamOwner", fields: [ownerId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  memberships TeamMembership[]
  invitations TeamInvitation[]
  projects    Project[]
  tasks       Task[]
  goals       Goal[]

  @@index([ownerId])
}

model TeamMembership {
  id        String           @id @default(cuid())
  teamId    String
  userId    String
  role      TeamRole         @default(MEMBER)
  status    MembershipStatus @default(ACTIVE)
  joinedAt  DateTime         @default(now()) @db.Timestamptz
  createdAt DateTime         @default(now()) @db.Timestamptz
  updatedAt DateTime         @updatedAt @db.Timestamptz

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId])
  @@index([teamId, role])
}

model TeamInvitation {
  id           String    @id @default(cuid())
  teamId       String
  team         Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  invitedEmail String
  tokenHash    String    @unique // SHA-256 hash of token
  role         TeamRole  @default(MEMBER)
  expiresAt    DateTime  @db.Timestamptz
  acceptedAt   DateTime? @db.Timestamptz
  revokedAt    DateTime? @db.Timestamptz
  createdById  String
  createdBy    User      @relation("InviteCreator", fields: [createdById], references: [id], onDelete: Cascade)
  createdAt    DateTime  @default(now()) @db.Timestamptz

  @@index([invitedEmail])
  @@index([tokenHash])
  @@index([teamId, expiresAt])
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  scope       Scope    @default(PERSONAL)
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  teamId      String?
  team        Team?    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tasks Task[]

  @@index([ownerId])
  @@index([teamId])
}

// ----------------------------------------------------
// TASKS, ASSIGNMENTS & RECURRENCE
// ----------------------------------------------------

model Task {
  id                       String       @id @default(cuid())
  title                    String
  description              String?
  scope                    Scope        @default(PERSONAL)
  ownerId                  String
  owner                    User         @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  teamId                   String?
  team                     Team?        @relation(fields: [teamId], references: [id], onDelete: Cascade)
  projectId                String?
  project                  Project?     @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // Timing & Scheduling
  startAt                  DateTime?    @db.Timestamptz
  endAt                    DateTime?    @db.Timestamptz
  deadlineAt               DateTime?    @db.Timestamptz
  estimatedDurationMinutes  Int          @default(30)
  priority                 Priority     @default(MEDIUM)
  status                   TaskStatus   @default(PENDING)
  scheduleType             ScheduleType @default(FLEXIBLE)
  
  // Completion & Actual Time tracking
  completedAt              DateTime?    @db.Timestamptz
  actualDurationMinutes    Int?
  
  // Optimistic locking for atomic schedule proposals
  version                  Int          @default(1)
  
  // Recurrence connection (guarantees idempotency via compound unique constraint)
  recurrenceRuleId         String?
  recurrenceRule           RecurrenceRule? @relation(fields: [recurrenceRuleId], references: [id], onDelete: SetNull)
  recurrenceInstanceDate   DateTime?    @db.Date
  
  createdAt                DateTime     @default(now()) @db.Timestamptz
  updatedAt                DateTime     @updatedAt @db.Timestamptz

  // Relations
  assignees            TaskAssignee[]
  timerSessions        TimerSession[]
  resources            Resource[]
  proposalItems        ScheduleProposalItem[]
  scheduleChanges      ScheduleChange[]

  // High-frequency query indexes
  @@unique([recurrenceRuleId, recurrenceInstanceDate])
  @@index([ownerId, startAt, endAt])
  @@index([teamId, startAt, endAt])
  @@index([ownerId, status])
  @@index([ownerId, completedAt])
  @@index([scope, ownerId])
}

model TaskAssignee {
  id           String   @id @default(cuid())
  taskId       String
  task         Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignedById String
  createdAt    DateTime @default(now()) @db.Timestamptz

  @@unique([taskId, userId])
  @@index([userId])
  @@index([taskId])
}

model RecurrenceRule {
  id            String              @id @default(cuid())
  ownerId       String
  owner         User                @relation("RecurrenceOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  teamId        String?
  sourceTaskId  String?             // Template task ID
  frequency     RecurrenceFrequency
  interval      Int                 @default(1) // Every N days/weeks
  daysOfWeek    Int[]               // [0 = Sunday, 1 = Monday, ...]
  timezone      String              @default("UTC")
  startsAt      DateTime            @db.Timestamptz
  endsAt        DateTime?           @db.Timestamptz
  createdAt     DateTime            @default(now()) @db.Timestamptz
  updatedAt     DateTime            @updatedAt @db.Timestamptz

  generatedTasks Task[]

  @@index([ownerId])
  @@index([teamId])
}

// ----------------------------------------------------
// TIMER SESSIONS & DURATIONS
// ----------------------------------------------------

model TimerSession {
  id              String             @id @default(cuid())
  taskId          String
  task            Task               @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId          String
  user            User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  status          TimerSessionStatus @default(RUNNING)
  startedAt       DateTime           @default(now()) @db.Timestamptz
  endedAt         DateTime?          @db.Timestamptz
  
  // Cached active duration in seconds (computed from segments on finish)
  durationSeconds Int                @default(0)
  
  createdAt       DateTime           @default(now()) @db.Timestamptz
  updatedAt       DateTime           @updatedAt @db.Timestamptz

  segments        TimerSegment[]

  @@index([userId, startedAt])
  @@index([taskId, startedAt])
  @@index([userId, status])
}

model TimerSegment {
  id         String         @id @default(cuid())
  sessionId  String
  session    TimerSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  eventType  TimerEventType
  occurredAt DateTime       @default(now()) @db.Timestamptz

  @@index([sessionId, occurredAt])
}

// ----------------------------------------------------
// RESOURCES & ATTACHMENTS
// ----------------------------------------------------

model Resource {
  id          String       @id @default(cuid())
  taskId      String
  task        Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  title       String
  type        ResourceType
  url         String?      // Links & YouTube
  noteContent String?      // Inlined markdown text for notes
  storageKey  String?      // Local file system relative key
  fileName    String?
  mimeType    String?
  sizeBytes   Int?
  createdById String
  createdBy   User         @relation("ResourceCreator", fields: [createdById], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now()) @db.Timestamptz
  updatedAt   DateTime     @updatedAt @db.Timestamptz

  @@index([taskId])
  @@index([createdById])
}

// ----------------------------------------------------
// SCHEDULING RECOVERY & AUDIT
// ----------------------------------------------------

model ScheduleProposal {
  id          String         @id @default(cuid())
  userId      String
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  status      ProposalStatus @default(PENDING)
  reason      String         // e.g. "Overrun of 35 mins on task 'Research Architecture'"
  expiresAt   DateTime       @db.Timestamptz
  acceptedAt  DateTime?      @db.Timestamptz
  createdAt   DateTime       @default(now()) @db.Timestamptz

  items       ScheduleProposalItem[]
  appliedLogs ScheduleChange[]

  @@index([userId, status, expiresAt])
}

model ScheduleProposalItem {
  id              String           @id @default(cuid())
  proposalId      String
  proposal        ScheduleProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  taskId          String
  task            Task             @relation(fields: [taskId], references: [id], onDelete: Cascade)
  oldStartAt      DateTime?        @db.Timestamptz
  oldEndAt        DateTime?        @db.Timestamptz
  newStartAt      DateTime         @db.Timestamptz
  newEndAt        DateTime         @db.Timestamptz
  reason          String           // Specific displacement rationale
  isFixed         Boolean          @default(false)
  requiresConsent Boolean          @default(false)

  @@index([proposalId])
  @@index([taskId])
}

model ScheduleChange {
  id         String            @id @default(cuid())
  taskId     String
  task       Task              @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actorId    String
  actor      User              @relation("ActorScheduleChange", fields: [actorId], references: [id], onDelete: Cascade)
  proposalId String?
  proposal   ScheduleProposal? @relation(fields: [proposalId], references: [id], onDelete: SetNull)
  oldStartAt DateTime?         @db.Timestamptz
  oldEndAt   DateTime?         @db.Timestamptz
  newStartAt DateTime?         @db.Timestamptz
  newEndAt   DateTime?         @db.Timestamptz
  reason     String
  createdAt  DateTime          @default(now()) @db.Timestamptz

  @@index([taskId, createdAt])
  @@index([actorId, createdAt])
}

// ----------------------------------------------------
// GOALS, STREAKS & ACHIEVEMENTS
// ----------------------------------------------------

model Goal {
  id          String     @id @default(cuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  teamId      String?
  team        Team?      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  type        GoalType
  targetValue Int        // Minutes for FOCUS_TIME or count for TASK_COMPLETION
  period      GoalPeriod
  startsAt    DateTime   @db.Timestamptz
  endsAt      DateTime?  @db.Timestamptz
  createdAt   DateTime   @default(now()) @db.Timestamptz
  updatedAt   DateTime   @updatedAt @db.Timestamptz

  @@index([userId, period])
  @@index([teamId])
}

model Achievement {
  id          String            @id @default(cuid())
  code        String            @unique // e.g. "FIRST_FLOW_HOUR", "STREAK_7_DAYS"
  name        String
  description String
  badgeIcon   String
  criteria    Json
  createdAt   DateTime          @default(now()) @db.Timestamptz

  users       UserAchievement[]
}

model UserAchievement {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievementId String
  achievement   Achievement @relation(fields: [achievementId], references: [id], onDelete: Cascade)
  earnedAt      DateTime    @default(now()) @db.Timestamptz

  @@unique([userId, achievementId])
  @@index([userId])
}

// ----------------------------------------------------
// NOTIFICATIONS
// ----------------------------------------------------

model Notification {
  id             String           @id @default(cuid())
  userId         String
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type           NotificationType
  title          String
  message        String
  metadata       Json?            // e.g. { taskId: "...", proposalId: "..." }
  scheduledAt    DateTime         @default(now()) @db.Timestamptz
  readAt         DateTime?        @db.Timestamptz
  deliveryStatus DeliveryStatus   @default(DELIVERED)
  createdAt      DateTime         @default(now()) @db.Timestamptz

  @@index([userId, readAt])
  @@index([userId, scheduledAt])
}
```

---

## 3. Custom SQL Migrations (`prisma/migrations/.../migration.sql`)

Prisma does not natively support partial SQL indexes or `CHECK` constraints inside `schema.prisma`. These are implemented via a version-controlled custom migration file:  
`backend/prisma/migrations/20261017000000_partial_indexes_and_checks/migration.sql`

```sql
-- ====================================================================
-- 1. Partial Unique Index: Concurrency-Safe Single Active Timer
-- ====================================================================
-- Guarantees that at the database engine level, no user can have more
-- than one active focus timer (RUNNING or PAUSED) at any time.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_timer_per_user 
ON "TimerSession" ("userId") 
WHERE "status" IN ('RUNNING', 'PAUSED');

-- ====================================================================
-- 2. Domain Integrity Check: Task Scheduled Dates
-- ====================================================================
-- Ensures end time is strictly after start time when both are defined.
ALTER TABLE "Task" 
DROP CONSTRAINT IF EXISTS check_task_dates;

ALTER TABLE "Task" 
ADD CONSTRAINT check_task_dates 
CHECK ("endAt" IS NULL OR "startAt" IS NULL OR "endAt" > "startAt");

-- ====================================================================
-- 3. Privacy Boundary Check: Personal vs. Team Task Isolation
-- ====================================================================
-- Personal tasks must NEVER have a teamId; Team tasks MUST have a teamId.
ALTER TABLE "Task" 
DROP CONSTRAINT IF EXISTS check_task_scope;

ALTER TABLE "Task" 
ADD CONSTRAINT check_task_scope 
CHECK (
  ("scope" = 'PERSONAL' AND "teamId" IS NULL) OR 
  ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
);

-- ====================================================================
-- 4. Positive Estimations & Targets
-- ====================================================================
ALTER TABLE "Task" 
DROP CONSTRAINT IF EXISTS check_task_estimated_duration;

ALTER TABLE "Task" 
ADD CONSTRAINT check_task_estimated_duration 
CHECK ("estimatedDurationMinutes" >= 5);

ALTER TABLE "Goal" 
DROP CONSTRAINT IF EXISTS check_goal_target_value;

ALTER TABLE "Goal" 
ADD CONSTRAINT check_goal_target_value 
CHECK ("targetValue" > 0);
```

---

## 4. Concurrency & Idempotency Rules

### 4.1 Concurrency Safety for Single Active Timer
- Concurrent API requests to `POST /tasks/:taskId/sessions` are protected by `unique_active_timer_per_user`.
- If two requests run simultaneously, the second fails with PostgreSQL error `23505` (Prisma `P2002`).
- The backend catches `P2002` and converts it into a structured `409 Conflict` response with error code `ACTIVE_SESSION_EXISTS`.

### 4.2 Idempotent Rolling 30-Day Task Generation
- The compound unique constraint `@@unique([recurrenceRuleId, recurrenceInstanceDate])` ensures that recurring task occurrences can never be duplicated.
- When generating future instances, the worker executes:
  ```javascript
  await prisma.task.createMany({
    data: generatedOccurrences,
    skipDuplicates: true
  });
  ```
- Any overlap with previously materialized instances is silently ignored at the database level.

### 4.3 Transactional Fixed-Task Invariance in Schedule Proposals
- When applying a schedule proposal (`POST /scheduling/proposals/:id/accept`), execution occurs in an atomic Prisma `$transaction`:
  ```javascript
  await prisma.$transaction(async (tx) => {
    // 1. Re-read all affected tasks from the database with latest state
    const currentTasks = await tx.task.findMany({
      where: { id: { in: proposedItemIds } },
      select: { id: true, version: true, scheduleType: true }
    });

    for (const task of currentTasks) {
      // 2. Optimistic Concurrency Check
      const submitted = taskVersions.find(v => v.taskId === task.id);
      if (!submitted || submitted.version !== task.version) {
        throw new ConflictError("STALE_PROPOSAL", "Task was modified by another operation.");
      }

      // 3. Immutable Fixed-Task Guard: Re-read scheduleType
      if (task.scheduleType === 'FIXED') {
        if (!acceptedFixedTaskIds.includes(task.id)) {
          throw new UnprocessableError(
            "FIXED_TASK_CONFIRMATION_REQUIRED",
            `Task '${task.id}' is a FIXED commitment and requires explicit confirmation to be rescheduled.`
          );
        }
      }
    }

    // 4. Atomically apply proposed schedule updates and increment versions
    for (const item of proposal.items) {
      await tx.task.update({
        where: { id: item.taskId, version: item.task.version },
        data: {
          startAt: item.newStartAt,
          endAt: item.newEndAt,
          version: { increment: 1 }
        }
      });
      // 5. Write audit log
      await tx.scheduleChange.create({ ... });
    }
  });
  ```
