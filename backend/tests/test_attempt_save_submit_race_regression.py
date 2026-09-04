"""Regression coverage for the save/submit race-condition fix (2026-09-04).

Real bug this guards against: a student's answer review page showed the
EXACT SAME text for "Student Answer" and "Correct Answer" (e.g. both
"0.000044875"), yet the question was scored wrong -- observed across
multiple questions on a single IM-L4 DPS attempt, costing a student real
marks they had actually earned. answers_match() itself was proven correct
in isolation (see test_answer_matching.py / test_dps_typed_answer_flow.py);
the real defect was a database race between the debounced answer-autosave
(save_answer(), fired from AnswerInputBox's 450ms debounce, never awaited
by the client) and grading (submit_attempt(), triggered by an explicit
Submit, a client-timer auto-submit, or the lazy
ensure_active_or_auto_submit() side effect nested inside literally any
request that touches an expired attempt). Both are independent HTTP
requests, each in its own DB session, and FastAPI dispatches sync route
handlers to a thread pool -- so a save's write to AttemptAnswer.selected_value
could land in the database (visible on review) *after* a concurrent submit
had already read a stale/incomplete snapshot, graded it wrong, and
committed permanently, since is_correct/marks_awarded are never recomputed
later. This is a lost-update pattern: submit's UPDATE (is_correct=False,
marks_awarded=0) and save's UPDATE (selected_value=<correct text>) touch
different columns of the very same AttemptAnswer row and can both commit
without conflicting -- producing exactly the "answers match but scored
wrong" symptom from the screenshots, on ANY module/level/lesson/DPS, since
save_answer()/submit_attempt() is the one shared code path every DPS
attempt goes through.

The fix (attempt_service._lock_attempt_for_update, SELECT ... FOR UPDATE on
the Attempt row) serializes save_answer()'s write and submit_attempt()'s
read+grade+commit for the same attempt on Postgres (production). SQLite
(this test suite) silently no-ops with_for_update() and, via the
single-connection StaticPool used below, can't even host two genuinely
interleaved transactions -- so true lock-contention/blocking is NOT
reproducible here (documented in _lock_attempt_for_update's own docstring).
What *is* directly testable, and what this file covers instead:

  1. The normal save-then-submit pipeline still grades correctly through
     the new locked code path (no behavioural regression for the 99% case).
  2. Fail-closed semantics: once an attempt is no longer IN_PROGRESS, a
     save_answer() call is cleanly rejected ({"saved": False, ...}) and
     never silently corrupts or overwrites an already-graded answer -- the
     race can never resolve as "wrong answer displayed as correct or vice
     versa" by way of a late write sneaking in after grading.
  3. submit_attempt() is idempotent / fail-closed on its own side: a second
     call against an already-graded attempt short-circuits and never
     recomputes (so a duplicate auto-submit racing a manual submit can't
     re-grade off a different snapshot and flip the stored result).
  4. _lock_attempt_for_update() itself does a real, un-cached row read --
     proving it can never hand back a stale in-memory copy of the Attempt,
     which is the specific property the whole fix depends on.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import models
from app.models.models import (
    Attempt,
    AttemptAnswer,
    DPS,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Lesson,
    Level,
    Module,
    Student,
    User,
)
from app.services.attempt_service import (
    _lock_attempt_for_update,
    save_answer,
    submit_attempt,
)


@pytest.fixture()
def engine():
    # A real file-backed SQLite DB (not :memory:/StaticPool) with NullPool,
    # so every Session() checkout below gets its own genuinely independent
    # DBAPI connection -- unlike test_dps_typed_answer_flow.py's in-memory
    # StaticPool fixture (one shared connection for everything, which can't
    # host two truly separate transactions at once). A couple of tests below
    # deliberately open a SECOND, independent Session against the same data
    # to check that a read isn't served from the first session's stale
    # identity map -- that needs two real connections to mean anything.
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}", poolclass=NullPool)
    models.Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()
        os.remove(path)


@pytest.fixture()
def SessionLocal(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def db(SessionLocal):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def student(db):
    user = User(full_name="Race Test Student", email="race-fix-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    module = Module(module_code="IM", module_name="Intermediate Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="IM-L4", level_name="Intermediate Module Level 4")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=5, lesson_title="Lesson 5")
    db.add(lesson)
    db.commit()
    st = Student(user_id=user.id, student_code="MP-ST-RACE", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


@pytest.fixture()
def attempt_with_two_questions(db, student):
    lesson = db.query(Lesson).first()
    dps = DPS(lesson_id=lesson.id, dps_number=3, dps_title="DPS 3", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    qset = GeneratedQuestionSet(dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="RACE-SEED")
    db.add(qset)
    db.commit()

    q1 = GeneratedQuestion(question_set_id=qset.id, question_number=1, display_type="VERTICAL",
                            operands_json="[1,1]", operators_json='["+"]', correct_answer="0.000044875", seed="r1")
    q2 = GeneratedQuestion(question_set_id=qset.id, question_number=2, display_type="VERTICAL",
                            operands_json="[2,2]", operators_json='["+"]', correct_answer="4", seed="r2")
    db.add_all([q1, q2])
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        question_set_id=qset.id,
        student_id=student.id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(seconds=600),
        duration_seconds=600,
        total_questions=2,
        max_score=2,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt, [q1, q2]


def test_normal_save_then_submit_still_grades_correctly_through_locked_path(db, student, attempt_with_two_questions):
    """Sanity: the locking added to save_answer()/submit_attempt() must not
    change the result of the ordinary, non-racing flow -- exactly the
    screenshot's own numbers (a decimal answer typed exactly as the
    question's correct_answer) must still be graded correct."""
    attempt, (q1, q2) = attempt_with_two_questions

    save_answer(db, student, attempt.id, q1.id, "0.000044875")
    save_answer(db, student, attempt.id, q2.id, "3")  # genuinely wrong

    submitted = submit_attempt(db, attempt, auto=False)

    assert submitted.status == "SUBMITTED"
    assert submitted.correct_count == 1
    assert submitted.wrong_count == 1
    assert submitted.total_score == 1
    assert submitted.max_score == 2

    q1_answer = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == q1.id).first()
    assert q1_answer.selected_value == "0.000044875"
    assert q1_answer.is_correct is True
    assert q1_answer.marks_awarded == 1


