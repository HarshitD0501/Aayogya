"""add Google identity subject to patient accounts

Revision ID: b103a9018f2c
Revises: 04972bb8e1f9
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b103a9018f2c"
down_revision: Union[str, None] = "04972bb8e1f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("patients") as batch_op:
        batch_op.add_column(sa.Column("google_sub", sa.String(), nullable=True))
        batch_op.create_index("ix_patients_google_sub", ["google_sub"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("patients") as batch_op:
        batch_op.drop_index("ix_patients_google_sub")
        batch_op.drop_column("google_sub")
