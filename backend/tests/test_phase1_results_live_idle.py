"""Phase 1 (2026-10-12): results and live board in the level sequence, the
live board's slot filter, and the 20-minute idle sign-out for teachers and
students.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import dependencies
from app.services import annual_competition_monitoring_service as monitoring
from app.services.annual_competition_scoring_service import ListCompetitionEventResultsForAdmin
from test_annual_competition_monitoring_service import (
    _assignment,
    _event,
    _finalized_attempt_with_result,
    _full_setup,
    _session,
    _slot,
    _student,
)


def _set_level(db, assignment_id, level_code):
    from app.models import CompetitionEventResult

    result = db.query(CompetitionEventResult).filter_by(assignment_id=assignment_id).one()
    result.competition_level_code = level_code
    db.commit()


def test_admin_results_read_level_by_level_then_by_rank():
    db = _session()
    # (assignment, level, rank) -- deliberately out of order.
    plan = [
        ("a-mm2-1", "MM-L2", 1),
        ("a-pm3-2", "PM-L3", 2),
        ("a-bloom-1", "YLM-L0", 1),
        ("a-pm3-1", "PM-L3", 1),
        ("a-im1-1", "IM-L1", 1),
        ("a-beg-1", "YLM-L1", 1),
        ("a-pm1-1", "PM-L1", 1),
    ]
    event = None
    paper_for_level = {}
    for assignment_id, level_code, rank in plan:
        student, event = _full_setup(db, sid=f"s-{assignment_id}", level_code=level_code, assignment_id=assignment_id)
        # One paper per level (the test helper only makes the first).
        paper_for_level.setdefault(level_code, f"paper-{assignment_id}")
        _finalized_attempt_with_result(
            db, student, event, assignment_id, is_released=False, rank=rank, level_paper_id=paper_for_level[level_code]
        )
        _set_level(db, assignment_id, level_code)

    rows = ListCompetitionEventResultsForAdmin(db, EventId=event.id)["rows"]
    assert [(row["competitionLevelCode"], row["rank"]) for row in rows] == [
        ("YLM-L0", 1),
        ("YLM-L1", 1),
        ("PM-L1", 1),
        ("PM-L3", 1),
        ("PM-L3", 2),
        ("IM-L1", 1),
        ("MM-L2", 1),
    ]
    # A single level still reads by rank.
    only_pm3 = ListCompetitionEventResultsForAdmin(db, EventId=event.id, CompetitionLevelCode="PM-L3")["rows"]
    assert [row["rank"] for row in only_pm3] == [1, 2]


def test_live_board_orders_slot_then_level_then_name_and_offers_slots():
    db = _session()
    event = _event(db)
    early = _slot(db, event.id, slot_id="early", start_offset_hours=1)
    late = _slot(db, event.id, slot_id="late", start_offset_hours=3)
    people = [
        ("aaron", "MM-L1", late.id),
        ("zed", "PM-L2", late.id),
        ("bob", "IM-L1", early.id),
        ("carl", "PM-L1", early.id),
        ("dan", "YLM-L0", early.id),
        ("abe", "PM-L1", early.id),
    ]
    for name, level_code, slot_id in people:
        student = _student(db, sid=name)
        _assignment(db, event.id, student.id, level_code, assignment_id=f"as-{name}", slot_id=slot_id)
    db.commit()

    board = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)
    assert [row["studentId"] for row in board["rows"]] == ["dan", "abe", "carl", "bob", "zed", "aaron"]
    assert [slot["slotId"] for slot in board["slots"]] == ["early", "late"]
    assert board["slotId"] is None

    late_only = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, SlotId="late")
    assert [row["studentId"] for row in late_only["rows"]] == ["zed", "aaron"]
    assert late_only["summary"]["totalCount"] == 2
    # Picking a slot never empties the slot or level lists.
    assert [slot["slotId"] for slot in late_only["slots"]] == ["early", "late"]
    assert late_only["levelCodes"] == ["YLM-L0", "PM-L1", "PM-L2", "IM-L1", "MM-L1"]

    both = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, SlotId="early", CompetitionLevelCode="PM-L1")
    assert [row["studentId"] for row in both["rows"]] == ["abe", "carl"]


def test_teacher_live_route_passes_the_slot_filter():
    import inspect

    from app.api import routes_teacher

    assert "slotId" in inspect.signature(routes_teacher.teacher_get_annual_competition_live_monitoring).parameters


# ---------------------------------------------------------------------------
# Idle sign-out
# ---------------------------------------------------------------------------


class _FakeRequest:
    def __init__(self, method="GET", headers=None):
        self.method = method
        self.headers = headers or {}
        self.url = SimpleNamespace(path="/api/auth/me")


def _user(role, minutes_ago):
    last = None if minutes_ago is None else datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return SimpleNamespace(id=f"u-{role}-{minutes_ago}", role=role, last_interaction_at=last)


@pytest.fixture(autouse=True)
def _no_db_writes(monkeypatch):
    written = []
    monkeypatch.setattr(dependencies, "_update_user_interaction", lambda user_id: written.append(user_id))
    dependencies.interaction_cache.clear()
    return written


@pytest.mark.parametrize("role", ["STUDENT", "TEACHER"])
def test_idle_teacher_and_student_are_signed_out(role):
    with pytest.raises(HTTPException) as caught:
        dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1"}), _user(role, 25))
    assert caught.value.status_code == 401
    assert caught.value.detail["code"] == "SESSION_IDLE"


def test_coming_back_after_idle_is_still_signed_out_even_when_active_now():
    # Laptop slept for an hour: the first click after waking must not revive it.
    with pytest.raises(HTTPException):
        dependencies._enforce_idle_sign_out(_FakeRequest("POST", {"X-MP-Client": "1", "X-MP-Active": "1"}), _user("STUDENT", 60))


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
def test_admins_are_never_signed_out_for_idling(role):
    dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1"}), _user(role, 600))


def test_tabs_from_before_this_release_are_left_alone():
    dependencies._enforce_idle_sign_out(_FakeRequest(), _user("STUDENT", 600))


def test_within_twenty_minutes_is_fine_and_only_interaction_is_recorded(_no_db_writes):
    # Background polling (no X-MP-Active, a GET): allowed, not recorded.
    dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1"}), _user("STUDENT", 10))
    assert _no_db_writes == []
    # Real interaction: recorded.
    dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1", "X-MP-Active": "1"}), _user("STUDENT", 10))
    assert _no_db_writes == ["u-STUDENT-10"]


def test_a_change_request_counts_as_interaction(_no_db_writes):
    dependencies._enforce_idle_sign_out(_FakeRequest("POST", {"X-MP-Client": "1"}), _user("TEACHER", 5))
    assert _no_db_writes == ["u-TEACHER-5"]


def test_no_record_yet_starts_the_clock(_no_db_writes):
    dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1"}), _user("STUDENT", None))
    assert _no_db_writes == ["u-STUDENT-None"]


def test_short_grace_after_twenty_minutes():
    # The browser signs out at 20:00; a request that reaches the server a
    # moment later (slow network) is not refused for that.
    dependencies._enforce_idle_sign_out(_FakeRequest(headers={"X-MP-Client": "1"}), _user("STUDENT", 20.5))


def test_signing_in_starts_the_idle_clock():
    import inspect

    from app.services import auth_service

    assert "last_interaction_at = datetime.now(timezone.utc)" in inspect.getsource(auth_service.login)


def test_a_student_on_a_test_screen_is_never_signed_out(_no_db_writes):
    # A tablet that slept mid-paper must still be able to save and submit.
    dependencies._enforce_idle_sign_out(_FakeRequest("POST", {"X-MP-Client": "1", "X-MP-Test": "1"}), _user("STUDENT", 60))
    assert _no_db_writes == ["u-STUDENT-60"]


def test_signing_out_always_works_even_when_idle():
    request = _FakeRequest("POST", {"X-MP-Client": "1"})
    request.url = SimpleNamespace(path="/api/auth/logout")
    dependencies._enforce_idle_sign_out(request, _user("STUDENT", 60))
