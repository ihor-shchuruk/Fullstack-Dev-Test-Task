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
