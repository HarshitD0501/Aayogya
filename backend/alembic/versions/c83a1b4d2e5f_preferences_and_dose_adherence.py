"""patient reminder preferences, medicine stop/reminder columns, and dose_adherences table

Revision ID: c83a1b4d2e5f
Revises: b103a9018f2c
Create Date: 2026-10-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c83a1b4d2e5f'
down_revision: Union[str, None] = 'b103a9018f2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    # 1. dose_adherences table
    if 'dose_adherences' not in existing_tables:
        op.create_table(
            'dose_adherences',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('patient_id', sa.String(), nullable=True),
            sa.Column('medicine_id', sa.Integer(), nullable=True),
            sa.Column('dose_date', sa.String(), nullable=True),
            sa.Column('slot', sa.String(), nullable=True),
            sa.Column('status', sa.String(), nullable=True, server_default='pending'),
            sa.Column('scheduled_time', sa.String(), nullable=True),
            sa.Column('confirmed_at', sa.DateTime(), nullable=True),
            sa.Column('channel', sa.String(), nullable=True, server_default='whatsapp'),
            sa.Column('whatsapp_message_id', sa.String(), nullable=True),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id']),
            sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        with op.batch_alter_table('dose_adherences', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_dose_adherences_dose_date'), ['dose_date'], unique=False)
            batch_op.create_index(batch_op.f('ix_dose_adherences_medicine_id'), ['medicine_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_dose_adherences_patient_id'), ['patient_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_dose_adherences_slot'), ['slot'], unique=False)
            batch_op.create_index(batch_op.f('ix_dose_adherences_whatsapp_message_id'), ['whatsapp_message_id'], unique=False)
            batch_op.create_index('ix_dose_adherence_patient_date', ['patient_id', 'dose_date'], unique=False)
            batch_op.create_index('ix_dose_adherence_patient_slot', ['patient_id', 'dose_date', 'slot'], unique=False)

    # 2. patients table columns
    patient_cols = {c['name'] for c in insp.get_columns('patients')}
    with op.batch_alter_table('patients', schema=None) as batch_op:
        if 'auto_reminders_enabled' not in patient_cols:
            batch_op.add_column(sa.Column('auto_reminders_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))
        if 'whatsapp_reminders_enabled' not in patient_cols:
            batch_op.add_column(sa.Column('whatsapp_reminders_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))
        if 'call_reminders_enabled' not in patient_cols:
            batch_op.add_column(sa.Column('call_reminders_enabled', sa.Boolean(), nullable=True, server_default=sa.false()))
        if 'reminder_time_morning' not in patient_cols:
            batch_op.add_column(sa.Column('reminder_time_morning', sa.String(), nullable=True, server_default='08:00 AM'))
        if 'reminder_time_afternoon' not in patient_cols:
            batch_op.add_column(sa.Column('reminder_time_afternoon', sa.String(), nullable=True, server_default='01:00 PM'))
        if 'reminder_time_night' not in patient_cols:
            batch_op.add_column(sa.Column('reminder_time_night', sa.String(), nullable=True, server_default='08:00 PM'))

    # 3. medicines table columns
    medicine_cols = {c['name'] for c in insp.get_columns('medicines')}
    with op.batch_alter_table('medicines', schema=None) as batch_op:
        if 'reminders_enabled' not in medicine_cols:
            batch_op.add_column(sa.Column('reminders_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))
        if 'stopped_at' not in medicine_cols:
            batch_op.add_column(sa.Column('stopped_at', sa.DateTime(), nullable=True))
        if 'stopped_reason' not in medicine_cols:
            batch_op.add_column(sa.Column('stopped_reason', sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    if 'dose_adherences' in existing_tables:
        with op.batch_alter_table('dose_adherences', schema=None) as batch_op:
            batch_op.drop_index('ix_dose_adherence_patient_slot')
            batch_op.drop_index('ix_dose_adherence_patient_date')
            batch_op.drop_index(batch_op.f('ix_dose_adherences_whatsapp_message_id'))
            batch_op.drop_index(batch_op.f('ix_dose_adherences_slot'))
            batch_op.drop_index(batch_op.f('ix_dose_adherences_patient_id'))
            batch_op.drop_index(batch_op.f('ix_dose_adherences_medicine_id'))
            batch_op.drop_index(batch_op.f('ix_dose_adherences_dose_date'))
        op.drop_table('dose_adherences')

    medicine_cols = {c['name'] for c in insp.get_columns('medicines')}
    with op.batch_alter_table('medicines', schema=None) as batch_op:
        if 'stopped_reason' in medicine_cols:
            batch_op.drop_column('stopped_reason')
        if 'stopped_at' in medicine_cols:
            batch_op.drop_column('stopped_at')
        if 'reminders_enabled' in medicine_cols:
            batch_op.drop_column('reminders_enabled')

    patient_cols = {c['name'] for c in insp.get_columns('patients')}
    with op.batch_alter_table('patients', schema=None) as batch_op:
        if 'reminder_time_night' in patient_cols:
            batch_op.drop_column('reminder_time_night')
        if 'reminder_time_afternoon' in patient_cols:
            batch_op.drop_column('reminder_time_afternoon')
        if 'reminder_time_morning' in patient_cols:
            batch_op.drop_column('reminder_time_morning')
        if 'call_reminders_enabled' in patient_cols:
            batch_op.drop_column('call_reminders_enabled')
        if 'whatsapp_reminders_enabled' in patient_cols:
            batch_op.drop_column('whatsapp_reminders_enabled')
        if 'auto_reminders_enabled' in patient_cols:
            batch_op.drop_column('auto_reminders_enabled')
