"""One shared state per student per DPS (2026-10-13): the labels, buckets,
tries, the approval queue and the student's result-page button."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import DPS, Assignment, Attempt, Lesson, Level, Module, Notification, Student, User
from app.services import dps_chain_state_service as chain
from app.services.attempt_chain_service import BuildRetryWorkflowPayload
from app.services.manual_intervention_service import BuildManualInterventionQueue

T0 = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    yield session
    session.close()


@pytest.fixture()
def world(db):
    admin = User(id="admin", full_name="Admin", email="a@x.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(admin)
    db.add(Module(id="m", module_code="IM", module_name="Intermediate"))
    db.flush()
    db.add(Level(id="l", module_id="m", level_code="IM-L1", level_name="IM L1"))
    db.flush()
    db.add(Lesson(id="ls", level_id="l", lesson_number=1, lesson_title="Lesson 1"))
    db.flush()
    for n in range(1, 6):
        db.add(DPS(id=f"d{n}", lesson_id="ls", dps_number=n, dps_title=f"DPS {n}"))
    for sid in ("s1", "s2"):
        db.add(User(id=f"u-{sid}", full_name=f"Student {sid}", email=f"{sid}@x.test", password_hash="x", role="STUDENT", is_active=True))
        db.flush()
        db.add(Student(id=sid, user_id=f"u-{sid}", student_code=f"MP-{sid}", is_active=True, current_level_id="l", current_module_id="m"))
    db.commit()
    return admin


_counter = {"n": 0}


def _assign(db, student, dps, number=0, source="ORIGINAL", group=None, minutes=0):
    _counter["n"] += 1
    item = Assignment(
        id=f"a{_counter['n']}", assignment_type="PRACTICE", dps_id=dps, assigned_to_type="STUDENT", assigned_to_id=student,
        title=f"{dps} {number}", retry_attempt_number=number, assignment_source=source, attempt_group_id=group,
        is_active=True, created_at=T0 + timedelta(minutes=minutes),
    )
    db.add(item)
    db.flush()
    return item


def _attempt(db, assignment, accuracy=None, status="SUBMITTED", number=0, manual=False, minutes=0):
    _counter["n"] += 1
    group = assignment.attempt_group_id or assignment.id
    item = Attempt(
        id=f"t{_counter['n']}", assignment_id=assignment.id, dps_id=assignment.dps_id, student_id=assignment.assigned_to_id,
        mode="PRACTICE", status=status, attempt_group_id=group, attempt_number=number,
        requires_manual_intervention=manual, benchmark_status=("MANUAL_INTERVENTION_REQUIRED" if manual else ("CLEARED" if (accuracy or 0) >= 70 else "NEEDS_REATTEMPT")),
        started_at=T0 + timedelta(minutes=minutes),
        expires_at=(datetime(2099, 1, 1, tzinfo=timezone.utc) if status == "IN_PROGRESS" else T0 + timedelta(minutes=minutes + 15)),
        submitted_at=(T0 + timedelta(minutes=minutes + 10)) if status != "IN_PROGRESS" else None,
        duration_seconds=900, accuracy_percentage=accuracy or 0,
    )
    db.add(item)
    db.flush()
    return item


def _chain(db, student, dps, results, manual_last=False):
    """results: accuracies per step (None = sheet open, not started)."""
    original = _assign(db, student, dps, 0, minutes=0)
    group = original.id
    rows = [original]
    for step, value in enumerate(results):
        assignment = rows[-1] if step == 0 else _assign(db, student, dps, step, "AUTO_RETRY" if step <= 2 else "MANUAL_RETRY", group, minutes=step * 30)
        if step:
            rows.append(assignment)
        if value is None:
            break
        is_last = step == len(results) - 1
        _attempt(db, assignment, value, number=step, manual=(manual_last and is_last), minutes=step * 30 + 1)
    db.commit()
    return rows


def _state(db, student="s1", dps="d1"):
    index = chain.BuildDpsChainIndex(db)
    return index.concepts[(student, dps)]


def test_states_cover_every_situation(db, world):
    _chain(db, "s1", "d1", [])  # assigned, not started
    db.commit()
    assert _state(db).state == chain.NOT_STARTED and _state(db).bucket == "PENDING" and _state(db).label == "Not Started"

    _chain(db, "s1", "d2", [40, None])  # failed, Re-Attempt 1 open
    s = _state(db, dps="d2")
    assert (s.state, s.label, s.tries_used, s.tries_allowed) == (chain.REATTEMPT_OPEN, "Re-Attempt 1 Open", 1, 3)

    _chain(db, "s1", "d3", [40, 50, 60], manual_last=True)  # all 3 used
    s = _state(db, dps="d3")
    assert (s.state, s.label, s.bucket, s.tries_used) == (chain.AWAITING_APPROVAL, "Awaiting Admin Approval", "NEEDS_REATTEMPT", 3)

    _chain(db, "s1", "d4", [40, 85])  # cleared on Re-Attempt 1
    s = _state(db, dps="d4")
    assert (s.state, s.label, s.cleared_on) == (chain.CLEARED, "Cleared On Re-Attempt 1", 1)

    _chain(db, "s1", "d5", [95])
    assert _state(db, dps="d5").label == "Cleared"


def test_approved_extra_sheet_and_its_failure(db, world):
    rows = _chain(db, "s1", "d1", [40, 50, 60], manual_last=True)
    approved = _assign(db, "s1", "d1", 3, "MANUAL_RETRY", rows[0].id, minutes=200)
    db.commit()
    s = _state(db)
    assert (s.state, s.label, s.tries_allowed, s.approved_extra) == (chain.APPROVED_REATTEMPT_OPEN, "Approved Re-Attempt 3 Open", 4, 1)
    _attempt(db, approved, 50, status="IN_PROGRESS", number=3, minutes=201)
    db.commit()
    assert _state(db).label == "Approved Re-Attempt 3 In Progress"


def test_history_rows_are_not_counted_as_needing_a_reattempt(db, world):
    rows = _chain(db, "s1", "d1", [0, 0, 100])  # the MP-ST-0067 case: failed twice, then cleared
    index = chain.BuildDpsChainIndex(db)
    labels = [index.row_fields(row.id, "s1") for row in rows]
    assert [item["isCurrentChainRow"] for item in labels] == [False, False, True]
    assert [item["chainRowLabel"] for item in labels] == ["Below Benchmark", "Below Benchmark", "Cleared On Re-Attempt 2"]
    assert all(item["dpsChain"]["bucket"] == "CLEARED" for item in labels)


def test_in_progress_original_is_pending_not_below_benchmark(db, world):
    original = _assign(db, "s1", "d1")
    _attempt(db, original, 0, status="IN_PROGRESS")
    db.commit()
    s = _state(db)
    assert (s.state, s.bucket, s.tries_used) == (chain.IN_PROGRESS, "PENDING", 0)


def test_same_dps_assigned_again_after_clearing_stays_cleared(db, world):
    _chain(db, "s1", "d1", [90])
    _assign(db, "s1", "d1", 0, minutes=500)
    db.commit()
    assert _state(db).state == chain.CLEARED


def test_buckets_add_up_to_the_assigned_total(db, world):
    _chain(db, "s1", "d1", [])
    _chain(db, "s1", "d2", [40, None])
    _chain(db, "s1", "d3", [40, 50, 60], manual_last=True)
    _chain(db, "s1", "d4", [90])
    _chain(db, "s2", "d1", [10, 20, None])
    index = chain.BuildDpsChainIndex(db)
    buckets = [concept.bucket for concept in index.concepts.values()]
    assert len(buckets) == 5
    assert buckets.count("PENDING") + buckets.count("CLEARED") + buckets.count("NEEDS_REATTEMPT") == 5
    assert (buckets.count("PENDING"), buckets.count("CLEARED"), buckets.count("NEEDS_REATTEMPT")) == (1, 1, 3)


def test_approval_queue_lists_only_waiting_concepts(db, world):
    _chain(db, "s1", "d1", [40, 50, 60], manual_last=True)
    _chain(db, "s1", "d2", [40, None])
    rows = _chain(db, "s2", "d3", [40, 50, 60], manual_last=True)
    _assign(db, "s2", "d3", 3, "MANUAL_RETRY", rows[0].id, minutes=300)  # already approved
    db.commit()
    queue = BuildManualInterventionQueue(db)
    assert [(row["studentCode"], row["dpsNumber"], row["nextAttemptLabel"]) for row in queue] == [("MP-s1", 1, "Re-Attempt 3")]
    assert queue[0]["triesUsed"] == 3 and queue[0]["dpsChain"]["state"] == chain.AWAITING_APPROVAL
    assert BuildManualInterventionQueue(db, StudentIds=["s2"]) == []
    assert BuildManualInterventionQueue(db, StudentIds=[]) == []


def test_bulk_approval_opens_sheets_and_clears_the_notices(db, world, monkeypatch):
    from app.api import routes_admin

    monkeypatch.setattr(routes_admin, "NotifyPracticeFreshPracticeAssigned", lambda *a, **k: None)
    first = _chain(db, "s1", "d1", [40, 50, 60], manual_last=True)
    second = _chain(db, "s2", "d1", [40, 50, 60], manual_last=True)
    db.add(Notification(id="n1", recipient_user_id="admin", recipient_role="ADMIN", type="DPS_REATTEMPT_APPROVAL_NEEDED", category="PRACTICE", title="x", student_id="s1", dps_id="d1"))
    db.commit()
    payload = routes_admin.BulkReattemptApprovalRequest(items=[
        {"assignmentId": first[-1].id, "studentId": "s1"},
        {"assignmentId": second[-1].id, "studentId": "s2"},
        {"assignmentId": first[0].id, "studentId": "s1"},  # not the waiting sheet
    ])
    result = routes_admin.bulk_approve_reattempts_route(payload, db=db, user=world)
    assert (result["approved"], result["failed"]) == (2, 1)
    assert _state(db, "s1", "d1").label == "Approved Re-Attempt 3 Open"
    assert db.get(Notification, "n1").is_read is True
    again = routes_admin.bulk_approve_reattempts_route(routes_admin.BulkReattemptApprovalRequest(items=[{"assignmentId": first[-1].id, "studentId": "s1"}]), db=db, user=world)
    assert (again["approved"], again["alreadyApproved"]) == (0, 1)


def test_student_result_button(db, world):
    from app.services.attempt_service import _reattempt_action

    rows = _chain(db, "s1", "d1", [40, None])
    failed = db.query(Attempt).filter(Attempt.assignment_id == rows[0].id).one()
    workflow = BuildRetryWorkflowPayload(failed, rows[1])
    action = _reattempt_action(db, failed, workflow, rows[1])
    assert (action["kind"], action["label"], action["href"]) == ("START", "Start Re-Attempt 1", f"/student/dps/d1?assignmentId={rows[1].id}")

    running = _attempt(db, rows[1], 0, status="IN_PROGRESS", number=1, minutes=40)
    db.commit()
    action = _reattempt_action(db, failed, workflow, rows[1])
    assert (action["kind"], action["href"]) == ("RESUME", f"/student/attempt/{running.id}")

    running.status = "SUBMITTED"
    running.accuracy_percentage = 90
    running.submitted_at = T0 + timedelta(minutes=50)
    db.commit()
    action = _reattempt_action(db, failed, workflow, rows[1])
    assert (action["kind"], action["label"], action["href"]) == ("USED", "Re-Attempt 1 Completed", f"/student/result/{running.id}")

    waiting_rows = _chain(db, "s2", "d2", [40, 50, 60], manual_last=True)
    waiting = db.query(Attempt).filter(Attempt.assignment_id == waiting_rows[-1].id).one()
    workflow = BuildRetryWorkflowPayload(waiting, None)
    assert workflow["state"] == "MANUAL_REVIEW_REQUIRED"
    action = _reattempt_action(db, waiting, workflow, None)
    assert (action["kind"], action["label"], action["disabled"]) == ("AWAITING_APPROVAL", "Opens After Admin Approval", True)

    approved = _assign(db, "s2", "d2", 3, "MANUAL_RETRY", waiting_rows[0].id, minutes=400)
    db.commit()
    workflow = BuildRetryWorkflowPayload(waiting, approved)
    assert workflow["state"] == "APPROVED_RETRY_PREPARED"
    assert _reattempt_action(db, waiting, workflow, approved)["label"] == "Start Approved Re-Attempt 3"

    cleared = db.query(Attempt).filter(Attempt.assignment_id == rows[1].id).one()
    assert _reattempt_action(db, cleared, {"state": "CLEARED"}, None) is None


def test_timed_out_sheet_is_settled_before_the_state_is_read(db, world, monkeypatch):
    # A sheet whose timer ran out while still "in progress" is auto-submitted
    # first (opening Re-Attempt 1), so the state never says "In Progress"
    # next to a submitted 0% score.
    from app.services import attempt_service

    original = _assign(db, "s1", "d1")
    stale = _attempt(db, original, 0, status="IN_PROGRESS")
    stale.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
    db.commit()

    def fake_submit(session, attempt, auto=False):
        attempt.status = "AUTO_SUBMITTED"
        attempt.submitted_at = attempt.expires_at
        attempt.benchmark_status = "NEEDS_REATTEMPT"
        _assign(session, "s1", "d1", 1, "AUTO_RETRY", original.id, minutes=60)
        session.commit()
        return attempt

    monkeypatch.setattr(attempt_service, "submit_attempt", fake_submit)
    s = _state(db)
    assert (s.state, s.label, s.tries_used) == (chain.REATTEMPT_OPEN, "Re-Attempt 1 Open", 1)


def test_student_results_carry_the_same_state_as_the_trackers(db, world):
    """2026-10-14: the student's own Lesson Insights reads the same shared
    state: one current row per DPS with its real status, history rows as
    history, and the same buckets the teacher and admin count."""
    from app.api import routes_student

    _chain(db, "s1", "d1", [40, 50, 60], manual_last=True)  # awaiting approval
    _chain(db, "s1", "d2", [40, None])  # Re-Attempt 1 open
    _chain(db, "s1", "d3", [40, 85])  # cleared on Re-Attempt 1
    approved = _chain(db, "s1", "d4", [40, 50, 60], manual_last=True)
    _assign(db, "s1", "d4", 3, "MANUAL_RETRY", approved[0].id, minutes=200)  # approved extra, open
    _chain(db, "s1", "d5", [])  # not started
    db.commit()

    student = db.get(Student, "s1")
    rows = [row for row in routes_student.student_results(db=db, student=student)["results"] if row.get("dpsId")]
    by_dps: dict[str, list[dict]] = {}
    for row in rows:
        by_dps.setdefault(row["dpsId"], []).append(row)

    def current(dps):
        found = [row for row in by_dps[dps] if row.get("isCurrentChainRow")]
        assert len(found) == 1, (dps, by_dps[dps])
        return found[0]

    assert current("d1")["chainRowLabel"] == "Awaiting Admin Approval"
    assert current("d1")["attemptId"]  # the third try's result row
    assert current("d1")["dpsChain"]["triesText"] == "3 of 3 used"
    assert current("d2")["chainRowLabel"] == "Re-Attempt 1 Open" and current("d2")["attemptId"] is None
    assert current("d3")["chainRowLabel"] == "Cleared On Re-Attempt 1"
    assert current("d4")["chainRowLabel"] == "Approved Re-Attempt 3 Open"
    assert current("d4")["dpsChain"]["triesText"] == "3 of 4 used · 1 approved"
    assert current("d5")["chainRowLabel"] == "Not Started"
    history = [row for row in by_dps["d1"] if not row.get("isCurrentChainRow")]
    assert [row["chainRowLabel"] for row in history] == ["Below Benchmark", "Below Benchmark"]
    buckets = {dps: current(dps)["dpsChain"]["bucket"] for dps in by_dps}
    assert buckets == {"d1": "NEEDS_REATTEMPT", "d2": "NEEDS_REATTEMPT", "d3": "CLEARED", "d4": "NEEDS_REATTEMPT", "d5": "PENDING"}
