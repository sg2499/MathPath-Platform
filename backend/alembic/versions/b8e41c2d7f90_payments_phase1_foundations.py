"""Payments Phase 1: fee items, business details, centres, numbering, audit

Revision ID: b8e41c2d7f90
Revises: a7c3f8e91b2d
Create Date: 2026-10-08 00:00:00.000000

2026-10-08 (Shailesh, Payments): the foundation tables every payments phase
builds on, plus students.centre_id. Production creates these at startup
(Base.metadata.create_all + schema_migration.ensure_payments_foundation);
this migration does the same for an Alembic-managed database. Every step is
skipped when the table or column already exists, so it is safe either way.
Additive only: no existing table or row is changed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e41c2d7f90"
down_revision: Union[str, Sequence[str], None] = "a7c3f8e91b2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "payment_centres" not in tables:
        op.create_table(
            "payment_centres",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("code", sa.String(40), nullable=False, unique=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("phone", sa.String(60), nullable=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_business_profile" not in tables:
        op.create_table(
            "payment_business_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("legal_name", sa.String(200), nullable=False),
            sa.Column("brand_name", sa.String(200), nullable=True),
            sa.Column("gstin", sa.String(15), nullable=True),
            sa.Column("pan", sa.String(10), nullable=True),
            sa.Column("registered_address", sa.Text(), nullable=True),
            sa.Column("email", sa.String(150), nullable=True),
            sa.Column("phone", sa.String(80), nullable=True),
            sa.Column("logo_url", sa.Text(), nullable=True),
            sa.Column("invoice_footer", sa.Text(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "fee_items" not in tables:
        op.create_table(
            "fee_items",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("name_key", sa.String(150), nullable=False, unique=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("gst_included", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("gst_rate_bps", sa.Integer(), nullable=False, server_default="1800"),
            sa.Column("billing_type", sa.String(20), nullable=False, server_default="ONE_TIME"),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("legacy_names_json", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_number_sequences" not in tables:
        op.create_table(
            "payment_number_sequences",
            sa.Column("key", sa.String(20), primary_key=True),
            sa.Column("prefix", sa.String(20), nullable=False),
            sa.Column("pad_width", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("last_issued_number", sa.Integer(), nullable=True),
            sa.Column("is_configured", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_audit_log" not in tables:
        op.create_table(
            "payment_audit_log",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("entity_type", sa.String(40), nullable=False),
            sa.Column("entity_id", sa.String(), nullable=False),
            sa.Column("action", sa.String(40), nullable=False),
            sa.Column("actor_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("actor_name", sa.String(150), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("before_json", sa.Text(), nullable=True),
            sa.Column("after_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_payment_audit_log_entity_type", "payment_audit_log", ["entity_type"])
        op.create_index("ix_payment_audit_log_entity_id", "payment_audit_log", ["entity_id"])
        op.create_index("ix_payment_audit_log_created_at", "payment_audit_log", ["created_at"])

    student_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("students")}
    if "centre_id" not in student_columns:
        op.add_column("students", sa.Column("centre_id", sa.String(), nullable=True))
        op.create_index("ix_students_centre_id", "students", ["centre_id"])


def downgrade() -> None:
    student_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("students")}
    if "centre_id" in student_columns:
        op.drop_index("ix_students_centre_id", table_name="students")
        op.drop_column("students", "centre_id")
    tables = _tables()
    for table in ["payment_audit_log", "payment_number_sequences", "fee_items", "payment_business_profile", "payment_centres"]:
        if table in tables:
            op.drop_table(table)
