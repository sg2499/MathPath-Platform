"""Regression coverage for the 2026-09-17 "never ever anywhere" fix
(Shailesh): "sometimes it's happening that on other systems the teachers
and admins are able to see the latest results but on my system i am not
being able to see them ... also if you see the correct answer by the
student is being flagged as wrong, then after sometime it gets updated to
the correct view ... make sure it does not happen across any flow be it
dps, assessments, mocks or competitions both official and practice flows.
never ever anywhere."

Root cause (confirmed via code, documented in full in each touched
routes_admin.py/routes_teacher.py/*_service.py call site): a practice/
assessment/mock/competition attempt abandoned before its own client-side
countdown fires (tab closed, connection dropped, laptop sleeps) sits at
status=IN_PROGRESS forever -- nothing server-side ever finalizes it except
a request that happens to touch the *student's own* "get my attempt"
path. Admin/teacher review and list/tracker/report endpoints previously
read the raw, never-graded row directly: every nullable
`*AttemptAnswer.is_correct` sits at its NULL default, which
`bool(None) == False` then renders identically to a genuine wrong answer,
and every score/count field sits at its zeroed model default -- exactly
the "everything is wrong, score 0" snapshot from the screenshots. The
"self-correction after a while" the user observed was simply the student
eventually reopening their own attempt (which DOES lazily finalize it),
after which a later admin/teacher refresh shows the real data.

The fix threads each flow's existing (or, for Annual Competition, newly
extracted) lazy finalize/self-heal helper into every admin/teacher read
path that displays a specific attempt's or a list of attempts' graded
score/correctness/status -- mirroring the pattern already proven safe and
live for Competition Mock's admin endpoint
(GetCompetitionMockResultForAdmin -> EnsureCompetitionAttemptActiveOrSubmit).

This file exercises the actual shared choke-point functions/routes that
were touched, calling them directly against a real in-memory SQLite DB
(bypassing HTTP/auth plumbing -- Depends(...) defaults are simply ignored
when a route function is called directly, the same pattern
test_teacher_schedule_per_student_regression.py and
test_attempt_save_submit_race_regression.py already established for this
codebase), so the wiring itself -- not just the underlying finalize
helpers, which already have their own dedicated coverage -- is what's
under test.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    Assignment,
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentBlueprint,
    AssessmentVersion,
    Attempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockExam,
    DPS,
    Lesson,
    Level,
    Module,
    Student,
    Teacher,
    User,
)


# ---------------------------------------------------------------------------
# Shared DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def world(db):
    """One module/level/lesson, one teacher, one admin user, and one
    student linked to that teacher via the plain-text Student.teacher
    field (own_students_query()'s fallback match)."""
    admin_user = User(full_name="Admin", email="lf-admin@test.local", password_hash="x", role="ADMIN")
    teacher_user = User(full_name="Ms. LazyFinalize", email="lf-teacher@test.local", password_hash="x", role="TEACHER")
    student_user = User(full_name="Student LF", email="lf-student@test.local", password_hash="x", role="STUDENT")
    db.add_all([admin_user, teacher_user, student_user])
    db.commit()

    teacher = Teacher(user_id=teacher_user.id, teacher_code="MP-TC-LF")
    db.add(teacher)
    db.commit()

    module = Module(module_code="LF", module_name="LazyFinalize Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="LF-L1", level_name="LazyFinalize Level 1")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=1, lesson_title="Lesson 1")
    db.add(lesson)
    db.commit()

    student = Student(
        user_id=student_user.id,
        student_code="MP-ST-LF",
        current_level_id=level.id,
        current_module_id=module.id,
        teacher=teacher_user.full_name,
    )
    db.add(student)
    db.commit()

    return {
        "admin_user": admin_user,
        "teacher": teacher,
        "student": student,
        "module": module,
        "level": level,
        "lesson": lesson,
    }


def _stuck_dps_attempt(db, world, *, expired_seconds_ago=120):
    """A DPS practice attempt whose client-side timer never fired: still
    IN_PROGRESS, but its expiry is well in the past."""
    dps = DPS(lesson_id=world["lesson"].id, dps_number=1, dps_title="DPS 1", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    assignment = Assignment(
        assignment_type="PRACTICE",
        dps_id=dps.id,
        assigned_to_type="STUDENT",
        assigned_to_id=world["student"].id,
        title="DPS 1 Practice",
    )
    db.add(assignment)
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        assignment_id=assignment.id,
        student_id=world["student"].id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now - timedelta(seconds=expired_seconds_ago + 600),
        expires_at=now - timedelta(seconds=expired_seconds_ago),
        duration_seconds=600,
        total_questions=0,
        max_score=0,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return dps, assignment, attempt


# ---------------------------------------------------------------------------
# DPS -- admin
# ---------------------------------------------------------------------------

def test_admin_attempt_detail_self_heals_a_stuck_attempt(db, world):
    from app.api.routes_admin import admin_attempt_detail

    _, _, attempt = _stuck_dps_attempt(db, world)
    assert attempt.status == "IN_PROGRESS"

    result = admin_attempt_detail(attempt.id, db, world["admin_user"])

    assert result["status"] != "IN_PROGRESS"
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"


def test_get_assignment_route_self_heals_every_attempt_in_the_summary_table(db, world):
    from app.api.routes_admin import get_assignment_route

    _, assignment, attempt = _stuck_dps_attempt(db, world)

    detail = get_assignment_route(assignment.id, db, world["admin_user"])

    row = next(r for r in detail["attempts"] if r["attemptId"] == attempt.id)
    assert row["attemptStatus"] != "IN_PROGRESS"
    student_row = next(r for r in detail["students"] if r["studentId"] == world["student"].id)
    assert student_row["attemptStatus"] != "IN_PROGRESS"


def test_admin_attempt_history_for_assignment_self_heals(db, world):
    """admin_attempt_history_for_assignment_student() (the "attemptHistory"
    field admin sees per student) does its OWN independent query via
    all_attempts_for_student_assignment() -- not covered by the attempts
    list fix above -- so this needs its own dedicated check."""
    from app.api.routes_admin import all_attempts_for_student_assignment

    _, assignment, attempt = _stuck_dps_attempt(db, world)

    history_attempts = all_attempts_for_student_assignment(db, assignment.id, world["student"].id)

    assert len(history_attempts) == 1
    assert history_attempts[0].status != "IN_PROGRESS"


def test_dps_results_self_heals(db, world):
    from app.api.routes_admin import dps_results

    dps, _, attempt = _stuck_dps_attempt(db, world)

    result = dps_results(dps.id, None, db, world["admin_user"])

    row = next(r for r in result["results"] if r["attemptId"] == attempt.id)
    assert row["attemptStatus"] != "IN_PROGRESS"


# ---------------------------------------------------------------------------
# DPS -- teacher
# ---------------------------------------------------------------------------

def test_teacher_attempt_result_self_heals(db, world):
    from app.api.routes_teacher import teacher_attempt_result

    _, _, attempt = _stuck_dps_attempt(db, world)

    result = teacher_attempt_result(attempt.id, db, world["teacher"])

    assert result["status"] != "IN_PROGRESS"


def test_teacher_results_self_heals(db, world):
    from app.api.routes_teacher import teacher_results

    _, _, attempt = _stuck_dps_attempt(db, world)

    result = teacher_results(db, world["teacher"])

    row = next(r for r in result["attempts"] if r["attemptId"] == attempt.id)
    assert row["status"] != "IN_PROGRESS"


def test_teacher_student_payload_self_heals(db, world):
    from app.api.routes_teacher import student_payload

    _, _, attempt = _stuck_dps_attempt(db, world)

    payload = student_payload(db, world["student"])

    # A stuck-but-now-reconciled attempt must count towards completed
    # attempts, not linger as "in progress" forever on the roster card.
    assert payload["inProgressAssignments"] == 0
    assert payload["completedAssignments"] == 1
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"


def test_teacher_attempt_history_for_assignment_self_heals(db, world):
    from app.api.routes_teacher import all_attempts_for_assignment_student

    _, assignment, attempt = _stuck_dps_attempt(db, world)

    history_attempts = all_attempts_for_assignment_student(db, assignment.id, world["student"].id)

    assert len(history_attempts) == 1
    assert history_attempts[0].status != "IN_PROGRESS"


def test_teacher_latest_attempt_for_assignment_self_heals(db, world):
    """Single choke point behind teacher_notifications' pending-count,
    teacher_assignment_tracker, and the legacy assessment tracker."""
    from app.api.routes_teacher import latest_attempt_for_assignment

    _, assignment, attempt = _stuck_dps_attempt(db, world)

    latest = latest_attempt_for_assignment(db, assignment.id, world["student"].id)

    assert latest is not None
    assert latest.status != "IN_PROGRESS"


# ---------------------------------------------------------------------------
# Assessments -- admin + teacher, via the shared AssessmentAssignmentPayload
# choke point plus the two single-attempt result routes and the admin
# report-rows builder.
# ---------------------------------------------------------------------------

def _stuck_assessment_attempt(db, world, *, expired_seconds_ago=120):
    blueprint = AssessmentBlueprint(
        title="LF Assessment",
        module_id=world["module"].id,
        level_id=world["level"].id,
        total_questions=0,
        marks_per_question=1,
        duration_seconds=600,
    )
    db.add(blueprint)
    db.commit()

    version = AssessmentVersion(
        blueprint_id=blueprint.id,
        version_number=1,
        status="PUBLISHED",
        total_questions=0,
        marks_per_question=1,
        duration_seconds=600,
    )
    db.add(version)
    db.commit()

    assignment = AssessmentAssignment(
        assessment_version_id=version.id,
        blueprint_id=blueprint.id,
        student_id=world["student"].id,
        status="ASSIGNED",
    )
    db.add(assignment)
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = AssessmentAttempt(
        assessment_assignment_id=assignment.id,
        assessment_version_id=version.id,
        student_id=world["student"].id,
        attempt_number=1,
        status="IN_PROGRESS",
        started_at=now - timedelta(seconds=expired_seconds_ago + 600),
        expires_at=now - timedelta(seconds=expired_seconds_ago),
        duration_seconds=600,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return blueprint, version, assignment, attempt


def test_admin_assessment_attempt_result_route_self_heals(db, world):
    from app.api.routes_admin import admin_assessment_attempt_result_route

    _, _, _, attempt = _stuck_assessment_attempt(db, world)

    result = admin_assessment_attempt_result_route(attempt.id, db, world["admin_user"])

    assert result["status"] != "IN_PROGRESS"


def test_teacher_assessment_attempt_result_route_self_heals(db, world):
    from app.api.routes_teacher import teacher_assessment_attempt_result_route

    _, _, _, attempt = _stuck_assessment_attempt(db, world)

    result = teacher_assessment_attempt_result_route(attempt.id, db, world["teacher"])

    assert result["status"] != "IN_PROGRESS"


def test_assessment_assignment_payload_self_heals_for_every_list_tracker_view(db, world):
    """AssessmentAssignmentPayload backs essentially every assessment
    list/tracker view (admin and teacher alike) -- this is the single
    highest-blast-radius choke point for the assessment flow."""
    from app.services.assessment_engine_service import AssessmentAssignmentPayload

    _, _, assignment, attempt = _stuck_assessment_attempt(db, world)

    payload = AssessmentAssignmentPayload(db, assignment)

    assert payload["status"] != "IN_PROGRESS"
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"


def test_admin_assessment_attempt_report_rows_self_heals(db, world):
    from app.api.routes_admin import _admin_assessment_attempt_report_rows

    _, _, _, attempt = _stuck_assessment_attempt(db, world)

    rows = _admin_assessment_attempt_report_rows(db, world["student"], {})

    row = next(r for r in rows if r["attemptId"] == attempt.id)
    assert row["status"] != "IN_PROGRESS"


# ---------------------------------------------------------------------------
# Competition Mock -- the shared teacher row-payload helper, which
# admin_competition_mock_tracker (routes_admin.py) reuses directly, so
# fixing it once covers both the teacher AND admin mock trackers.
# ---------------------------------------------------------------------------

def _stuck_mock_attempt(db, world, *, expired_seconds_ago=120):
    exam = CompetitionMockExam(
        title="LF Mock",
        module_id=world["module"].id,
        level_id=world["level"].id,
        total_questions=5,
        duration_seconds=600,
    )
    db.add(exam)
    db.commit()

    assignment = CompetitionMockAssignment(
        mock_exam_id=exam.id,
        student_id=world["student"].id,
        status="ASSIGNED",
    )
    db.add(assignment)
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = CompetitionMockAttempt(
        mock_assignment_id=assignment.id,
        mock_exam_id=exam.id,
        student_id=world["student"].id,
        attempt_number=1,
        status="IN_PROGRESS",
        started_at=now - timedelta(seconds=expired_seconds_ago + 600),
        expires_at=now - timedelta(seconds=expired_seconds_ago),
        duration_seconds=600,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return exam, assignment, attempt


def test_teacher_competition_row_payload_self_heals_both_trackers(db, world):
    from app.api.routes_teacher import _teacher_competition_row_payload

    _, assignment, attempt = _stuck_mock_attempt(db, world)

    row = _teacher_competition_row_payload(db, assignment)

    assert row is not None
    assert row["status"] != "IN_PROGRESS"
    assert row["attemptStatus"] != "IN_PROGRESS"
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"


def test_admin_competition_mock_tracker_self_heals(db, world):
    """admin_competition_mock_tracker() reuses _teacher_competition_row_payload
    directly (routes_admin.py imports it from routes_teacher.py) -- this
    proves the admin route itself, not just the shared helper, sees the
    self-healed row."""
    from app.api.routes_admin import admin_competition_mock_tracker

    _, assignment, attempt = _stuck_mock_attempt(db, world)

    result = admin_competition_mock_tracker(db, world["admin_user"])

    row = next(r for r in result["rows"] if r["assignmentId"] == assignment.id)
    assert row["attemptStatus"] != "IN_PROGRESS"


# ---------------------------------------------------------------------------
# Annual Competition -- OFFICIAL review + PRACTICE admin results list.
# Structurally different from the other three flows: a section's remaining
# time only ever moves in response to an actual heartbeat, so an abandoned
# attempt never organically expires on its own the way a wall-clock
# expires_at does -- the real "abandoned" signal is a heartbeat-gap check
# (_ReconcileSingleAttemptIfAbandoned, extracted from the pre-existing
# admin bulk-reconcile sweep). Fixtures are self-contained (no cross-file
# imports), mirroring test_annual_competition_attempt_review_service.py's
# own stated convention.
# ---------------------------------------------------------------------------

from app.models.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionMockQuestion,
)
from app.services import annual_competition_attempt_service as annual_attempt_engine
from app.services.annual_competition_attempt_service import HEARTBEAT_GRACE_SECONDS


def test_annual_competition_admin_review_self_heals_an_abandoned_official_attempt(db, world):
    from app.services.annual_competition_attempt_service import GetCompetitionEventAttemptReviewForAdmin

    event = CompetitionEvent(
        name="LF Annual Competition 2026",
        status="SCHEDULED",
        competition_date=datetime.now(timezone.utc) + timedelta(days=5),
    )
    db.add(event)
    db.commit()

    exam = CompetitionMockExam(
        title="LF Official Exam",
        module_id=world["module"].id,
        level_id=world["level"].id,
        total_questions=1,
        duration_seconds=600,
    )
    db.add(exam)
    db.commit()
    question = CompetitionMockQuestion(
        mock_exam_id=exam.id, section_number=1, question_number=1,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1,
        question_text="2 + 2",
    )
    db.add(question)
    db.commit()

    assignment = CompetitionEventAssignment(
        event_id=event.id, student_id=world["student"].id,
        assigned_level_code=world["level"].level_code, assignment_source="AUTO",
    )
    db.add(assignment)
    db.commit()

    level_paper = CompetitionEventLevelPaper(
        event_id=event.id, competition_level_code=world["level"].level_code,
        mock_exam_id=exam.id, status="READY", paper_kind="OFFICIAL",
    )
    db.add(level_paper)
    db.commit()
    timer = CompetitionEventSectionTimer(
        level_paper_id=level_paper.id, section_number=1, section_title="Speed Round 1",
        mode="ABACUS", time_limit_seconds=600, display_order=1,
    )
    db.add(timer)
    db.commit()

    started = annual_attempt_engine.StartCompetitionEventAttempt(db, world["student"], event.id)
    attempt_id = started["attemptId"]

    # Simulate abandonment: nobody has sent a heartbeat for well past the
    # grace window, but the section's own remaining-time snapshot (never
    # wall-clock-derived) still shows the full duration -- exactly why a
    # simple "remaining <= 0" lazy check (as DPS/Assessments/Mocks use)
    # cannot catch this on its own.
    section_state = (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == attempt_id)
        .first()
    )
    section_state.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=HEARTBEAT_GRACE_SECONDS + 30)
    db.commit()

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    assert attempt.status == "IN_PROGRESS"

    review = GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)

    assert review["status"] != "IN_PROGRESS"
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"


def test_annual_competition_admin_practice_results_self_heals_an_abandoned_attempt(db, world):
    from app.services.annual_competition_scoring_service import ListAnnualCompetitionPracticeResultsForAdmin

    exam = CompetitionMockExam(
        title="LF Practice Exam",
        module_id=world["module"].id,
        level_id=world["level"].id,
        total_questions=1,
        duration_seconds=600,
    )
    db.add(exam)
    db.commit()
    question = CompetitionMockQuestion(
        mock_exam_id=exam.id, section_number=1, question_number=1,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1,
        question_text="2 + 2",
    )
    db.add(question)
    db.commit()

    level_paper = CompetitionEventLevelPaper(
        event_id=None, competition_level_code=world["level"].level_code,
        mock_exam_id=exam.id, status="READY", paper_kind="PRACTICE",
        assigned_student_id=world["student"].id,
        assigned_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.add(level_paper)
    db.commit()
    timer = CompetitionEventSectionTimer(
        level_paper_id=level_paper.id, section_number=1, section_title="Speed Round 1",
        mode="ABACUS", time_limit_seconds=600, display_order=1,
    )
    db.add(timer)
    db.commit()

    started = annual_attempt_engine.StartAnnualCompetitionPracticeAttempt(
        db, world["student"], world["level"].level_code
    )
    attempt_id = started["attemptId"]

    section_state = (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == attempt_id)
        .first()
    )
    section_state.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=HEARTBEAT_GRACE_SECONDS + 30)
    db.commit()

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    assert attempt.status == "IN_PROGRESS"

    result = ListAnnualCompetitionPracticeResultsForAdmin(db, CompetitionLevelCode=world["level"].level_code)

    bucket = next(s for s in result["students"] if s["studentId"] == world["student"].id)
    paper_row = next(p for p in bucket["papers"] if p["attemptId"] == attempt_id)
    assert paper_row["status"] != "IN_PROGRESS"
    db.refresh(attempt)
    assert attempt.status != "IN_PROGRESS"
