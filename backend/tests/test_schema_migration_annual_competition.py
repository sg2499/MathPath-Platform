"""Covers `ensure_annual_competition_tables()`'s raw-SQL startup safety net
directly -- this repo's own comments note production deploys have not
always run `alembic upgrade head` reliably, so this function is the thing
that actually determines what tables exist on a real deploy.

Added alongside the REQUIREMENTS.md item 6 "technical issue" retry-override
feature, after discovering `competition_event_attempt_answers` (Package 5)
had zero coverage here or in any Alembic migration despite Package 5/6
depending on it at runtime -- see this function's own inline comment and
the matching Alembic migration
(7f3c9a1e5d02_add_annual_competition_retry_grants.py) for the full story.
No dedicated test previously existed for this function at all; this is
deliberately narrow (just table presence + idempotency), not a full
re-test of every Annual Competition table this function has ever created.
"""

import sqlalchemy as sa
from sqlalchemy import inspect

from app.services import schema_migration


def _isolated_engine():
    return sa.create_engine("sqlite:///:memory:", future=True)


def test_ensure_annual_competition_tables_creates_the_full_set(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_tables()

    tables = set(inspect(test_engine).get_table_names())
    for expected in (
        "competition_events",
        "competition_event_slots",
        "competition_event_level_papers",
        "competition_event_section_timers",
        "competition_event_assignments",
        "competition_event_attempts",
        "competition_event_attempt_section_states",
        "competition_event_results",
        # The two backfilled here alongside the retry-grants feature.
        "competition_event_attempt_answers",
        "competition_event_attempt_retry_grants",
    ):
        assert expected in tables, f"{expected} was not created by the safety net"


def test_ensure_annual_competition_tables_backfilled_answers_table_has_expected_columns(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_tables()

    columns = {c["name"] for c in inspect(test_engine).get_columns("competition_event_attempt_answers")}
    assert columns == {
        "id", "attempt_id", "mock_question_id", "selected_option_id",
        "is_correct", "answered_at", "updated_at",
    }


def test_ensure_annual_competition_tables_retry_grants_table_has_expected_columns(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_tables()

    columns = {c["name"] for c in inspect(test_engine).get_columns("competition_event_attempt_retry_grants")}
    assert columns == {
        "id", "event_id", "assignment_id", "student_id", "granted_by_user_id",
        "reason", "status", "used_attempt_id", "granted_at", "used_at",
    }


def test_ensure_annual_competition_tables_is_idempotent(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_tables()
    schema_migration.ensure_annual_competition_tables()  # must not raise

    tables = set(inspect(test_engine).get_table_names())
    assert "competition_event_attempt_retry_grants" in tables
