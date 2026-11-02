"""The teacher-set date and time for level assessments (2026-11-02, Shailesh).

Level assessments follow the Annual Competition's flow:
- the teacher sets a date and time for every student when assigning
  (original and re-attempt alike); only the test account may go without one;
- the instructions (the brief) open 10 minutes before that time;
- Start opens exactly at that time, never before, and then stays open;
- the teacher may change the time until the student starts;
- the notification states the time in India time.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api import routes_teacher
from app.models.models import AssessmentAssignment, AssessmentAttempt, Notification
from app.services import assessment_engine_service as engine
from app.services.assessment_notification_service import _assessment_time_sentence

from tests.test_review_tabs_and_teacher_test_account import _setup_teacher, db  # noqa: F401  (fixture)

IST = timezone(timedelta(hours=5, minutes=30))


def _assign(db, teacher, version, student_ids, when=None):
    request = routes_teacher.TeacherAssignAssessmentRequest(
        assessmentVersionId=version.id, studentIds=student_ids, scheduledStartAt=when.isoformat() if when else None
    )
    return routes_teacher.teacher_assign_assessment(request, db, teacher)


def _freeze(monkeypatch, now):
    monkeypatch.setattr(engine, "NowUtc", lambda: now)


def test_regular_student_needs_a_date_and_time(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    with pytest.raises(HTTPException) as error:
        _assign(db, teacher, versions["PM-L1"], [regular.id])
    assert error.value.detail["code"] == "ASSESSMENT_ASSIGNMENT_BLOCKED"
    assert "date and time" in error.value.detail["details"]["rejected"][0]["reason"]


def test_a_time_in_the_past_is_refused(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    with pytest.raises(HTTPException) as error:
        _assign(db, teacher, versions["PM-L1"], [regular.id], datetime.now(timezone.utc) - timedelta(hours=1))
    assert error.value.detail["code"] == "ASSESSMENT_SCHEDULE_IN_PAST"


def test_time_without_zone_is_india_time():
    parsed = engine.ParseAssessmentScheduledStartAt("2026-11-07T11:30")
    assert parsed == datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc)
    assert engine.ParseAssessmentScheduledStartAt("2026-11-07T06:00:00Z") == parsed


def test_instructions_open_10_minutes_before_and_start_at_the_time(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(second=0, microsecond=0)
    result = _assign(db, teacher, versions["PM-L1"], [regular.id], start)
    assignment = db.get(AssessmentAssignment, result["assignmentIds"][0])
    assert engine.AssessmentScheduledStartAt(assignment) == start

    # 11 minutes before: neither the brief nor Start.
    _freeze(monkeypatch, start - timedelta(minutes=11))
    with pytest.raises(HTTPException) as error:
        engine.StudentAssessmentStartPayload(db, regular, assignment.id)
    assert error.value.detail["code"] == "ASSESSMENT_INSTRUCTIONS_NOT_OPEN_YET"
    with pytest.raises(HTTPException) as error:
        engine.StartAssessmentAttempt(db, regular, assignment.id)
    assert error.value.detail["code"] == "ASSESSMENT_NOT_OPEN_YET"

    # Exactly 10 minutes before: the brief opens, Start still refuses.
    _freeze(monkeypatch, start - timedelta(minutes=10))
    brief = engine.StudentAssessmentStartPayload(db, regular, assignment.id)
    assert brief["instructionsOpen"] is True and brief["startOpen"] is False
    assert brief["scheduledStartAt"] == start.isoformat()
    with pytest.raises(HTTPException) as error:
        engine.StartAssessmentAttempt(db, regular, assignment.id)
    assert error.value.detail["code"] == "ASSESSMENT_NOT_OPEN_YET"

    # One second before: still refused.
    _freeze(monkeypatch, start - timedelta(seconds=1))
    with pytest.raises(HTTPException):
        engine.StartAssessmentAttempt(db, regular, assignment.id)

    # At the time: Start works, and it stays open later on.
    _freeze(monkeypatch, start)
    attempt = engine.StartAssessmentAttempt(db, regular, assignment.id)
    assert attempt.status == "IN_PROGRESS"
    payload = engine.AssessmentAssignmentPayload(db, assignment)
    assert payload["startOpen"] is True and payload["canReschedule"] is False


def test_start_stays_open_after_the_time(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    start = datetime.now(timezone.utc) + timedelta(hours=2)
    assignment_id = _assign(db, teacher, versions["PM-L1"], [regular.id], start)["assignmentIds"][0]
    _freeze(monkeypatch, start + timedelta(days=3))
    assert engine.StartAssessmentAttempt(db, regular, assignment_id).status == "IN_PROGRESS"


def test_test_account_without_a_time_opens_straight_away(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    assignment_id = _assign(db, teacher, versions["IM-L2"], [tester.id])["assignmentIds"][0]
    assignment = db.get(AssessmentAssignment, assignment_id)
    assert assignment.scheduled_start_at is None
    state = engine.AssessmentScheduleState(assignment)
    assert state["instructionsOpen"] and state["startOpen"] and state["scheduledStartAt"] is None
    assert engine.StartAssessmentAttempt(db, tester, assignment_id).status == "IN_PROGRESS"


def test_test_account_follows_a_time_when_one_is_given(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    assignment_id = _assign(db, teacher, versions["IM-L2"], [tester.id], start)["assignmentIds"][0]
    with pytest.raises(HTTPException) as error:
        engine.StartAssessmentAttempt(db, tester, assignment_id)
    assert error.value.detail["code"] == "ASSESSMENT_NOT_OPEN_YET"
    # Assigning again without a time clears it: open straight away.
    assignment_id = _assign(db, teacher, versions["IM-L2"], [tester.id])["assignmentIds"][0]
    assert engine.StartAssessmentAttempt(db, tester, assignment_id).status == "IN_PROGRESS"


def test_old_assignment_without_a_time_is_unchanged(db, monkeypatch):
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    old = AssessmentAssignment(assessment_version_id=versions["PM-L1"].id, blueprint_id=versions["PM-L1"].blueprint_id,
                               student_id=regular.id, teacher_id=teacher.id, status="ASSIGNED")
    db.add(old)
    db.commit()
    assert engine.StudentAssessmentStartPayload(db, regular, old.id)["startOpen"] is True
    assert engine.StartAssessmentAttempt(db, regular, old.id).status == "IN_PROGRESS"


def test_teacher_can_change_the_time_until_the_student_starts(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    start = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(microsecond=0)
    assignment_id = _assign(db, teacher, versions["PM-L1"], [regular.id], start)["assignmentIds"][0]

    later = start + timedelta(days=1)
    result = routes_teacher.teacher_reschedule_assessment(
        assignment_id, routes_teacher.TeacherRescheduleAssessmentRequest(scheduledStartAt=later.isoformat()), db, teacher
    )
    assert result["assignment"]["scheduledStartAt"] == later.isoformat()
    note = db.query(Notification).filter(Notification.type == "ASSESSMENT_RESCHEDULED").one()
    assert "new time" in note.message and "IST" in note.message

    with pytest.raises(HTTPException) as error:
        routes_teacher.teacher_reschedule_assessment(
            assignment_id,
            routes_teacher.TeacherRescheduleAssessmentRequest(scheduledStartAt=(datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()),
            db, teacher,
        )
    assert error.value.detail["code"] == "ASSESSMENT_SCHEDULE_IN_PAST"

    # Once the student has started, the time is fixed.
    _freeze(monkeypatch, later)
    engine.StartAssessmentAttempt(db, regular, assignment_id)
    with pytest.raises(HTTPException) as error:
        routes_teacher.teacher_reschedule_assessment(
            assignment_id, routes_teacher.TeacherRescheduleAssessmentRequest(scheduledStartAt=(later + timedelta(days=1)).isoformat()), db, teacher
        )
    assert error.value.detail["code"] == "ASSESSMENT_ALREADY_STARTED"


def test_notification_states_the_time_in_india_time():
    assignment = AssessmentAssignment(scheduled_start_at=datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc))
    assert _assessment_time_sentence(assignment) == "Your assessment time: 7 Nov 2026, 11:30 AM IST. Instructions open 10 minutes before."
    naive = AssessmentAssignment(scheduled_start_at=datetime(2026, 11, 7, 12, 45))
    assert _assessment_time_sentence(naive).startswith("Your assessment time: 7 Nov 2026, 6:15 PM IST.")
    assert _assessment_time_sentence(AssessmentAssignment()) == ""
