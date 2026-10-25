"""appointments_and_durable_reminder_tasks

Revision ID: 8d716ab6add5
Revises: c83a1b4d2e5f
Create Date: 2026-10-25 21:00:42.044873
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8d716ab6add5'
down_revision: Union[str, None] = 'c83a1b4d2e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    # 1. appointments table
    if 'appointments' not in existing_tables:
        op.create_table(
            'appointments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('patient_id', sa.String(), nullable=True),
            sa.Column('report_id', sa.Integer(), nullable=True),
            sa.Column('doctor_name', sa.String(), nullable=True),
            sa.Column('doctor_specialty', sa.String(), nullable=True),
            sa.Column('appointment_at_utc', sa.DateTime(), nullable=False),
            sa.Column('timezone', sa.String(), nullable=True, server_default='Asia/Kolkata'),
            sa.Column('state', sa.String(), nullable=True, server_default='scheduled'),
            sa.Column('version', sa.Integer(), nullable=True, server_default='1'),
            sa.Column('confirmed_source', sa.String(), nullable=True, server_default='prescription_reviewed'),
            sa.Column('reschedule_preferred_date', sa.String(), nullable=True),
            sa.Column('reschedule_notes', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
            sa.ForeignKeyConstraint(['report_id'], ['reports.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        with op.batch_alter_table('appointments', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_appointments_patient_id'), ['patient_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_appointments_report_id'), ['report_id'], unique=False)
            batch_op.create_index('ix_appointments_patient_at', ['patient_id', 'appointment_at_utc'], unique=False)

    # 2. reminder_tasks table (durable outbox with atomic claims and idempotency key)
    if 'reminder_tasks' not in existing_tables:
        op.create_table(
            'reminder_tasks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('patient_id', sa.String(), nullable=True),
            sa.Column('appointment_id', sa.Integer(), nullable=True),
            sa.Column('dose_adherence_id', sa.Integer(), nullable=True),
            sa.Column('report_id', sa.Integer(), nullable=True),
            sa.Column('channel', sa.String(), nullable=True, server_default='whatsapp'),
            sa.Column('kind', sa.String(), nullable=True, server_default='followup'),
            sa.Column('reminder_at_utc', sa.DateTime(), nullable=False),
            sa.Column('offset_minutes', sa.Integer(), nullable=True, server_default='2880'),
            sa.Column('state', sa.String(), nullable=True, server_default='pending'),
            sa.Column('idempotency_key', sa.String(), nullable=False),
            sa.Column('lease_until', sa.DateTime(), nullable=True),
            sa.Column('attempts', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('max_attempts', sa.Integer(), nullable=True, server_default='3'),
            sa.Column('next_attempt_at', sa.DateTime(), nullable=True),
            sa.Column('last_error', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id']),
            sa.ForeignKeyConstraint(['dose_adherence_id'], ['dose_adherences.id']),
            sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('idempotency_key', name='uq_reminder_task_idempotency_key'),
        )
        with op.batch_alter_table('reminder_tasks', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_reminder_tasks_patient_id'), ['patient_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_reminder_tasks_appointment_id'), ['appointment_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_reminder_tasks_reminder_at_utc'), ['reminder_at_utc'], unique=False)
            batch_op.create_index('ix_reminder_tasks_claim', ['state', 'reminder_at_utc', 'lease_until'], unique=False)

    # 3. patients table: channel consent audit columns
    patient_cols = {c['name'] for c in insp.get_columns('patients')}
    with op.batch_alter_table('patients', schema=None) as batch_op:
        if 'whatsapp_consent_source' not in patient_cols:
            batch_op.add_column(sa.Column('whatsapp_consent_source', sa.String(), nullable=True, server_default='signup'))
        if 'whatsapp_consent_withdrawn_at' not in patient_cols:
            batch_op.add_column(sa.Column('whatsapp_consent_withdrawn_at', sa.DateTime(), nullable=True))
        if 'call_consent_source' not in patient_cols:
            batch_op.add_column(sa.Column('call_consent_source', sa.String(), nullable=True))
        if 'call_consent_withdrawn_at' not in patient_cols:
            batch_op.add_column(sa.Column('call_consent_withdrawn_at', sa.DateTime(), nullable=True))

    # 4. dose_adherences table: unique slot constraint
    if 'dose_adherences' in existing_tables:
        existing_uqs = {u['name'] for u in insp.get_unique_constraints('dose_adherences')}
        if 'uq_dose_adherence_slot' not in existing_uqs:
            with op.batch_alter_table('dose_adherences', schema=None) as batch_op:
                batch_op.create_unique_constraint(
                    'uq_dose_adherence_slot',
                    ['patient_id', 'medicine_id', 'dose_date', 'slot'],
                )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    if 'dose_adherences' in existing_tables:
        existing_uqs = {u['name'] for u in insp.get_unique_constraints('dose_adherences')}
        if 'uq_dose_adherence_slot' in existing_uqs:
            with op.batch_alter_table('dose_adherences', schema=None) as batch_op:
                batch_op.drop_constraint('uq_dose_adherence_slot', type_='unique')

    patient_cols = {c['name'] for c in insp.get_columns('patients')}
    with op.batch_alter_table('patients', schema=None) as batch_op:
        if 'call_consent_withdrawn_at' in patient_cols:
            batch_op.drop_column('call_consent_withdrawn_at')
        if 'call_consent_source' in patient_cols:
            batch_op.drop_column('call_consent_source')
        if 'whatsapp_consent_withdrawn_at' in patient_cols:
            batch_op.drop_column('whatsapp_consent_withdrawn_at')
        if 'whatsapp_consent_source' in patient_cols:
            batch_op.drop_column('whatsapp_consent_source')

    if 'reminder_tasks' in existing_tables:
        with op.batch_alter_table('reminder_tasks', schema=None) as batch_op:
            batch_op.drop_index('ix_reminder_tasks_claim')
            batch_op.drop_index(batch_op.f('ix_reminder_tasks_reminder_at_utc'))
            batch_op.drop_index(batch_op.f('ix_reminder_tasks_appointment_id'))
            batch_op.drop_index(batch_op.f('ix_reminder_tasks_patient_id'))
        op.drop_table('reminder_tasks')

    if 'appointments' in existing_tables:
        with op.batch_alter_table('appointments', schema=None) as batch_op:
            batch_op.drop_index('ix_appointments_patient_at')
            batch_op.drop_index(batch_op.f('ix_appointments_report_id'))
            batch_op.drop_index(batch_op.f('ix_appointments_patient_id'))
        op.drop_table('appointments')