def test_save_after_submit_is_rejected_fail_closed_and_never_corrupts_grade(db, student, attempt_with_two_questions):
    """This is the fail-closed half of the fix: once submit_attempt() has
    graded and committed, a save_answer() that "loses the race" must be
    cleanly rejected -- never silently applied against an already-graded
    attempt, which is exactly how the observed bug produced a correct-
    looking selected_value sitting next to a stale is_correct=False."""
    attempt, (q1, q2) = attempt_with_two_questions

    save_answer(db, student, attempt.id, q1.id, "0.000044875")
    save_answer(db, student, attempt.id, q2.id, "4")
    submitted = submit_attempt(db, attempt, auto=False)
    assert submitted.correct_count == 2
    assert submitted.total_score == 2

    # A save that arrives late (e.g. the debounced autosave finally fires
    # after the deadline-triggered auto-submit already graded everything)
    # must be rejected, not silently written.
    result = save_answer(db, student, attempt.id, q1.id, "999")
    assert result["saved"] is False
    assert result["status"] == "SUBMITTED"

    # The already-graded answer must be completely untouched by the
    # rejected save -- both the stored text and the grading fields.
    q1_answer = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == q1.id).first()
    assert q1_answer.selected_value == "0.000044875"
    assert q1_answer.is_correct is True
    assert q1_answer.marks_awarded == 1

    # And the attempt's own aggregate score must still reflect the original
    # grading -- a rejected save must never drift correct_count/total_score.
    db.refresh(attempt)
    assert attempt.correct_count == 2
    assert attempt.total_score == 2


