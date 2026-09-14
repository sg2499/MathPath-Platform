"""Covers `ensure_assignments_assigned_to_id_indexed()` directly -- the
2026-09-14 performance-batch fix for `assignments.assigned_to_id` never
having carried an index despite being filtered on directly in roughly a
dozen hot-path queries (student dashboard, teacher rosters, admin
reporting).

This function exists *in addition to* the Alembic migration
(b7c1e4f0a2d9_add_index_on_assignments_assigned_to_id.py) and the
`index=True` declaration on the ORM model, because this repo's own
project-memory docs (COWORK_HANDOFF.md, CLAUDE_CODE_STATUS.md) document
Alembic as having previously silently no-op'd against production here --
the `ensure_*` functions called unconditionally from main.py's
on_startup() are the migration mechanism actually relied on for real
deploys. Deliberately narrow, matching this file's siblings: just index
presence + idempotency against a minimal hand-built `assignments` table,
not a full re-test of the Assignment model.
"""

import sqlalchemy as sa
from sqlalchemy import inspect

from app.services import schema_migration


def _isolated_engine():
    return sa.create_engine("sqlite:///:memory:", future=True)


def _create_minimal_assignments_table(test_engine) -> None:
    with test_engine.begin() as connection:
        connection.execute(sa.text("""
            CREATE TABLE assignments (
                id VARCHAR PRIMARY KEY,
                assigned_to_id VARCHAR NOT NULL,
                created_at TIMESTAMP,
                notified_at TIMESTAMP
            )
        """))


def test_ensure_assignments_assigned_to_id_indexed_creates_the_index(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)
    _create_minimal_assignments_table(test_engine)

    indexes_before = inspect(test_engine).get_indexes("assignments")
    assert not any(i["name"] == "ix_assignments_assigned_to_id" for i in indexes_before)

    schema_migration.ensure_assignments_assigned_to_id_indexed()

    indexes_after = inspect(test_engine).get_indexes("assignments")
    matching = [i for i in indexes_after if i["name"] == "ix_assignments_assigned_to_id"]
    assert len(matching) == 1
    assert matching[0]["column_names"] == ["assigned_to_id"]


def test_ensure_assignments_assigned_to_id_indexed_is_idempotent(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)
    _create_minimal_assignments_table(test_engine)

    schema_migration.ensure_assignments_assigned_to_id_indexed()
    schema_migration.ensure_assignments_assigned_to_id_indexed()  # must not raise

    indexes = inspect(test_engine).get_indexes("assignments")
    matching = [i for i in indexes if i["name"] == "ix_assignments_assigned_to_id"]
    assert len(matching) == 1
