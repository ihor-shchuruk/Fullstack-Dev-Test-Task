"""add user role

Revision ID: 4b13ccdd6106
Revises: fe56fa70289e
Create Date: 2026-05-19 11:52:56.249418

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4b13ccdd6106'
down_revision = 'fe56fa70289e'
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