def test_submit_attempt_is_idempotent_second_call_never_recomputes(db, student, attempt_with_two_questions):
    """Two submissions can race for the same attempt (a manual Submit click
    and the lazy auto-submit side effect both firing near the deadline).
    Whichever wins must fully decide the grade; the second call must
    short-circuit rather than re-grading off of whatever the DB looks like
    by the time it runs -- otherwise the two could disagree with each other
    depending purely on timing."""
    attempt, (q1, q2) = attempt_with_two_questions

    save_answer(db, student, attempt.id, q1.id, "0.000044875")
    save_answer(db, student, attempt.id, q2.id, "4")
    first = submit_attempt(db, attempt, auto=False)
    assert first.status == "SUBMITTED"
    assert first.correct_count == 2

    # Simulate data that would grade differently if submit_attempt() were
    # to (incorrectly) recompute on a second call.
    q2_answer = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == q2.id).first()
    q2_answer.selected_value = "not a number"
    db.commit()

    second = submit_attempt(db, attempt, auto=True)
    assert second.status == "SUBMITTED"  # not flipped to AUTO_SUBMITTED
    assert second.correct_count == 2  # unchanged -- proves it short-circuited, didn't re-grade
    assert second.total_score == 2


def test_lock_attempt_for_update_reads_current_committed_state_not_a_stale_copy(db, SessionLocal, student, attempt_with_two_questions):
    """Direct unit coverage of the helper the whole fix depends on: it must
    return the attempt's CURRENT row, reflecting whatever the latest
    committed write was -- via a second, independent session that never
    shares db's identity map. If a future change made this helper reuse a
    cached/stale object instead of issuing a real query, this test would
    fail even though it can't exercise genuine lock contention on SQLite."""
    attempt, (q1, q2) = attempt_with_two_questions
    # Grab the id as a plain string BEFORE releasing db's transaction below.
    # This matters: once db.commit() expires `attempt`, touching attempt.id
    # would trigger an implicit refresh query on db's OWN connection -- and
    # SQLite gives a still-open read transaction a consistent snapshot from
    # the moment it starts, so if that implicit refresh happened before
    # other_session's commit, every later read on db would keep seeing the
    # pre-commit snapshot no matter how "fresh" the query looks. Using a
    # plain str from here on keeps db from touching the DB at all until the
    # single query inside _lock_attempt_for_update() -- issued after the
    # other session has already committed.
    attempt_id = attempt.id
    # Release whatever transaction the fixture setup left open on `db` --
    # SQLite's file-level locking would otherwise make other_session's
    # commit below block/fail behind this session's own still-open read.
    db.commit()

    other_session = SessionLocal()
    try:
        # Second session independently commits a status change -- simulates
        # the "other side" of the race having already finished by the time
        # this side goes to acquire the lock.
        other_attempt = other_session.get(Attempt, attempt_id)
        other_attempt.status = "AUTO_SUBMITTED"
        other_session.commit()

        locked = _lock_attempt_for_update(db, attempt_id)
        assert locked is not None
        assert locked.status == "AUTO_SUBMITTED"  # not the IN_PROGRESS this session originally saw
    finally:
        other_session.close()


def test_save_answer_rejects_once_lock_reread_sees_submission_from_another_session(db, SessionLocal, student, attempt_with_two_questions):
    """The exact shape of the original bug's fix: save_answer()'s own
    unlocked status check can pass (attempt still looks IN_PROGRESS to this
    session), but the fresh locked re-read right before the write must catch
    a submission that another session already committed -- and reject the
    save instead of writing an answer into an attempt that's already been
    graded."""
    attempt, (q1, q2) = attempt_with_two_questions
    # Capture plain-string ids before db's transaction is released, for the
    # same reason as the test above: touching an expired ORM attribute later
    # would silently start a new (and then stale-snapshotted) transaction on
    # db's own connection.
    attempt_id, q1_id, q2_id = attempt.id, q1.id, q2.id
    db.commit()

    other_session = SessionLocal()
    try:
        other_attempt = other_session.get(Attempt, attempt_id)
        save_answer(other_session, student, attempt_id, q2_id, "4")
        submit_attempt(other_session, other_attempt, auto=True)
        other_session.commit()
    finally:
        other_session.close()

    # This session's own (unrefreshed) view of `attempt` was loaded before
    # the other session's submit committed.
    result = save_answer(db, student, attempt_id, q1_id, "0.000044875")
    assert result["saved"] is False
    assert result["status"] == "AUTO_SUBMITTED"

    q1_answer = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt_id, AttemptAnswer.question_id == q1_id).first()
    assert q1_answer is None or q1_answer.selected_value != "0.000044875"
