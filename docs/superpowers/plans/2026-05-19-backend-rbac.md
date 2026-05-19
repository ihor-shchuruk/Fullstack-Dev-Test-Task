# Backend RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the backend half of role-based access control (RBAC) per [adr/rbac-fastapi-dependencies.md](../../../adr/rbac-fastapi-dependencies.md): introduce `Role` enum and `User.role` column alongside `is_superuser` (additive — no removal in this plan), add a `require_roles(*roles)` FastAPI dependency factory, re-gate the four user-management endpoints per the permission matrix, add a `GET /metrics/` stub endpoint, and cover allowed/denied paths with tests.

**Architecture:** SQLModel gains a `Role` string enum (`admin | manager | member`) and a `role` field on `UserBase` (default `member`). Alembic migration adds the column and backfills from `is_superuser`. `crud.create_user` and `crud.update_user` dual-write `is_superuser = (role == Role.ADMIN)` so existing `is_superuser` consumers (sidebar, admin UI, `items.py` ownership checks, `delete_user_me`) stay consistent until a follow-up ADR removes the column. A `require_roles(*roles)` factory in `app/api/deps.py` returns a FastAPI dependency that raises `HTTPException(403)` on role mismatch; routes declare `dependencies=[Depends(require_roles(Role.ADMIN, Role.MANAGER))]`. `get_current_active_superuser` is kept (deprecated docstring) for the out-of-scope routes that still use it. A new `app/api/routes/metrics.py` exposes `GET /metrics/` returning a fixed dict, gated on `require_roles(Role.ADMIN, Role.MANAGER)`. `init_db` seeds one user per role for local dev and tests.

**Tech Stack:** Python 3.10+, FastAPI, SQLModel (Pydantic + SQLAlchemy), Alembic, PostgreSQL, Pytest + `fastapi.testclient.TestClient`.

---

## File Structure

**Files created**
- `backend/app/api/routes/metrics.py` — new metrics stub router (Task 7)
- `backend/app/alembic/versions/<generated>_add_user_role.py` — new migration (Task 2)
- `backend/tests/api/routes/test_metrics.py` — metrics route authorization tests (Task 7)

**Files modified**
- `backend/app/models.py` — add `Role` enum, add `role` field to `UserBase` (Task 1)
- `backend/app/api/deps.py` — add `require_roles(*roles)` factory; deprecation note on `get_current_active_superuser` (Task 3)
- `backend/app/crud.py` — dual-write `is_superuser` from `role` in `create_user`/`update_user` (Task 4)
- `backend/app/core/db.py` — seed a user per role in `init_db` (Task 5)
- `backend/app/api/routes/users.py` — swap guards on `GET /users/`, `POST /users/`, `PATCH /users/{id}`, `DELETE /users/{id}` (Task 6)
- `backend/app/api/main.py` — register the new metrics router (Task 7)
- `backend/tests/api/routes/test_users.py` — add manager/member matrix tests (Task 8)
- `backend/tests/crud/test_user.py` — add dual-write assertion test (Task 4)
- `backend/tests/utils/user.py` — extend with a helper that creates a user with a given role and returns auth headers (Task 8)

**Files explicitly NOT touched** (out of scope; live in the future deprecate-is-superuser ADR)
- `backend/app/api/routes/items.py` — keep using `current_user.is_superuser` for ownership overrides
- `backend/app/api/routes/users.py:137` (`delete_user_me` self-delete guard) — keep
- `backend/app/api/routes/users.py:172` (inline check in `read_user_by_id`) — keep
- `backend/app/api/routes/users.py:224` (inline check in `delete_user`) — keep (different check — "delete self" guard, separate from the dependency-level role guard)
- All frontend files

---

## Working Directory

All commands assume CWD = `/Users/ihor.shchuruk/Tech Assigments/Fullstack-Dev-Test-Task/backend` unless explicitly noted. Run them from there.

To run the backend test suite, the template uses Pytest with a postgres DB. The simplest path during development is:

