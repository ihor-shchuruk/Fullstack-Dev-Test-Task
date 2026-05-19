# Frontend RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the frontend half of role-based access control (RBAC) per [adr/frontend-capabilities-can-helper.md](../../../adr/frontend-capabilities-can-helper.md): regenerate the OpenAPI client to expose `role`, add a `permissions.ts` module with a `can()` helper, a `useCan(action)` hook, a `<RequireRole>` route guard, a friendly `<AccessDenied>` screen, a new `/metrics` page, and a sidebar link gated by `useCan("metrics.view")`.

**Architecture:** A pure-function `can(action, role)` reads from a single `MATRIX` constant — the same matrix documented in the assignment README. `useCan(action)` wraps it against `useAuth().user.role`. `<RequireRole action="…">` renders `<AccessDenied>` instead of route content on deny (URL preserved, no redirect). The new `/metrics` route is the showcase surface for the new pattern. Existing `is_superuser`-gated UI (sidebar admin link, `_layout/admin.tsx` beforeLoad, settings tabs, admin form fields) is **not migrated** here — that work is deferred to a future ADR per scope-boundary in the ADR.

**Tech Stack:** TypeScript, React, TanStack Router (file-based), TanStack Query, Chakra UI (existing components), `@hey-api/openapi-ts` for the API client, Playwright for e2e. **No unit test runner** is configured (Vitest is intentionally not added — outside scope; the assignment README prioritizes maintainable code over test breadth). The pure `can()` function is reviewed at read-time and covered by the e2e flow in Task 8.

---

## File Structure

**Files created**
- `frontend/src/auth/permissions.ts` — pure `Action` union, `MATRIX`, `can()` (Task 2)
- `frontend/src/auth/useCan.ts` — hook wrapping `can()` against the current user's role (Task 3)
- `frontend/src/auth/RequireRole.tsx` — route-level guard that renders `<AccessDenied>` on deny (Task 5)
- `frontend/src/components/Common/AccessDenied.tsx` — friendly forbidden screen (Task 4)
- `frontend/src/routes/_layout/metrics.tsx` — new `/metrics` route, gated via `<RequireRole>` (Task 6)
- `frontend/tests/rbac.spec.ts` — Playwright e2e covering admin/manager/member access to `/metrics` (Task 8)

**Files modified**
- `frontend/openapi.json` — regenerated to include the new `role` field on `UserPublic` (Task 1)
- `frontend/src/client/types.gen.ts` — regenerated, picks up `role` on `UserPublic` plus a `Role` union/enum type (Task 1)
- `frontend/src/client/schemas.gen.ts` — regenerated alongside (Task 1)
- `frontend/src/client/sdk.gen.ts` — regenerated alongside; gains a `MetricsService.readMetrics` method (Task 1, prerequisite for Task 6)
- `frontend/src/components/Sidebar/AppSidebar.tsx` — adds a "Metrics" link gated by `useCan("metrics.view")` (Task 7)

**Explicitly NOT touched** (deferred to the future `deprecate-is-superuser` ADR)
- `frontend/src/routes/_layout/admin.tsx` — keeps `is_superuser` check and silent redirect
- `frontend/src/routes/_layout/settings.tsx` — keeps `is_superuser` tab slicing
- `frontend/src/components/Admin/{columns,EditUser,AddUser}.tsx` — keep `is_superuser` form fields and table column
- The existing `Sidebar/AppSidebar.tsx` ternary on `currentUser?.is_superuser` for the admin link — kept; we only **add** a new conditional next to it

---

## Working Directory

All `cd` paths assume CWD = `/Users/ihor.shchuruk/Tech Assigments/Fullstack-Dev-Test-Task`. Frontend commands run from `frontend/`. Backend commands run from `backend/`.

## Dev Environment

- Backend deps managed by `uv` at `$HOME/.local/bin/uv`. Backend tests prefix:
  ```bash
  export PATH="$HOME/.local/bin:$PATH" && set -a && source ../.env && set +a
  ```
- Frontend uses `bun` (per `package.json` scripts using `bunx`).
- Postgres DB is running and at the latest migration. Backend test suite is at 78 passed / 0 failed on `main`.

---

## Task 1: Regenerate the OpenAPI client (prerequisite for all subsequent tasks)

**Files:**
- Modify: `frontend/openapi.json`
- Modify (regenerated): `frontend/src/client/types.gen.ts`, `frontend/src/client/schemas.gen.ts`, `frontend/src/client/sdk.gen.ts`

