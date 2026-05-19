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