```bash
docker compose up -d db
# wait until healthy, then:
uv run bash scripts/tests-start.sh
```

For fast iteration on a single test, after the DB is up and dependencies installed:

```bash
uv run pytest tests/api/routes/test_users.py::test_name -v
```

---

## Task 1: Add `Role` enum and `role` field to `UserBase`

**Files:**
- Modify: `backend/app/models.py:1-19`

- [ ] **Step 1: Write the failing test**

File: `backend/tests/crud/test_user.py` — append at the bottom of the existing file.

```python
# --- RBAC: Role enum and User.role field ---

def test_role_enum_has_three_members() -> None:
    from app.models import Role

    assert {member.value for member in Role} == {"admin", "manager", "member"}


def test_user_base_defaults_role_to_member() -> None:
    from app.models import Role, UserBase

    user = UserBase(email="x@example.com")
    assert user.role == Role.MEMBER
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
uv run pytest tests/crud/test_user.py::test_role_enum_has_three_members tests/crud/test_user.py::test_user_base_defaults_role_to_member -v
```

Expected: FAIL with `ImportError: cannot import name 'Role' from 'app.models'`.

- [ ] **Step 3: Implement the `Role` enum and `role` field**

Edit `backend/app/models.py`. Replace the top of the file through `UserBase`:

```python
import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    MEMBER = "member"


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False  # kept; deprecated in a follow-up ADR
    role: Role = Field(default=Role.MEMBER, max_length=16)
    full_name: str | None = Field(default=None, max_length=255)
```

Everything below `UserBase` stays unchanged.

- [ ] **Step 4: Run the test to verify it passes**