The backend now returns `role` on `UserPublic` and exposes `GET /metrics/`. The frontend client is generated from the backend's OpenAPI schema and must be regenerated before any TS code can read `user.role` or call `MetricsService.readMetrics()`.

- [ ] **Step 1: Start the backend dev server**

From `backend/`:

```bash
cd backend
export PATH="$HOME/.local/bin:$PATH" && set -a && source ../.env && set +a
uv run uvicorn app.main:app --reload --port 8000 &
echo $! > /tmp/uvicorn.pid
sleep 3
```

Verify it responds:

```bash
curl -s http://localhost:8000/api/v1/openapi.json | head -c 200
```

Expected: prints the start of a JSON object containing `"openapi"` and `"paths"`.

- [ ] **Step 2: Pull the live OpenAPI schema into `frontend/openapi.json`**

```bash
curl -s http://localhost:8000/api/v1/openapi.json -o frontend/openapi.json
```

Verify the new schema includes `role` and the metrics endpoint:

```bash
grep -o '"role"' frontend/openapi.json | head -2
grep -o '"/metrics/' frontend/openapi.json | head -2
```

Expected: both grep results return at least one match.

- [ ] **Step 3: Regenerate the TS client**

```bash
cd frontend
bun install   # ensure deps if not present
bun run generate-client
```

- [ ] **Step 4: Verify the generated `UserPublic` now has `role` and a `Role` type exists**

```bash
grep -A 10 "^export type UserPublic" frontend/src/client/types.gen.ts
grep "^export type Role" frontend/src/client/types.gen.ts
grep -A 3 "readMetrics" frontend/src/client/sdk.gen.ts | head
```

Expected:
- `UserPublic` includes `role?: Role` (or similar — the exact name comes from the generator).
- A top-level `Role` type/union exists (typically `'admin' | 'manager' | 'member'`).
- A `MetricsService.readMetrics` (or `readMetricsApiV1MetricsGet`) method appears in `sdk.gen.ts`.

If the generator named the metrics method differently, note the exact symbol name now — Task 6 uses it.

- [ ] **Step 5: Stop the backend**

```bash
kill $(cat /tmp/uvicorn.pid)
rm /tmp/uvicorn.pid
```

- [ ] **Step 6: Commit the regenerated client**

From the repo root:

```bash
git add frontend/openapi.json frontend/src/client/*.gen.ts
git commit -m "chore(frontend): regenerate API client for role + metrics endpoints"
```

---

## Task 2: `permissions.ts` — `Action` union, `MATRIX`, and `can()`

**Files:**
- Create: `frontend/src/auth/permissions.ts`

This is the single source of truth for which roles can perform which actions. Mirrors the assignment README's permission matrix.

- [ ] **Step 1: Create the module**

Write this file at `frontend/src/auth/permissions.ts`:

```typescript
import type { Role } from "@/client"

export type Action =
  | "users.list"
  | "users.create"
  | "users.update_any"
  | "metrics.view"
  | "profile.update_own"

const MATRIX: Record<Action, Role[]> = {
  "users.list":         ["admin", "manager"],
  "users.create":       ["admin"],
  "users.update_any":   ["admin"],
  "metrics.view":       ["admin", "manager"],
  "profile.update_own": ["admin", "manager", "member"],
}

export const can = (action: Action, role: Role | undefined): boolean =>
  !!role && MATRIX[action].includes(role)
```

Notes:
- The import path `@/client` assumes the existing `tsconfig.json` path alias (the template uses `"@/*": ["./src/*"]`). If `Role` isn't exported from `@/client` (i.e., it's only exported from `@/client/types.gen`), use `import type { Role } from "@/client/types.gen"` instead — verify with `grep "export.*Role" frontend/src/client/index.ts`.
- The `MATRIX` is read-only by convention. Do not add `as const` unless the resulting type narrowing causes a type error; `Record<Action, Role[]>` is sufficient and keeps the type readable.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend
bun run lint 2>&1 | tail -20
```

(The template uses Biome via `bun run lint`; if there's a separate `tsc --noEmit` it should also pass. The test is: no new errors introduced in `auth/permissions.ts`.)

Expected: lint passes (or only pre-existing warnings, none from your new file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/permissions.ts
git commit -m "feat(auth): add permissions matrix and can() helper"
```

---

