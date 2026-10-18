# FocusFlow — Productivity Platform

FocusFlow is a personal and team productivity platform for planning work, focusing, tracking actual time, recovering from schedule overruns, and improving future estimates.

The core product loop:
$$\text{PLAN} \longrightarrow \text{FOCUS} \longrightarrow \text{TRACK} \longrightarrow \text{ADAPT} \longrightarrow \text{IMPROVE}$$

---

## Approved Design Baseline

1. **Authentication & Security:** Secure `HttpOnly`, `SameSite=Lax`, `Secure` session cookies with double-submit CSRF cookie protection.
2. **Focus Timer Policy:** Server-authoritative duration calculation with strictly **one** active focus timer per user globally.
3. **Recurring Tasks:** Materialized concrete instances in PostgreSQL across a rolling **30-day future window**.
4. **Privacy Boundaries:** Personal tasks, timer history, notes, and analytics are isolated and never exposed to teammates by default.
5. **Schedule Recovery Invariant:** Fixed tasks (`scheduleType = 'FIXED'`) are **never** moved automatically. Conflicts and overruns generate previewable recovery proposals requiring user confirmation.
6. **Core Tech Stack:** React, Tailwind CSS, Node.js, Express, PostgreSQL, and Prisma ORM.

---

## Architecture & Design Documentation

Detailed system documentation is located in [`docs/`](file:///c:/Users/SHAJUN/Documents/Projects/FocusFlow/docs/):

- **[Database Schema & Models](file:///c:/Users/SHAJUN/Documents/Projects/FocusFlow/docs/DATABASE_SCHEMA.md)**: Complete Prisma schema, foreign keys, unique constraints, partial index for single active timer, and indexing strategy.
- **[API Contracts](file:///c:/Users/SHAJUN/Documents/Projects/FocusFlow/docs/API_CONTRACTS.md)**: RESTful `/api/v1` route definitions, Zod validation schemas, error formats, and authorization levels.
- **[Project Structure](file:///c:/Users/SHAJUN/Documents/Projects/FocusFlow/docs/PROJECT_STRUCTURE.md)**: Full folder hierarchies for `backend/` and `frontend/`, modular design, and Tailwind design tokens.
- **[Product Feature Specification](file:///c:/Users/SHAJUN/Documents/Projects/FocusFlow/focusflow-feature-specification.md)**: The foundational baseline specification and functional requirements.