```bash
uv run pytest tests/crud/test_user.py::test_role_enum_has_three_members tests/crud/test_user.py::test_user_base_defaults_role_to_member -v
```

Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/tests/crud/test_user.py
git commit -m "feat(models): add Role enum and User.role field (additive)"
```

---

## Task 2: Alembic migration — add `role` column and backfill from `is_superuser`

**Files:**
- Create: `backend/app/alembic/versions/<generated>_add_user_role.py`

This task does **not** follow strict red/green TDD (migrations are tested by running them). The verification step is to upgrade a fresh DB and inspect the column.

- [ ] **Step 1: Generate a migration skeleton**

```bash
uv run alembic revision -m "add user role"
```

This prints the path of the new file, e.g. `app/alembic/versions/b7d2a3e4f1c9_add_user_role.py`. Note the filename for the next step.

- [ ] **Step 2: Fill in the migration body**

Open the newly created file. Replace its contents with:

```python
"""add user role

Revision ID: <use the value Alembic generated, do not invent one>
Revises: fe56fa70289e
Create Date: <leave whatever Alembic generated>

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "<keep the auto-generated id>"
down_revision = "fe56fa70289e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "role",
            sa.String(length=16),
            nullable=False,
            server_default="member",
        ),
    )
    op.execute(
        "UPDATE \"user\" SET role = 'admin' WHERE is_superuser = true"
    )


def downgrade() -> None:
    op.drop_column("user", "role")
```

Notes:
- **Do NOT drop `is_superuser`.** Removal is deferred to a follow-up ADR.
- `server_default="member"` makes the column non-nullable safely on tables that already contain rows.
- The backfill `UPDATE` runs after the column is created (defaults apply first, then we promote existing superusers).
- `"user"` is quoted because `user` is a reserved word in PostgreSQL.

- [ ] **Step 3: Apply the migration**

Make sure the DB container is running (`docker compose up -d db`), then:

```bash
uv run alembic upgrade head
```

Expected output ends with `Running upgrade fe56fa70289e -> <new id>, add user role`.

- [ ] **Step 4: Verify the schema and backfill**

```bash
uv run python -c "from sqlmodel import Session, text; from app.core.db import engine; \
s = Session(engine); \
print(list(s.exec(text(\"SELECT email, is_superuser, role FROM \\\"user\\\"\"))))"
```

Expected: every row prints; the superuser (`settings.FIRST_SUPERUSER`) has `is_superuser=True` and `role='admin'`. Any other rows have `role='member'`.

- [ ] **Step 5: Verify downgrade**

```bash
uv run alembic downgrade -1 && uv run alembic upgrade head
```

Expected: downgrade succeeds (drops `role`), upgrade re-applies it and re-runs the backfill.

- [ ] **Step 6: Commit**

```bash
git add backend/app/alembic/versions/*_add_user_role.py
git commit -m "feat(db): migration adds user.role column with is_superuser backfill"
```

---

## Task 3: `require_roles(*roles)` dependency factory

**Files:**
- Modify: `backend/app/api/deps.py:14, 52-57`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/api/test_deps.py`:

```python
import pytest
from fastapi import HTTPException

from app.api.deps import require_roles
from app.models import Role, User


def _user_with(role: Role) -> User:
    return User(
        email=f"{role.value}@example.com",
        hashed_password="x",
        role=role,
        is_superuser=(role == Role.ADMIN),
    )


def test_require_roles_allows_matching_role() -> None:
    dep = require_roles(Role.ADMIN, Role.MANAGER)

    result = dep(current_user=_user_with(Role.MANAGER))

    assert result.role == Role.MANAGER


def test_require_roles_raises_403_on_mismatch() -> None:
    dep = require_roles(Role.ADMIN)

    with pytest.raises(HTTPException) as exc:
        dep(current_user=_user_with(Role.MEMBER))

    assert exc.value.status_code == 403
    assert exc.value.detail == "The user doesn't have enough privileges"
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
uv run pytest tests/api/test_deps.py -v
```

Expected: FAIL with `ImportError: cannot import name 'require_roles' from 'app.api.deps'`.

- [ ] **Step 3: Implement `require_roles`**

Edit `backend/app/api/deps.py`. Add the `Role` import and append a new dependency factory after `get_current_active_superuser`:

Change line 14 from:
```python
from app.models import TokenPayload, User
```
to:
```python
from app.models import Role, TokenPayload, User
```

Append at the bottom of the file (after `get_current_active_superuser`):

```python
def require_roles(*allowed: Role):
    """Return a FastAPI dependency that allows only users whose role is in `allowed`.

    Raises HTTP 403 with the existing template message on mismatch so error bodies
    stay uniform across the codebase.
    """

    def _check(current_user: CurrentUser) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=403, detail="The user doesn't have enough privileges"
            )
        return current_user

    return _check
```

Also add a deprecation note to `get_current_active_superuser` — change its body so the docstring carries the deprecation hint, keeping behavior:

```python
def get_current_active_superuser(current_user: CurrentUser) -> User:
    """Deprecated: prefer ``require_roles(Role.ADMIN, ...)``.

    Kept for routes outside the RBAC scope (items.py, self-delete guards).
    Removed in the follow-up `deprecate-is-superuser` ADR.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
uv run pytest tests/api/test_deps.py -v
```

Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/tests/api/test_deps.py
git commit -m "feat(deps): add require_roles(*roles) dependency factory"
```

---

## Task 4: CRUD dual-write — keep `is_superuser` aligned with `role`

**Files:**
- Modify: `backend/app/crud.py:10-31`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/crud/test_user.py`:

```python
# --- RBAC: dual-write is_superuser <-> role ---

def test_create_user_with_admin_role_sets_is_superuser_true(db: Session) -> None:
    from app import crud
    from app.models import Role, UserCreate
    from tests.utils.utils import random_email, random_lower_string

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            password=random_lower_string(),
            role=Role.ADMIN,
        ),
    )

    assert user.role == Role.ADMIN
    assert user.is_superuser is True


def test_create_user_with_member_role_sets_is_superuser_false(db: Session) -> None:
    from app import crud
    from app.models import Role, UserCreate
    from tests.utils.utils import random_email, random_lower_string

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            password=random_lower_string(),
            role=Role.MEMBER,
        ),
    )

    assert user.role == Role.MEMBER
    assert user.is_superuser is False


