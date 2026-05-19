# Fullstack-Dev-Test-Task

Role-based access control (RBAC) layered onto the [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template). Three roles (`admin`, `manager`, `member`) gate a small but realistic surface of user-management and metrics endpoints; the frontend mirrors the same matrix with a `can()` helper and a `<RequireRole>` route guard.

- **Architectural design**: [adr/rbac-fastapi-dependencies.md](adr/rbac-fastapi-dependencies.md) (backend) · [adr/frontend-capabilities-can-helper.md](adr/frontend-capabilities-can-helper.md) (frontend)
- **Implementation plans**: [docs/superpowers/plans/](docs/superpowers/plans/)
- **Original assignment brief**: see [§ Assignment Brief](#assignment-brief) below

---

## Permission Matrix

| Action | admin | manager | member | Backend enforcement | Frontend gating |
|---|:-:|:-:|:-:|---|---|
| List all users (`GET /users/`) | ✓ | ✓ | ✗ | `require_roles(ADMIN, MANAGER)` | (existing UI) |
| Create user (`POST /users/`) | ✓ | ✗ | ✗ | `require_roles(ADMIN)` | (existing UI) |
| Update any profile (`PATCH /users/{id}`) | ✓ | ✗ | ✗ | `require_roles(ADMIN)` | (existing UI) |
| Delete user (`DELETE /users/{id}`) | ✓ | ✗ | ✗ | `require_roles(ADMIN)` | (existing UI) |
| View metrics (`GET /metrics/`) | ✓ | ✓ | ✗ | `require_roles(ADMIN, MANAGER)` | `<RequireRole action="metrics.view">` + sidebar `useCan` |
| View / update own profile (`GET/PATCH /users/me`) | ✓ | ✓ | ✓ | `CurrentUser` only (no role gate) | always visible |

Source of truth: [frontend/src/auth/permissions.ts](frontend/src/auth/permissions.ts) (frontend) and the `require_roles(...)` arguments on the route decorators in [backend/app/api/routes/users.py](backend/app/api/routes/users.py) + [backend/app/api/routes/metrics.py](backend/app/api/routes/metrics.py) (backend).

## Authorization Approach

**Where checks live.** Backend enforcement is at the FastAPI dependency boundary: a `require_roles(*allowed: Role)` factory in [backend/app/api/deps.py](backend/app/api/deps.py) returns a dependency that raises `HTTPException(403, "The user doesn't have enough privileges")` when `current_user.role` isn't in the allowed set. Routes declare `dependencies=[Depends(require_roles(Role.ADMIN, Role.MANAGER))]` on the decorator — no inline role checks in route bodies, so `rg "require_roles"` enumerates every protected route. The error string and 403 status the template already used for superuser checks is preserved, keeping error bodies uniform.

**How roles are stored and validated.** `Role` is a `str` enum in [backend/app/models.py](backend/app/models.py) with three members. `User.role` is a non-null column with `default='member'` and a `server_default` that lets the migration backfill existing rows. The migration ([4b13ccdd6106](backend/app/alembic/versions/4b13ccdd6106_add_user_role.py)) adds the column and runs `UPDATE "user" SET role = 'admin' WHERE is_superuser = true` to bring legacy superusers across. `is_superuser` is **kept**, not dropped — this is the additive-only stance documented in the [backend ADR](adr/rbac-fastapi-dependencies.md). [backend/app/crud.py](backend/app/crud.py) dual-writes the two fields in lockstep (`is_superuser = (role == Role.ADMIN)`) so the ~13 pre-existing `is_superuser` consumers (sidebar admin link, `items.py` ownership checks, settings tabs, admin UI forms) keep working unchanged. Removing them is the job of a future `deprecate-is-superuser` ADR; deferring it keeps the blast radius of this change small.

**How the frontend learns about user capabilities.** The existing `/users/me` round-trip on app boot now returns the user's `role` (added to `UserPublic`). [frontend/src/auth/permissions.ts](frontend/src/auth/permissions.ts) holds the single `MATRIX` constant and a pure `can(action, role)` helper. A `useCan(action)` hook wraps it against `useAuth().user?.role`. A `<RequireRole action="…">` component renders `<AccessDenied>` instead of route content when `useCan` returns `false`, so the URL is preserved on forbidden navigation — no silent redirect. The matrix is deliberately duplicated on the frontend (TS) and backend (Python), with this README as the canonical doc cross-referencing both — acceptable for 3 roles × 5 actions and called out in the ADR.

**Security boundary.** The backend is the boundary that returns 403; frontend gating is UX. A user who bypasses the UI still hits a backend `403`. The seeded test users (see [Setup](#setup)) make this trivial to verify by logging in as each role and trying the matrix actions.

## Setup

### Prerequisites

- Docker / Docker Desktop (any version that runs `docker compose`)
- [`uv`](https://docs.astral.sh/uv/) — `brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`
- [`bun`](https://bun.sh/) — `brew install oven-sh/bun/bun` or `curl -fsSL https://bun.sh/install | bash`

### One-time install

```bash
git clone git@github.com:ihor-shchuruk/Fullstack-Dev-Test-Task.git
cd Fullstack-Dev-Test-Task
cp .env.example .env

# Start Postgres
docker compose up -d db

# Backend deps + migrations
cd backend
uv sync
set -a && source ../.env && set +a
uv run alembic upgrade head

# Frontend deps
cd ../frontend
bun install
```

### Run the app

In two shells (from the repo root):

```bash
# shell 1 — backend
cd backend
set -a && source ../.env && set +a
uv run uvicorn app.main:app --reload --port 8000

# shell 2 — frontend
cd frontend
bun run dev
# open http://localhost:5173
```

### Seed Users

`init_db` creates three users on first boot, all with password `changethis`:

| Email | Role |
|---|---|
| `admin@example.com` | admin |
| `manager@example.com` | manager |
| `member@example.com` | member |

Log in with any of them to see how the UI changes per role. Direct navigation to `/metrics` as `member@example.com` shows the `<AccessDenied>` page; admins and managers see the metrics dashboard.

## Running Tests

### Backend (pytest — 78 tests, including the role × action matrix)

```bash
cd backend
set -a && source ../.env && set +a
uv run pytest tests/ -v
```

The role × action matrix tests live in [backend/tests/api/routes/test_users.py](backend/tests/api/routes/test_users.py) and [test_metrics.py](backend/tests/api/routes/test_metrics.py). The CRUD dual-write (`role` ↔ `is_superuser`) is verified in [backend/tests/crud/test_user.py](backend/tests/crud/test_user.py). The `require_roles` factory has dedicated unit tests in [backend/tests/api/test_deps.py](backend/tests/api/test_deps.py).

### Frontend (Playwright — admin/manager/member flows on `/metrics`)

```bash
# Backend must be running on :8000
cd frontend
bunx playwright test tests/rbac.spec.ts
```

The matrix flows live in [frontend/tests/rbac.spec.ts](frontend/tests/rbac.spec.ts): admin and manager see the sidebar link and can open the page; member doesn't see the link and lands on `<AccessDenied>` on direct navigation (URL preserved, no redirect).

---

## Assignment Brief

The remainder of this document is the original assignment as provided.

### Table of Contents

- [Goal](#goal)
- [Base Template](#base-template)
- [Suggested Time Allocation](#suggested-time-allocation)
- [Requirements](#requirements)
  - [1. Clone the Base Template](#1-clone-the-base-template)
  - [2. Roles and Authorization Surface](#2-roles-and-authorization-surface)
  - [3. Code Quality Expectations](#3-code-quality-expectations)
  - [4. Architecture & Documentation](#4-architecture--documentation)
  - [5. Non-Functional Requirements](#5-non-functional-requirements)
  - [6. UX Behavior](#6-ux-behavior)
  - [7. Developer UX](#7-developer-ux)
- [Constraints](#constraints)
- [What We Review](#what-we-review)
- [Submission](#submission)

## Goal

Add role-based access control (RBAC) to the existing Full-Stack FastAPI Template so that only authorized users can access sensitive endpoints and UI sections.

**We prioritize clean, maintainable code over comprehensive test coverage or extensive documentation.**

You may reuse any libraries already in the template.

> **Note**: RBAC can be implemented with simple role checks or a small policy layer. Keep scope tight. Favor clarity over cleverness.

## Base Template

**Tech Stack**:
- **Backend**: FastAPI / SQLModel / PostgreSQL
- **Frontend**: React / TypeScript

**Repository**: [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template/tree/master)

## Suggested Time Allocation

How we believe it is doable in a 1-hour timebox:

| Activity | Time           | Priority |
|----------|----------------|----------|
| Understanding the codebase | 15 min         | High |
| Implementation (clear, maintainable code) | 25 mins | **Critical** |
| Testing (focused, critical paths) | 10 min         | High |
| Documentation (README updates) | 10 min         | Medium |

**If running short on time:**
- ✓ **Prioritize**: Clear, working authorization code with consistent patterns
- ✓ **Then**: 3-5 well-chosen tests covering critical scenarios
- ⚠ **Cut if needed**: Extra features, comprehensive test coverage, diagrams
- ❌ **Don't cut**: Security checks, README setup instructions

## Requirements

### 1. Clone the Base Template

Clone the repository: https://github.com/fastapi/full-stack-fastapi-template/tree/master

### 2. Roles and Authorization Surface

#### Implement the Following Roles

| Role | Permissions |
|------|-------------|
| **admin** | Full access to user management and settings |
| **manager** | Can list users and view metrics, but not change global settings |
| **member** | Can only access their own profile and basic app features |

#### Protect a Small but Realistic Surface

- List users
- Create user
- View "metrics/insights" page (simple stub is acceptable)
- View and update own profile

**Exact permission mapping is up to you.**

State it clearly in your docs and enforce it consistently in the backend and frontend.

#### Example Permission Matrix (Document Something Similar)

| Action | admin | manager | member |
|--------|-------|---------|--------|
| List all users | ✓ | ✓ | ✗ |
| Create user | ✓ | ✗ | ✗ |
| View metrics | ✓ | ✓ | ✗ |
| Update own profile | ✓ | ✓ | ✓ |
| Update any profile | ✓ | ✗ | ✗ |

### 3. Code Quality Expectations

**We prioritize maintainable, readable code over clever solutions.**
 
- **Clear naming**: Function/variable names that explain intent without comments
- **Single responsibility**: Small, focused functions
- **Easy to extend**: Adding a new role shouldn't require touching 10+ files
- **Self-documenting**: Code structure makes the authorization model obvious

> **Key principle**: A teammate should understand your authorization model in 5 minutes by reading your code.

### 4. Architecture & Documentation

Document your implementation approach clearly but concisely.

#### Required

- [ ] **Permission matrix** in README showing which role can access what
- [ ] **Brief explanation** (2-4 paragraphs) of your authorization approach:
  - Where authorization checks live (middleware, dependencies, decorators?)
  - How roles are stored and validated
  - How frontend learns about user capabilities
- [ ] **Inline code comments** only for non-obvious authorization logic

#### Optional (Bonus Points)

- [ ] **1-2 Architecture Decision Records (ADRs)** for your most critical decisions
  - Use any simple ADR format (problem, options, decision, trade-offs)
  - 200-400 words each
  - Example topics: Why you chose your authorization pattern, where checks live, how the frontend handles permissions
- [ ] **Simple diagram** showing where auth/authz checks happen
  - Mermaid, C4-style, or hand-drawn PNG is fine

**Philosophy**: We value clear thinking over formal documentation. 
Your code should clearly explain your approach; that's usually sufficient.
RBAC implementation, though, usually has at least a few options to implement, hence an additional README will add value.

### 5. Non-Functional Requirements

Demonstrate you considered real-world constraints:

#### 1. Maintainability (Critical)

- Keep coupling low; use consistent patterns
- A teammate should understand your authorization logic in 5 minutes

#### 2. Testability (Important)

- Provide **focused backend tests** covering critical authorization paths

> **Note**: Tests are required, but we prioritize **quality over quantity**. 3 well-chosen tests with clean code beat 20 tests with spaghetti code.

### 3. UX Behavior

- **The UI** should:
  - Hide navigation links/buttons that the user can't access
  - Show a friendly "Forbidden" or "Access Denied" message if navigating directly to unauthorized routes
  - Not just fail silently or show cryptic errors

### 4. Developer UX

Update the README with:

- **How to run locally** (setup, dependencies, database)
- **How to seed test data** with at least one admin and one non-admin user
- **How to run tests**
- **Database migrations** for any schema changes (if applicable)

Make it easy for us to run your solution without hunting for setup instructions.

## What We Review

### Primary Criteria (60%)

**Code readability and maintainability**
- ✓ Clear separation of concerns
- ✓ Consistent authorization patterns
- ✓ Self-documenting code structure
- ✓ Low coupling between components
- ✓ Easy to understand and extend

**Working RBAC implementation**
- ✓ Consistent enforcement in backend and frontend
- ✓ No obvious security gaps or privilege escalation
- ✓ Correct HTTP status codes and error handling

### Secondary Criteria (30%)

**Test coverage**
- ✓ Focused tests on critical authorization paths
- ✓ Both allowed and denied scenarios tested
- ✓ Tests are clear and well-named

**Setup and documentation**
- ✓ Setup instructions work on first try
- ✓ Clear explanation of authorization approach
- ✓ Permission matrix documented

### Nice to Have (10%)

- Thoughtful UX for forbidden states
- Observability (logging denied attempts)
- Architecture Decision Records (ADRs)
- Helpful diagrams
- Extra polish

> **Philosophy**: We're evaluating your ability to write production-quality code under time constraints. We'd rather hire someone who delivers clean, working code with good tests than someone who delivers everything but it's hard to maintain.

## Submission

**Deliverables**:

- [ ] PR or repo link with commit history
- [ ] Updated README with:
  - Setup instructions
  - Permission matrix
  - Brief explanation of your approach
- [ ] Backend tests covering critical authorization scenarios
- [ ] Working implementation of RBAC
- [ ] Optional: `NOTES.md` with anything you want us to know (scope cuts, trade-offs, what you'd do with more time)

---

**Good luck!** Focus on demonstrating clear thinking and solid engineering fundamentals. We're looking for maintainable code, not perfect code.
