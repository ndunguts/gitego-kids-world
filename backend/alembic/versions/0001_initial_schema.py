"""Initial Gitego Kids World 33-table schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-11-21
"""
from alembic import op
from app.database import Base
import app.models  # noqa: F401

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