def test_update_user_role_to_admin_promotes_is_superuser(db: Session) -> None:
    from app import crud
    from app.models import Role, UserCreate, UserUpdate
    from tests.utils.utils import random_email, random_lower_string

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string(), role=Role.MEMBER
        ),
    )
    assert user.is_superuser is False

    updated = crud.update_user(
        session=db, db_user=user, user_in=UserUpdate(role=Role.ADMIN)
    )

    assert updated.role == Role.ADMIN
    assert updated.is_superuser is True


def test_update_user_role_to_member_demotes_is_superuser(db: Session) -> None:
    from app import crud
    from app.models import Role, UserCreate, UserUpdate
    from tests.utils.utils import random_email, random_lower_string

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string(), role=Role.ADMIN
        ),
    )
    assert user.is_superuser is True

    updated = crud.update_user(
        session=db, db_user=user, user_in=UserUpdate(role=Role.MEMBER)
    )

    assert updated.role == Role.MEMBER
    assert updated.is_superuser is False
```

The existing `tests/crud/test_user.py` already imports `Session` at the top; if it doesn't, add `from sqlmodel import Session` near the existing imports.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
uv run pytest tests/crud/test_user.py -k "is_superuser or role" -v
```

Expected: FAIL — `is_superuser` stays at its default `False` even when role is `admin` (or stays `True` even after demotion).

- [ ] **Step 3: Extend the model imports**

Change the import block near line 7 of `backend/app/crud.py` to add `Role`:

```python
from app.models import Item, ItemCreate, Role, User, UserCreate, UserUpdate
```

- [ ] **Step 4: Implement the dual-write in `create_user`**

Replace the existing `create_user` with this body (only the `update={}` dict changes — the `hashed_password` line is preserved, and `is_superuser` is added as a derived field):

```python
def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create,
        update={
            "hashed_password": get_password_hash(user_create.password),
            "is_superuser": user_create.role == Role.ADMIN,
        },
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj
```

- [ ] **Step 5: Implement the dual-write in `update_user`**

Replace the existing `update_user` body. The original leaves `password` inside `user_data` and relies on `update=extra_data` overriding `hashed_password` during `sqlmodel_update`. Preserve that behavior — do **not** add a `.pop("password")` — and add the role→is_superuser propagation:

```python
def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data: dict[str, Any] = {}
    if "password" in user_data:
        password = user_data["password"]
        extra_data["hashed_password"] = get_password_hash(password)
    if "role" in user_data:
        extra_data["is_superuser"] = user_data["role"] == Role.ADMIN
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
uv run pytest tests/crud/test_user.py -v
```

Expected: PASS for all four new dual-write tests plus the existing tests (no regressions).

- [ ] **Step 7: Commit**

```bash
git add backend/app/crud.py backend/tests/crud/test_user.py
git commit -m "feat(crud): dual-write is_superuser from role on create/update"
```

---

## Task 5: Seed one user per role in `init_db`

**Files:**
- Modify: `backend/app/core/db.py:15-33`

This task ensures the test suite and local dev have an `admin`, a `manager`, and a `member` available out of the box. The matrix tests in Task 8 depend on these.

- [ ] **Step 1: Decide on credentials**

For deterministic tests, hardcode known emails and reuse the existing first-superuser password setting. The first-superuser becomes the admin (idempotent). Add `manager@example.com` and `member@example.com`, both with `settings.FIRST_SUPERUSER_PASSWORD`.

- [ ] **Step 2: Edit `init_db`**

Replace the body of `init_db` in `backend/app/core/db.py`:

```python
def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations.
    # SQLModel.metadata.create_all(engine)  # uncomment to skip migrations

    _ensure_user(
        session,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
        role=Role.ADMIN,
    )
    _ensure_user(
        session,
        email="manager@example.com",
        password=settings.FIRST_SUPERUSER_PASSWORD,
        role=Role.MANAGER,
    )
    _ensure_user(
        session,
        email="member@example.com",
        password=settings.FIRST_SUPERUSER_PASSWORD,
        role=Role.MEMBER,
    )


def _ensure_user(session: Session, *, email: str, password: str, role: Role) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        return user
    return crud.create_user(
        session=session,
        user_create=UserCreate(email=email, password=password, role=role),
    )
```

