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
    # selected_value (Point 8, 2026-09-08): typed free-text answer column,
    # added alongside the pre-existing (now-unused-by-the-save-path, but
    # still-present) selected_option_id -- see ensure_annual_competition_
    # answer_text_column's own docstring for why a brand-new environment
    # gets this straight from the CREATE TABLE rather than relying only on
    # the self-heal ALTER path.
    assert columns == {
        "id", "attempt_id", "mock_question_id", "selected_option_id", "selected_value",
        "is_correct", "answered_at", "updated_at",
    }


def test_ensure_annual_competition_answer_text_column_backfills_existing_table(monkeypatch):
    """The self-heal path (schema_migration.ensure_annual_competition_answer_text_column):
    an environment that already ran ensure_annual_competition_tables() before
    selected_value existed must still get the column added via ALTER TABLE,
    not just on a brand-new CREATE TABLE."""
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    with test_engine.begin() as connection:
        connection.execute(sa.text("""
            CREATE TABLE competition_event_attempt_answers (
                id VARCHAR PRIMARY KEY,
                attempt_id VARCHAR NOT NULL,
                mock_question_id VARCHAR NOT NULL,
                selected_option_id VARCHAR,
                is_correct BOOLEAN,
                answered_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """))

    columns_before = {c["name"] for c in inspect(test_engine).get_columns("competition_event_attempt_answers")}
    assert "selected_value" not in columns_before

    schema_migration.ensure_annual_competition_answer_text_column()

    columns_after = {c["name"] for c in inspect(test_engine).get_columns("competition_event_attempt_answers")}
    assert "selected_value" in columns_after

    # Idempotent -- running it again against an already-migrated table must
    # not error (no duplicate-column ALTER).
    schema_migration.ensure_annual_competition_answer_text_column()


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


# ---------------------------------------------------------------------------
# ensure_annual_competition_go_live_columns() -- Package 10 (go-live
# rollback plan). ensure_annual_competition_tables() above only ever
# CREATEs competition_events/competition_event_results if they don't
# already exist, so on a real deploy that already has those tables (every
# environment that has run this epic's earlier packages) it would never add
# these new columns -- this is the backfill for exactly that gap, same
# class of bug the retry-grants migration's own docstring already
# describes for a brand new table.
# ---------------------------------------------------------------------------

def test_ensure_annual_competition_go_live_columns_backfills_onto_pre_existing_tables(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    # Simulate a real pre-Package-10 deploy: the tables already exist (via
    # the safety net above), in their OLD shape -- before the new columns.
    schema_migration.ensure_annual_competition_tables()
    old_event_columns = {c["name"] for c in inspect(test_engine).get_columns("competition_events")}
    old_result_columns = {c["name"] for c in inspect(test_engine).get_columns("competition_event_results")}
    assert "attempts_suspended_at" not in old_event_columns
    assert "is_voided" not in old_result_columns

    schema_migration.ensure_annual_competition_go_live_columns()

    event_columns = {c["name"] for c in inspect(test_engine).get_columns("competition_events")}
    assert {"attempts_suspended_at", "suspension_reason", "suspended_by_user_id"} <= event_columns

    result_columns = {c["name"] for c in inspect(test_engine).get_columns("competition_event_results")}
    assert {"is_voided", "voided_reason", "voided_at", "voided_by_user_id"} <= result_columns


def test_ensure_annual_competition_go_live_columns_is_idempotent(monkeypatch):
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_tables()
    schema_migration.ensure_annual_competition_go_live_columns()
    schema_migration.ensure_annual_competition_go_live_columns()  # must not raise

    result_columns = {c["name"] for c in inspect(test_engine).get_columns("competition_event_results")}
    assert "is_voided" in result_columns


def test_ensure_annual_competition_go_live_columns_noop_when_tables_absent(monkeypatch):
    """Fresh install where Base.metadata.create_all() hasn't run yet and
    ensure_annual_competition_tables() hasn't been called first -- must not
    raise just because the tables don't exist."""
    test_engine = _isolated_engine()
    monkeypatch.setattr(schema_migration, "engine", test_engine)

    schema_migration.ensure_annual_competition_go_live_columns()  # must not raise