## Task 3: `useCan(action)` hook

**Files:**
- Create: `frontend/src/auth/useCan.ts`

- [ ] **Step 1: Create the hook**

Write `frontend/src/auth/useCan.ts`:

```typescript
import { type Action, can } from "@/auth/permissions"
import useAuth from "@/hooks/useAuth"

export const useCan = (action: Action): boolean => {
  const { user } = useAuth()
  return can(action, user?.role)
}
```

Notes:
- `useAuth` is a default export (per the orientation: `frontend/src/hooks/useAuth.ts` exports `useAuth` as default). Use `import useAuth from "@/hooks/useAuth"`, not a named import.
- `user?.role` is `Role | undefined` — `can()` already handles `undefined` by returning `false`. This means the hook safely returns `false` during the initial auth-loading window before `/users/me` resolves.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend
bun run lint 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/useCan.ts
git commit -m "feat(auth): add useCan(action) hook"
```

---

## Task 4: `<AccessDenied>` component

**Files:**
- Create: `frontend/src/components/Common/AccessDenied.tsx`

- [ ] **Step 1: Inspect a sibling component for style consistency**

Look at the existing `frontend/src/components/Common/NotFound.tsx` for the prevailing pattern (Chakra UI components, copy tone, layout). Match that style.

- [ ] **Step 2: Create the component**

Write `frontend/src/components/Common/AccessDenied.tsx`. Use the existing `NotFound.tsx` as a structural reference — same Chakra primitives, same overall layout, different copy:

```tsx
import { Box, Button, Container, Heading, Text } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

const AccessDenied = () => (
  <Container
    maxW="2xl"
    py={{ base: 16, md: 32 }}
    centerContent
  >
    <Box textAlign="center">
      <Heading as="h1" size="2xl" mb={4}>
        Access denied
      </Heading>
      <Text color="ui.dim" mb={8}>
        You don&apos;t have access to this page. Contact an admin if you think this is a mistake.
      </Text>
      <Button as={Link} to="/" variant="solid">
        Back to dashboard
      </Button>
    </Box>
  </Container>
)

export default AccessDenied
```

If `NotFound.tsx` uses different Chakra imports or a different color token than `ui.dim`, copy whatever pattern is established there. **Do not** introduce a new color token or theme key.

- [ ] **Step 3: TypeScript + lint check**

```bash
cd frontend
bun run lint 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Common/AccessDenied.tsx
git commit -m "feat(ui): add AccessDenied component"
```

---

## Task 5: `<RequireRole>` route guard

**Files:**
- Create: `frontend/src/auth/RequireRole.tsx`

- [ ] **Step 1: Create the component**

Write `frontend/src/auth/RequireRole.tsx`:

```tsx
import type { ReactNode } from "react"

import { type Action } from "@/auth/permissions"
import { useCan } from "@/auth/useCan"
import AccessDenied from "@/components/Common/AccessDenied"

interface RequireRoleProps {
  action: Action
  children: ReactNode
}

const RequireRole = ({ action, children }: RequireRoleProps) => {
  const allowed = useCan(action)
  if (!allowed) {
    return <AccessDenied />
  }
  return <>{children}</>
}

export default RequireRole
```

Notes:
- The component does not redirect — it renders `<AccessDenied>` in place so the URL is preserved (the ADR's UX requirement).
- During the initial auth-loading window, `useCan(...)` returns `false`, so the user briefly sees `<AccessDenied>` before the user data arrives. This is acceptable for the assignment scope; a follow-up could read `useAuth().isLoading` and render a spinner instead. **Do not** add that loading state in this task — out of scope.

- [ ] **Step 2: TypeScript + lint check**

```bash
cd frontend
bun run lint 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/RequireRole.tsx
git commit -m "feat(auth): add RequireRole route guard component"
```

---

## Task 6: `/metrics` route — showcase the new pattern

**Files:**
- Create: `frontend/src/routes/_layout/metrics.tsx`

- [ ] **Step 1: Verify the generated metrics SDK method name**

```bash
grep -B 1 -A 4 "Metrics" frontend/src/client/sdk.gen.ts | head -30
grep "export.*Metrics" frontend/src/client/index.ts
```

Note the exact `MetricsService.<method>` name produced by the generator. The default `@hey-api/openapi-ts` pattern is `MetricsService.readMetricsApiV1MetricsGet` (or similar). Use the exact name in Step 2.

- [ ] **Step 2: Create the route**

Write `frontend/src/routes/_layout/metrics.tsx`:

```tsx
import { Box, Container, Heading, Stat, StatGroup, StatLabel, StatNumber } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import RequireRole from "@/auth/RequireRole"
import { MetricsService } from "@/client"