Extend the imports at the top:

```python
from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import Role, User, UserCreate
```

- [ ] **Step 3: Re-run `init_db` against the DB**

```bash
uv run python -c "from sqlmodel import Session; from app.core.db import engine, init_db; \
init_db(Session(engine))"
```

Then verify the three users exist with the expected roles:

```bash
uv run python -c "from sqlmodel import Session, select; from app.core.db import engine; \
from app.models import User; s = Session(engine); \
print([(u.email, u.role.value, u.is_superuser) for u in s.exec(select(User)).all()])"
```

Expected: includes `(admin@example.com or settings.FIRST_SUPERUSER, 'admin', True)`, `('manager@example.com', 'manager', False)`, `('member@example.com', 'member', False)`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/db.py
git commit -m "feat(seed): init_db seeds admin, manager, and member users"
```

---

## Task 6: Re-gate user routes per the permission matrix

**Files:**
- Modify: `backend/app/api/routes/users.py:8-12, 32-36, 54-56, 182-186, 214`

The matrix dictates these four route changes:

| Route | New guard |
|-------|-----------|
| `GET /users/` | `require_roles(Role.ADMIN, Role.MANAGER)` |
| `POST /users/` | `require_roles(Role.ADMIN)` |
| `PATCH /users/{id}` | `require_roles(Role.ADMIN)` |
| `DELETE /users/{id}` | `require_roles(Role.ADMIN)` |

The inline `is_superuser` checks inside route bodies at lines 137, 172, and 224 are **out of scope** — leave them alone. They are separate-concern guards (self-delete protection, read-self bypass) and are addressed in the follow-up ADR.

- [ ] **Step 1: Confirm no test currently asserts manager/member access to `GET /users/`**

```bash
uv run grep -n "users" tests/api/routes/test_users.py | grep -i manager
```

Expected: no output. Task 8 adds these tests.

- [ ] **Step 2: Edit the imports in `users.py`**

Change the import block at lines 8–12 from:

```python
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
```

to:

```python
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
    require_roles,
)
```

Add `Role` to the model import block at lines 15–26:

```python
from app.models import (
    Item,
    Message,
    Role,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
```

- [ ] **Step 3: Swap the guard on `GET /users/`** (line 32)

Replace:

```python
@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
```

with:

```python
@router.get(
    "/",
    dependencies=[Depends(require_roles(Role.ADMIN, Role.MANAGER))],
    response_model=UsersPublic,
)
```

- [ ] **Step 4: Swap the guard on `POST /users/`** (line 54)

Replace:

```python
@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
```

with:

```python
@router.post(
    "/",
    dependencies=[Depends(require_roles(Role.ADMIN))],
    response_model=UserPublic,
)
```

- [ ] **Step 5: Swap the guard on `PATCH /users/{user_id}`** (line 182)

Replace:

```python
@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
```

with:

```python
@router.patch(
    "/{user_id}",
    dependencies=[Depends(require_roles(Role.ADMIN))],
    response_model=UserPublic,
)
```

- [ ] **Step 6: Swap the guard on `DELETE /users/{user_id}`** (line 214)

Replace:

```python
@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
```

with:

```python
@router.delete(
    "/{user_id}",
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
```

- [ ] **Step 7: Run the existing test suite to confirm no regressions for the admin path**

```bash
uv run pytest tests/api/routes/test_users.py -v
```

Expected: all existing tests still pass. They all run with `superuser_token_headers`, which after Task 5 corresponds to a `role=admin` user, so every existing path remains allowed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/users.py
git commit -m "feat(routes): re-gate user routes with require_roles per matrix"
```

---

## Task 7: `GET /metrics/` stub endpoint

**Files:**
- Create: `backend/app/api/routes/metrics.py`
- Modify: `backend/app/api/main.py:3-4, 8-10`
- Create: `backend/tests/api/routes/test_metrics.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/routes/test_metrics.py`:

```python
from fastapi.testclient import TestClient

from app.core.config import settings


def test_metrics_allowed_for_admin(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/metrics/", headers=superuser_token_headers)

    assert r.status_code == 200
    body = r.json()
    assert "users_total" in body


def test_metrics_returns_403_without_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/metrics/")
    # Templates return 401 for missing token; this asserts the route exists and
    # the auth dependency runs before the body.
    assert r.status_code in (401, 403)
```

(Manager and member denial tests are covered in Task 8 once the role-token helper exists.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
uv run pytest tests/api/routes/test_metrics.py -v
```

Expected: FAIL — 404 on the metrics URL (route not registered).

- [ ] **Step 3: Create the metrics router**

Create `backend/app/api/routes/metrics.py` with this content:

```python
from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import func, select

from app.api.deps import SessionDep, require_roles
from app.models import Role, User

router = APIRouter(
    prefix="/metrics",
    tags=["metrics"],
    dependencies=[Depends(require_roles(Role.ADMIN, Role.MANAGER))],
)


@router.get("/")
def read_metrics(session: SessionDep) -> dict[str, Any]:
    """Stub metrics endpoint. Returns simple aggregate counts."""
    users_total = session.exec(select(func.count()).select_from(User)).one()
    return {"users_total": users_total, "active_today": 0}
```

The `dependencies=[...]` on the router applies to every route inside it, so future endpoints added under `/metrics` inherit the same guard.

- [ ] **Step 4: Register the router**

Edit `backend/app/api/main.py`. Add `metrics` to the import and include it:

```python
from fastapi import APIRouter

from app.api.routes import items, login, metrics, private, users, utils
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(metrics.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
uv run pytest tests/api/routes/test_metrics.py -v
```

Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/metrics.py backend/app/api/main.py backend/tests/api/routes/test_metrics.py
git commit -m "feat(routes): add GET /metrics/ stub gated to admin and manager"
```

---

## Task 8: Authorization matrix tests for manager and member

**Files:**
- Modify: `backend/tests/utils/user.py`
- Modify: `backend/tests/api/routes/test_users.py` (append)
- Modify: `backend/tests/api/routes/test_metrics.py` (append)
- Modify: `backend/tests/conftest.py` — add `manager_token_headers` and `member_token_headers` fixtures

- [ ] **Step 1: Add a role-aware token helper**

Append to `backend/tests/utils/user.py`:

```python
from app.models import Role


def authentication_token_for_role(
    *, client: TestClient, db: Session, email: str, role: Role
) -> dict[str, str]:
    """Ensure a user with the given email exists at the given role, return auth headers.

    Idempotent: if the user already exists, the role is updated to match.
    """
    password = random_lower_string()
    user = crud.get_user_by_email(session=db, email=email)
    if user is None:
        user_in = UserCreate(email=email, password=password, role=role)
        user = crud.create_user(session=db, user_create=user_in)
    else:
        user = crud.update_user(
            session=db, db_user=user, user_in=UserUpdate(password=password, role=role)
        )
    return user_authentication_headers(client=client, email=email, password=password)
```

Also add the import near the top: `from tests.utils.utils import random_email, random_lower_string` is already there; no further additions beyond `from app.models import Role`.

- [ ] **Step 2: Add fixtures for manager and member tokens**

Append to `backend/tests/conftest.py`:

```python
from app.models import Role
from tests.utils.user import authentication_token_for_role


@pytest.fixture(scope="module")
def manager_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_for_role(
        client=client, db=db, email="manager-test@example.com", role=Role.MANAGER
    )


@pytest.fixture(scope="module")
def member_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_for_role(
        client=client, db=db, email="member-test@example.com", role=Role.MEMBER
    )
```

(Distinct emails from the seed users so the fixtures don't fight `init_db`.)

- [ ] **Step 3: Write the matrix tests for `/users/`**

Append to `backend/tests/api/routes/test_users.py`:

```python
# --- RBAC matrix: GET /users/ ---


def test_list_users_allowed_for_manager(
    client: TestClient, manager_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/", headers=manager_token_headers)
    assert r.status_code == 200


def test_list_users_forbidden_for_member(
    client: TestClient, member_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/", headers=member_token_headers)
    assert r.status_code == 403


# --- RBAC matrix: POST /users/ ---


def test_create_user_forbidden_for_manager(
    client: TestClient, manager_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=manager_token_headers,
        json={"email": random_email(), "password": random_lower_string()},
    )
    assert r.status_code == 403


def test_create_user_forbidden_for_member(
    client: TestClient, member_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=member_token_headers,
        json={"email": random_email(), "password": random_lower_string()},
    )
    assert r.status_code == 403


# --- RBAC matrix: PATCH /users/{id} (update any) ---


def test_update_any_user_forbidden_for_manager(
    client: TestClient, manager_token_headers: dict[str, str], db: Session
) -> None:
    target = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string()),
    )
    r = client.patch(
        f"{settings.API_V1_STR}/users/{target.id}",
        headers=manager_token_headers,
        json={"full_name": "Should Not Update"},
    )
    assert r.status_code == 403


# --- RBAC matrix: profile self-update is allowed for every role ---


def test_member_can_update_own_profile(
    client: TestClient, member_token_headers: dict[str, str]
) -> None:
    r = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=member_token_headers,
        json={"full_name": "Member Self Update"},
    )
    assert r.status_code == 200
    assert r.json()["full_name"] == "Member Self Update"
```

- [ ] **Step 4: Write the matrix tests for `/metrics/`**

Append to `backend/tests/api/routes/test_metrics.py`:

```python
def test_metrics_allowed_for_manager(
    client: TestClient, manager_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/metrics/", headers=manager_token_headers
    )
    assert r.status_code == 200


def test_metrics_forbidden_for_member(
    client: TestClient, member_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/metrics/", headers=member_token_headers
    )
    assert r.status_code == 403
```

- [ ] **Step 5: Run the full new-test surface**

```bash
uv run pytest tests/api/routes/test_users.py tests/api/routes/test_metrics.py -v
```

Expected: PASS for every new test, no regressions in the existing tests.

- [ ] **Step 6: Run the whole backend test suite as a final check**

```bash
uv run bash scripts/tests-start.sh
```

Expected: green. Coverage report prints at the end.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/utils/user.py backend/tests/conftest.py backend/tests/api/routes/test_users.py backend/tests/api/routes/test_metrics.py
git commit -m "test(rbac): cover allowed and denied paths per permission matrix"
```

---

## Cross-cutting Verification

After all tasks are committed, run this checklist:

- [ ] `git log --oneline` shows seven RBAC commits (Tasks 1–7) plus the Task 8 test commit
- [ ] `rg "get_current_active_superuser" backend/app/api/routes/` only matches the routes deliberately out of scope (none inside `users.py` after Task 6)
- [ ] `rg "require_roles" backend/app/api/routes/` lists exactly five sites: `users.py` (4) and `metrics.py` (1, on the router)
- [ ] `rg "is_superuser" backend/app/` still appears in `items.py`, `users.py` (inline self-guards), `core/db.py`, `models.py`, `crud.py`, `deps.py` — these are intentionally left alone
- [ ] `uv run bash scripts/tests-start.sh` exits 0
- [ ] `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` is idempotent
- [ ] After `init_db`, querying `User` returns at least one row each for `role IN ('admin', 'manager', 'member')`

---

## Out-of-Scope Reminder

The frontend half (rendering `<RequireRole>`, `can()` helper, hiding nav, AccessDenied screen) lives in [adr/frontend-capabilities-can-helper.md](../../../adr/frontend-capabilities-can-helper.md) and is **not** covered by this plan. Migrating the remaining `is_superuser` consumers (sidebar, admin columns/forms, settings layout, admin route guard, `items.py` ownership checks) is deferred to the future `deprecate-is-superuser` ADR.
