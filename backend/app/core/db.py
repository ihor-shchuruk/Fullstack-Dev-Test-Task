from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import Role, User, UserCreate

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


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