export const Route = createFileRoute("/_layout/metrics")({
  component: MetricsPage,
})

function MetricsPage() {
  return (
    <RequireRole action="metrics.view">
      <MetricsContent />
    </RequireRole>
  )
}

function MetricsContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: () => MetricsService.readMetrics(),
  })

  return (
    <Container maxW="container.md" py={8}>
      <Heading as="h1" size="lg" mb={6}>
        Metrics
      </Heading>
      <Box>
        {isLoading ? (
          "Loading…"
        ) : (
          <StatGroup>
            <Stat>
              <StatLabel>Users total</StatLabel>
              <StatNumber>{data?.users_total ?? 0}</StatNumber>
            </Stat>
            <Stat>
              <StatLabel>Active today</StatLabel>
              <StatNumber>{data?.active_today ?? 0}</StatNumber>
            </Stat>
          </StatGroup>
        )}
      </Box>
    </Container>
  )
}
```

If the SDK method name from Step 1 was different (e.g., `readMetricsApiV1MetricsGet`), substitute that name. The shape of `data` is `{ users_total: number; active_today: number }` per the backend stub.

- [ ] **Step 3: Regenerate the route tree**

TanStack Router file-based routes register themselves at build time via a Vite plugin. Confirm the route appears in `frontend/src/routeTree.gen.ts`:

```bash
cd frontend
bun run build 2>&1 | tail -5
grep "_layout/metrics" frontend/src/routeTree.gen.ts
```

If `bun run build` requires the dev server's regen step (the template often regenerates `routeTree.gen.ts` via `bun run dev` in watch mode), an alternative is to simply start the dev server briefly:

```bash
bun run dev &
DEV_PID=$!
sleep 5
kill $DEV_PID
grep "_layout/metrics" frontend/src/routeTree.gen.ts
```

Expected: at least one match for the metrics path in the route tree file.

- [ ] **Step 4: Manually smoke-test the route**

Start the backend and frontend, log in as `admin@example.com` (password `changethis`), navigate to `/metrics`, and confirm the page renders with non-zero `users_total`.

```bash
# In one shell
cd backend
export PATH="$HOME/.local/bin:$PATH" && set -a && source ../.env && set +a
uv run uvicorn app.main:app --reload --port 8000

# In another shell
cd frontend
bun run dev
# Open http://localhost:5173, log in, navigate to /metrics
```

After confirming, stop both processes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/_layout/metrics.tsx frontend/src/routeTree.gen.ts
git commit -m "feat(routes): add /metrics page gated by RequireRole"
```

---

## Task 7: Sidebar — add Metrics link gated by `useCan("metrics.view")`

**Files:**
- Modify: `frontend/src/components/Sidebar/AppSidebar.tsx`

- [ ] **Step 1: Read the existing sidebar to find the items pattern**

```bash
cat frontend/src/components/Sidebar/AppSidebar.tsx | head -50
```

The orientation found a ternary pattern around line 20-25:

```tsx
const items = currentUser?.is_superuser
  ? [...baseItems, { icon: Users, title: "Admin", path: "/admin" }]
  : baseItems
```

This stays unchanged. You add a Metrics link via `useCan("metrics.view")` in a separate, **additive** modification — do not collapse the two conditionals into one combined expression.

- [ ] **Step 2: Add the import + a metrics conditional**

Edit `frontend/src/components/Sidebar/AppSidebar.tsx`. At the top, add (alongside the existing imports):

```tsx
import { BarChart3 } from "lucide-react"

import { useCan } from "@/auth/useCan"
```

(Replace `BarChart3` with whatever icon library the file already uses — match the existing `Users` icon import to find the library. If `lucide-react` is correct, use it.)

After the existing `items = currentUser?.is_superuser ? ... : baseItems` line, add:

```tsx
const canViewMetrics = useCan("metrics.view")
const finalItems = canViewMetrics
  ? [...items, { icon: BarChart3, title: "Metrics", path: "/metrics" }]
  : items
```

Then use `finalItems` instead of `items` in the JSX that renders the sidebar entries (locate the existing `.map(...)` over `items` and change it to `.map(...)` over `finalItems`).

