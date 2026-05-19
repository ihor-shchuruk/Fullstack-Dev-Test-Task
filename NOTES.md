# Notes

Short notes for graders — trade-offs and decisions worth flagging.

## 1. `is_superuser` is kept, not removed

The new `role` column was added *alongside* `is_superuser`, not in place of it. There are ~13 production references to `is_superuser` in the template (sidebar admin link, items-ownership checks, admin form fields, settings tab gating, etc.) — migrating all of them in one PR would have inflated the blast radius and the diff. Instead, the [backend ADR](adr/rbac-fastapi-dependencies.md) makes the change additive: `crud.create_user` and `crud.update_user` dual-write `is_superuser = (role == Role.ADMIN)` so existing consumers stay aligned, and the full removal is deferred to a follow-up `deprecate-is-superuser` ADR. Both ADRs reference the `[[deprecate-is-superuser]]` placeholder so the forward intent is documented.

## 2. API quirk: `UserCreate(is_superuser=True)` no longer makes a superuser

Because `crud.create_user` and `crud.update_user` derive `is_superuser` from `role` after the dual-write, passing `is_superuser=True` alone is ignored if `role` is `member` (the default). To create an admin you now pass `role=Role.ADMIN`; `is_superuser` will be set to `True` automatically. This is a semantic break vs. the original template; three existing CRUD tests had to be updated to pass `role=Role.ADMIN` instead of relying on `is_superuser=True` as the trigger. `init_db` was updated accordingly to seed all three roles.

## 3. Single-role-per-user matches the README, but is not what I'd build at scale

The assignment's permission matrix assumes one role per user, and the `Role` enum on `User` enforces that. In real projects I have generally found this rigid — composite roles (`manager + auditor`, `editor + reviewer`), per-resource scopes, and explicit permission tokens are common needs. A many-to-many `user_roles` table plus a permission-based check (role → permissions, then `require_permission("metrics.view")`) is the path I'd take if the next step was real-world scale. Within this 1-hour assignment, the simpler model is the right answer.

## 4. No new layers of abstraction were introduced

The implementation deliberately stays inside the template's existing abstractions: FastAPI dependencies, SQLModel CRUD, TanStack Router file-based routes, TanStack Query for data fetching, the existing OpenAPI client codegen. `require_roles(...)` is a sibling of the template's existing `get_current_active_superuser` dependency — same pattern, more general. The frontend `can()` + `useCan()` + `<RequireRole>` trio is a thin shim over `useAuth`. No service layer, no policy engine, no DI rewiring. The result is one or two small files per concern, easy to read top-to-bottom.

## 5. Time pressure shaped the scope cuts

Per the README's [Suggested Time Allocation](README.md#suggested-time-allocation), implementation was budgeted at 25 minutes (out of a 1-hour timebox). The shape of the work reflects that budget:

- **Additive `is_superuser` stance** (note 1) — instead of one wide migration, ship the new model and gate; defer the cleanup.
- **No frontend unit-test runner** — Vitest isn't configured in the template, so `can()` is covered by the Playwright e2e flow rather than a separate unit suite. The `can()` function is pure and trivially reviewable on read.
- **Tracking baselines** committed once for backend and once for frontend rather than per-file — pragmatic for the timebox, less ideal for fine-grained review.
- **The implementation plans live in the repo** ([docs/superpowers/plans/](docs/superpowers/plans/)) so the cuts are visible and the next-iteration steps are pre-written.

What I'd do with more time, in priority order: (a) the `deprecate-is-superuser` ADR + the cleanup PR migrating the ~13 references, (b) Vitest for `can()` and a couple of integration tests for `<RequireRole>`, (c) a permission-based model (note 3) once the product surface justifies it, (d) a small loading state in `<RequireRole>` so the brief `<AccessDenied>` flash before `/users/me` resolves becomes a spinner instead.
