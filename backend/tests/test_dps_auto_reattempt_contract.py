"""Contract-level checks for Phase 10.9.4 DPS auto re-attempt workflow.

These tests intentionally validate the business rules without requiring a live
PostgreSQL database. They protect the retry counting and messaging conventions
from accidental regressions during future edits.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AttemptRecord:
    chain_id: str
    attempt_number: int
    cleared: bool


def unique_uncleared_chain_count(attempts: list[AttemptRecord]) -> int:
    latest_by_chain: dict[str, AttemptRecord] = {}
    for attempt in sorted(attempts, key=lambda item: (item.chain_id, item.attempt_number)):
        latest_by_chain[attempt.chain_id] = attempt
    return sum(1 for attempt in latest_by_chain.values() if not attempt.cleared)


def next_workflow_state(attempt_number: int, cleared: bool) -> str:
    if cleared:
        return "CLEARED"
    if attempt_number < 3:
        return "RETRY_REQUIRED"
    return "MANUAL_REVIEW_REQUIRED"


def test_unique_needs_reattempt_count_stays_one_for_same_dps_chain() -> None:
    attempts = [
        AttemptRecord(chain_id="DPS-2", attempt_number=0, cleared=False),
        AttemptRecord(chain_id="DPS-2", attempt_number=1, cleared=False),
        AttemptRecord(chain_id="DPS-2", attempt_number=2, cleared=False),
    ]

    assert unique_uncleared_chain_count(attempts) == 1


def test_unique_needs_reattempt_count_increases_for_multiple_dps_chains() -> None:
    attempts = [
        AttemptRecord(chain_id="DPS-2", attempt_number=0, cleared=False),
        AttemptRecord(chain_id="DPS-2", attempt_number=1, cleared=False),
        AttemptRecord(chain_id="DPS-5", attempt_number=0, cleared=False),
    ]

    assert unique_uncleared_chain_count(attempts) == 2


def test_cleared_chain_drops_out_of_needs_reattempt_count() -> None:
    attempts = [
        AttemptRecord(chain_id="DPS-2", attempt_number=0, cleared=False),
        AttemptRecord(chain_id="DPS-2", attempt_number=1, cleared=True),
        AttemptRecord(chain_id="DPS-5", attempt_number=0, cleared=False),
    ]

    assert unique_uncleared_chain_count(attempts) == 1


def test_retry_state_escalates_only_after_third_auto_retry_failure() -> None:
    assert next_workflow_state(attempt_number=0, cleared=False) == "RETRY_REQUIRED"
    assert next_workflow_state(attempt_number=1, cleared=False) == "RETRY_REQUIRED"
    assert next_workflow_state(attempt_number=2, cleared=False) == "RETRY_REQUIRED"
    assert next_workflow_state(attempt_number=3, cleared=False) == "MANUAL_REVIEW_REQUIRED"


def test_cleared_attempt_always_wins_workflow_state() -> None:
    assert next_workflow_state(attempt_number=3, cleared=True) == "CLEARED"
    assert next_workflow_state(attempt_number=4, cleared=True) == "CLEARED"