If the existing pattern uses a different shape (e.g., `path` vs `to`, or a different property name), match it exactly.

- [ ] **Step 3: TypeScript + lint**

```bash
cd frontend
bun run lint 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 4: Smoke-test**

Start the backend + frontend (as in Task 6 Step 4). Log in as:
- `admin@example.com` → Metrics link visible in sidebar ✓
- `manager@example.com` (password `changethis`) → Metrics link visible ✓
- `member@example.com` (password `changethis`) → Metrics link NOT visible ✓

For each, also try navigating directly to `/metrics`:
- admin/manager → page renders
- member → `<AccessDenied>` renders (URL stays `/metrics`)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar/AppSidebar.tsx
git commit -m "feat(ui): show Metrics nav link to admin and manager"
```

---

## Task 8: Playwright e2e — RBAC matrix flows

**Files:**
- Create: `frontend/tests/rbac.spec.ts`

- [ ] **Step 1: Inspect existing Playwright test to match conventions**

```bash
ls frontend/tests/
cat frontend/tests/auth.setup.ts 2>/dev/null || cat frontend/tests/login.spec.ts 2>/dev/null | head -40
```

Note the existing patterns for logging in, base URL, and selectors. Match those.

- [ ] **Step 2: Write the spec**

Create `frontend/tests/rbac.spec.ts`:

```typescript
import { expect, test } from "@playwright/test"

const BASE = "http://localhost:5173"

async function login(page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /log\s*in/i }).click()
  await page.waitForURL(`${BASE}/`)
}

test.describe("RBAC matrix", () => {
  test("admin sees Metrics in sidebar and can access the page", async ({ page }) => {
    await login(page, "admin@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toBeVisible()
    await page.getByRole("link", { name: /metrics/i }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible()
  })

  test("manager sees Metrics in sidebar and can access the page", async ({ page }) => {
    await login(page, "manager@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toBeVisible()
    await page.goto(`${BASE}/metrics`)
    await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible()
  })

  test("member does not see Metrics in sidebar; direct nav shows Access denied", async ({
    page,
  }) => {
    await login(page, "member@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toHaveCount(0)
    await page.goto(`${BASE}/metrics`)
    await expect(page).toHaveURL(/\/metrics$/) // URL preserved, not redirected
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible()
  })
})
```

Adjust selectors to match the actual login form labels and button names if they differ (Step 1's inspection tells you what to use).

- [ ] **Step 3: Run the test**

```bash
cd frontend
bun run test tests/rbac.spec.ts 2>&1 | tail -20
```

Expected: 3 passed.

If Playwright reports it can't reach the backend, ensure the backend is running on `localhost:8000` (Playwright config auto-starts the frontend at 5173 but the backend must be running separately).

- [ ] **Step 4: Run the full Playwright suite to confirm no regressions**

```bash
bun run test 2>&1 | tail -10
```

Expected: all existing tests still pass, plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/rbac.spec.ts
git commit -m "test(e2e): cover RBAC sidebar gating and Access denied for /metrics"
```

---

## Cross-cutting Verification

After all tasks are committed, confirm:

- [ ] `git log --oneline` shows seven new frontend commits on top of the backend baseline.
- [ ] `grep -rn "useCan\|RequireRole\|AccessDenied" frontend/src/` shows the new symbols in use only at the surfaces this ADR introduces (sidebar, metrics route, RequireRole module).
- [ ] `grep -rn "is_superuser" frontend/src/` still matches at the pre-existing sites (`AppSidebar.tsx`, `_layout/admin.tsx`, `_layout/settings.tsx`, `Admin/{columns,EditUser,AddUser}.tsx`) — these are intentionally not migrated.
- [ ] `bun run lint` is clean (or no new findings vs. baseline).
- [ ] `bun run test` (Playwright) is green.
- [ ] Manual smoke: admin, manager, member each behave per the matrix on the sidebar Metrics link and direct `/metrics` navigation.

---

## Out-of-Scope Reminder

The migration of existing `is_superuser`-gated UI surfaces (`_layout/admin.tsx`, `_layout/settings.tsx`, `AddUser`/`EditUser`/`columns.tsx`, the existing sidebar admin ternary) lives in the future `deprecate-is-superuser` ADR. **Do not** convert those in this plan, even though it would feel tidy — keeping the blast radius small is the whole point of the additive-only design.
