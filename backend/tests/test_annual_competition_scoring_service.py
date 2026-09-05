"""Package 6 (Scoring + Results) tests.

Covers the automatic finalize-on-last-section hook (correct/wrong/
unanswered counts, score, accuracy%, and per-section active-time capture
excluding pause time), the confirmed ranking formula (accuracy desc, time
asc, "later first mistake wins" tie-break, "no mistake ever" beats any
mistake), release gating (student sees nothing until released regardless
of computation/ranking, admin always sees it), and that re-finalizing never
silently un-releases or un-ranks an already-released result.

Self-contained fixtures (no cross-file imports), matching this repo's own
per-test-file convention -- mirrors test_annual_competition_student_screens_
service.py's question/option/answer fixtures since scoring needs real
graded answers, not just timers.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as attempt_engine
from app.services import annual_competition_scoring_service as scoring


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _admin(db, uid="user-admin"):
    a = User(id=uid, full_name="Admin", email=f"{uid}@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _student(db, sid="student-1", name=None):
    u = _user(db, f"user-{sid}", name=name or sid)
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid}", is_active=True)
    db.add(s)
    return s


def _event(db, event_id="event-1"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status="SCHEDULED",
        competition_date=datetime.now(timezone.utc) + timedelta(days=10),
    )
    db.add(e)
    return e


def _module_and_level(db, module_code="PM", level_code="PM-L2", level_name="Preparatory Level 2"):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = db.query(Level).filter(Level.module_id == m.id, Level.level_code == level_code).first()
    if not l:
        l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
        db.add(l)
        db.flush()
    return m, l


def _mock_exam(db, level_id, module_id, exam_id="exam-1"):
    e = CompetitionMockExam(
        id=exam_id, title="Test Exam", module_id=module_id, level_id=level_id,
        total_questions=20, duration_seconds=1200, is_active=True,
    )
    db.add(e)
    db.flush()
    return e


def _question_with_options(db, mock_exam_id, section_number, question_number, marks=1, qid=None):
    qid = qid or f"q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=marks,
    )
    db.add(q)
    db.flush()
    correct = CompetitionMockQuestionOption(
        id=f"{qid}-opt-a", mock_question_id=q.id, option_label="A", option_value="4", is_correct=True, display_order=1,
    )
    wrong = CompetitionMockQuestionOption(
        id=f"{qid}-opt-b", mock_question_id=q.id, option_label="B", option_value="5", is_correct=False, display_order=2,
    )
    db.add(correct)
    db.add(wrong)
    db.flush()
    return q, correct, wrong


def _assignment(db, event_id, student_id, assigned_level_code, assignment_id=None):
    assignment_id = assignment_id or f"assign-{student_id}"
    a = CompetitionEventAssignment(
        id=assignment_id, event_id=event_id, student_id=student_id,
        assigned_level_code=assigned_level_code, assignment_source="AUTO", is_active=True,
    )
    db.add(a)
    db.flush()
    return a


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, section_seconds, level_paper_id="paper-1"):
    p = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=mock_exam_id, status="READY",
    )
    db.add(p)
    db.flush()
    for i, seconds in enumerate(section_seconds, start=1):
        t = CompetitionEventSectionTimer(
            id=f"{level_paper_id}-timer-{i}", level_paper_id=p.id, section_number=i,
            section_title=f"Section {i}", mode="MIXED", time_limit_seconds=seconds, display_order=i,
        )
        db.add(t)
    db.flush()
    return p


def _setup_student_with_questions(db, student_id, event_id, section_seconds, questions_per_section, level_code="PM-L2", exam_id=None, level_paper_id=None, qid_prefix=None):
    """Wires one student, assigned + ready to attempt a level paper with
    real, gradeable questions. Reuses the SAME exam/level-paper across
    students when exam_id/level_paper_id are passed explicitly (needed for
    ranking tests, where multiple students share one paper). qid_prefix
    disambiguates question ids across two DIFFERENT exams created in the
    SAME test (e.g. one PM exam + one IM exam) -- otherwise both would
    default to the same "q-<section>-<n>" ids and collide."""
    student = _student(db, student_id)
    m, l = _module_and_level(db, level_code=level_code)
    exam_id = exam_id or f"exam-{level_code}"
    if not db.get(CompetitionMockExam, exam_id):
        exam = _mock_exam(db, l.id, m.id, exam_id=exam_id)
        for section_number, count in enumerate(questions_per_section, start=1):
            for n in range(1, count + 1):
                question_number = (section_number - 1) * 10 + n
                qid = f"{qid_prefix}-q-{section_number}-{question_number}" if qid_prefix else None
                _question_with_options(db, exam.id, section_number, question_number, qid=qid)
    _assignment(db, event_id, student.id, level_code)
    level_paper_id = level_paper_id or f"paper-{level_code}"
    if not db.get(CompetitionEventLevelPaper, level_paper_id):
        _level_paper_with_timers(db, event_id, level_code, exam_id, list(section_seconds), level_paper_id=level_paper_id)
    db.flush()
    return student


def _answer(db, student, attempt_id, token, section_number, question_id, correct):
    option_suffix = "-opt-a" if correct else "-opt-b"
    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, section_number, question_id, f"{question_id}{option_suffix}")


# ---------------------------------------------------------------------------
# Automatic finalize-on-submit: raw metrics
# ---------------------------------------------------------------------------

def test_finalize_computes_correct_wrong_and_score():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[2])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", correct=True)
    _answer(db, student, attempt_id, token, 1, "q-1-2", correct=False)

    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    assert attempt.status == "FINALIZED"

    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result.correct_count == 1
    assert result.wrong_count == 1
    assert result.unanswered_count == 0
    assert result.score == 1
    assert result.max_score == 2
    assert result.percentage == 50.0
    assert result.accuracy_percentage == 50.0
    assert result.competition_level_code == "PM-L2"


def test_finalize_counts_unanswered_as_zero_marks_not_wrong():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[3])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", correct=True)
    # q-1-2 and q-1-3 left unanswered.

    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result.correct_count == 1
    assert result.wrong_count == 0
    assert result.unanswered_count == 2
    assert result.score == 1
    assert result.max_score == 3
    assert round(result.accuracy_percentage, 2) == round((1 / 3) * 100, 2)


def test_finalize_time_taken_excludes_pause_and_sums_per_section():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600, 300), questions_per_section=[1, 1])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    # Section 1: used 200 of 600s (simulate directly, same pattern as
    # Package 4's own heartbeat tests -- no real wall-clock wait needed).
    section_1 = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section_1.remaining_seconds_at_last_heartbeat = 400
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    # Section 2: used 50 of 300s.
    section_2 = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=2).first()
    section_2.remaining_seconds_at_last_heartbeat = 250
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)

    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result.time_taken_seconds == 200 + 50
    import json
    per_section = json.loads(result.per_section_time_json)
    assert per_section == [
        {"sectionNumber": 1, "timeLimitSeconds": 600, "timeTakenSeconds": 200},
        {"sectionNumber": 2, "timeLimitSeconds": 300, "timeTakenSeconds": 50},
    ]


def test_reconciliation_sweep_also_finalizes_scoring():
    """The reconciliation sweep (Package 4) shares the exact same
    _AdvanceOrFinalize call -- confirming it also triggers Package 6's
    scoring, not just the status transition."""
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", correct=True)

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=10)  # well past the grace window
    db.commit()

    attempt_engine.ReconcileExpiredCompetitionEventAttempts(db)

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    assert attempt.status == "FINALIZED"
    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result.correct_count == 1


# ---------------------------------------------------------------------------
# Ranking (accuracy desc, time asc, "later mistake wins" tie-break)
# ---------------------------------------------------------------------------

def _submit_full_attempt(db, student, event_id, answers_by_question_id, section_seconds=(600,)):
    started = attempt_engine.StartCompetitionEventAttempt(db, student, event_id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    for question_id, correct in answers_by_question_id.items():
        _answer(db, student, attempt_id, token, 1, question_id, correct=correct)
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    return attempt_id


def test_ranking_orders_by_accuracy_then_time():
    db = _session()
    event = _event(db)
    # Both students share the SAME exam/level-paper (shared paper fairness).
    student_a = _setup_student_with_questions(db, "sA", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    student_b = _setup_student_with_questions(db, "sB", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    db.commit()

    # Student A: both correct (100% accuracy).
    _submit_full_attempt(db, student_a, event.id, {"q-1-1": True, "q-1-2": True})
    # Student B: one correct, one wrong (50% accuracy).
    _submit_full_attempt(db, student_b, event.id, {"q-1-1": True, "q-1-2": False})

    outcome = scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")
    assert outcome["rankedCount"] == 2

    result_a = db.query(CompetitionEventResult).filter_by(student_id="sA").one()
    result_b = db.query(CompetitionEventResult).filter_by(student_id="sB").one()
    assert result_a.rank == 1
    assert result_b.rank == 2


def test_ranking_time_breaks_accuracy_tie():
    db = _session()
    event = _event(db)
    student_a = _setup_student_with_questions(db, "sA", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    student_b = _setup_student_with_questions(db, "sB", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    db.commit()

    # Both get 100% accuracy, but student A finishes faster.
    started_a = attempt_engine.StartCompetitionEventAttempt(db, student_a, event.id)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-1", correct=True)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-2", correct=True)
    section_a = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_a["attemptId"], section_number=1).first()
    section_a.remaining_seconds_at_last_heartbeat = 500  # used 100s
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1)

    started_b = attempt_engine.StartCompetitionEventAttempt(db, student_b, event.id)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-1", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-2", correct=True)
    section_b = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_b["attemptId"], section_number=1).first()
    section_b.remaining_seconds_at_last_heartbeat = 300  # used 300s -- slower
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1)

    scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")

    result_a = db.query(CompetitionEventResult).filter_by(student_id="sA").one()
    result_b = db.query(CompetitionEventResult).filter_by(student_id="sB").one()
    assert result_a.rank == 1  # faster, same accuracy
    assert result_b.rank == 2


def test_ranking_later_first_mistake_wins_full_tie():
    db = _session()
    event = _event(db)
    student_a = _setup_student_with_questions(db, "sA", event.id, section_seconds=(600,), questions_per_section=[4], exam_id="exam-shared", level_paper_id="paper-shared")
    student_b = _setup_student_with_questions(db, "sB", event.id, section_seconds=(600,), questions_per_section=[4], exam_id="exam-shared", level_paper_id="paper-shared")
    db.commit()

    # Both: 2 correct, 2 wrong (50% accuracy), same time taken.
    # Student A's first mistake is on question 1 (early).
    # Student B's first mistake is on question 3 (later) -- B should win.
    started_a = attempt_engine.StartCompetitionEventAttempt(db, student_a, event.id)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-1", correct=False)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-2", correct=True)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-3", correct=True)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-4", correct=False)
    section_a = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_a["attemptId"], section_number=1).first()
    section_a.remaining_seconds_at_last_heartbeat = 400
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1)

    started_b = attempt_engine.StartCompetitionEventAttempt(db, student_b, event.id)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-1", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-2", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-3", correct=False)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-4", correct=False)
    section_b = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_b["attemptId"], section_number=1).first()
    section_b.remaining_seconds_at_last_heartbeat = 400  # same time taken as A
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1)

    scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")

    result_a = db.query(CompetitionEventResult).filter_by(student_id="sA").one()
    result_b = db.query(CompetitionEventResult).filter_by(student_id="sB").one()
    assert result_a.accuracy_percentage == result_b.accuracy_percentage
    assert result_a.time_taken_seconds == result_b.time_taken_seconds
    assert result_b.rank == 1  # B's first mistake (Q3) came later than A's (Q1)
    assert result_a.rank == 2


def test_ranking_no_mistake_beats_a_tied_student_with_one_mistake():
    db = _session()
    event = _event(db)
    student_a = _setup_student_with_questions(db, "sA", event.id, section_seconds=(600,), questions_per_section=[4], exam_id="exam-shared", level_paper_id="paper-shared")
    student_b = _setup_student_with_questions(db, "sB", event.id, section_seconds=(600,), questions_per_section=[4], exam_id="exam-shared", level_paper_id="paper-shared")
    db.commit()

    # Same accuracy (75%) and time via different mixes: A gets 3 correct +
    # 1 unanswered (never "wrong"); B gets 3 correct + 1 wrong.
    started_a = attempt_engine.StartCompetitionEventAttempt(db, student_a, event.id)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-1", correct=True)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-2", correct=True)
    _answer(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1, "q-1-3", correct=True)
    # q-1-4 left unanswered -- A never made a "mistake".
    section_a = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_a["attemptId"], section_number=1).first()
    section_a.remaining_seconds_at_last_heartbeat = 400
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_a, started_a["attemptId"], started_a["sessionToken"], 1)

    started_b = attempt_engine.StartCompetitionEventAttempt(db, student_b, event.id)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-1", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-2", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-3", correct=True)
    _answer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-4", correct=False)
    section_b = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=started_b["attemptId"], section_number=1).first()
    section_b.remaining_seconds_at_last_heartbeat = 400
    db.commit()
    attempt_engine.SubmitCompetitionEventSection(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1)

    scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")

    result_a = db.query(CompetitionEventResult).filter_by(student_id="sA").one()
    result_b = db.query(CompetitionEventResult).filter_by(student_id="sB").one()
    assert result_a.accuracy_percentage == result_b.accuracy_percentage
    assert result_a.time_taken_seconds == result_b.time_taken_seconds
    assert result_a.rank == 1  # never made a mistake at all
    assert result_b.rank == 2


def test_ranking_unknown_level_yields_zero_ranked():
    db = _session()
    event = _event(db)
    db.commit()
    outcome = scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L9")
    assert outcome["rankedCount"] == 0


# ---------------------------------------------------------------------------
# Release gating
# ---------------------------------------------------------------------------

def test_student_sees_nothing_until_released():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()
    attempt_id = _submit_full_attempt(db, student, event.id, {"q-1-1": True})

    payload = scoring.GetCompetitionEventResultForStudent(db, student, attempt_id)
    assert payload["released"] is False
    assert payload["result"] is None

    # Still not released after ranking alone.
    scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")
    payload = scoring.GetCompetitionEventResultForStudent(db, student, attempt_id)
    assert payload["released"] is False


def test_student_sees_result_once_released():
    db = _session()
    event = _event(db)
    admin = _admin(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()
    attempt_id = _submit_full_attempt(db, student, event.id, {"q-1-1": True})

    scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2", ReleasedBy=admin)

    payload = scoring.GetCompetitionEventResultForStudent(db, student, attempt_id)
    assert payload["released"] is True
    assert payload["result"]["correctCount"] == 1
    assert payload["result"]["rank"] == 1  # release auto-ranks


def test_release_auto_ranks_without_a_separate_call():
    db = _session()
    event = _event(db)
    admin = _admin(db)
    student_a = _setup_student_with_questions(db, "sA", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    student_b = _setup_student_with_questions(db, "sB", event.id, section_seconds=(600,), questions_per_section=[2], exam_id="exam-shared", level_paper_id="paper-shared")
    db.commit()
    _submit_full_attempt(db, student_a, event.id, {"q-1-1": True, "q-1-2": True})
    _submit_full_attempt(db, student_b, event.id, {"q-1-1": True, "q-1-2": False})

    scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2", ReleasedBy=admin)

    result_a = db.query(CompetitionEventResult).filter_by(student_id="sA").one()
    result_b = db.query(CompetitionEventResult).filter_by(student_id="sB").one()
    assert result_a.rank == 1
    assert result_b.rank == 2
    assert result_a.is_released is True
    assert result_b.is_released is True


def test_admin_always_sees_result_regardless_of_release():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()
    _submit_full_attempt(db, student, event.id, {"q-1-1": True})

    listing = scoring.ListCompetitionEventResultsForAdmin(db, EventId=event.id)
    assert listing["totalResults"] == 1
    assert listing["rows"][0]["isReleased"] is False
    assert listing["rows"][0]["correctCount"] == 1


def test_release_scoped_to_one_level_does_not_release_another():
    db = _session()
    event = _event(db)
    admin = _admin(db)
    student_pm = _setup_student_with_questions(db, "sPM", event.id, section_seconds=(600,), questions_per_section=[1], level_code="PM-L2", exam_id="exam-pm", level_paper_id="paper-pm", qid_prefix="pm")
    student_im = _setup_student_with_questions(db, "sIM", event.id, section_seconds=(600,), questions_per_section=[1], level_code="IM-L1", exam_id="exam-im", level_paper_id="paper-im", qid_prefix="im")
    db.commit()
    _submit_full_attempt(db, student_pm, event.id, {"pm-q-1-1": True})
    _submit_full_attempt(db, student_im, event.id, {"im-q-1-1": True})

    scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2", ReleasedBy=admin)

    result_pm = db.query(CompetitionEventResult).filter_by(student_id="sPM").one()
    result_im = db.query(CompetitionEventResult).filter_by(student_id="sIM").one()
    assert result_pm.is_released is True
    assert result_im.is_released is False


def test_release_all_levels_when_no_level_specified():
    db = _session()
    event = _event(db)
    admin = _admin(db)
    student_pm = _setup_student_with_questions(db, "sPM", event.id, section_seconds=(600,), questions_per_section=[1], level_code="PM-L2", exam_id="exam-pm", level_paper_id="paper-pm", qid_prefix="pm")
    student_im = _setup_student_with_questions(db, "sIM", event.id, section_seconds=(600,), questions_per_section=[1], level_code="IM-L1", exam_id="exam-im", level_paper_id="paper-im", qid_prefix="im")
    db.commit()
    _submit_full_attempt(db, student_pm, event.id, {"pm-q-1-1": True})
    _submit_full_attempt(db, student_im, event.id, {"im-q-1-1": True})

    outcome = scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode=None, ReleasedBy=admin)
    assert set(outcome["levelsReleased"]) == {"PM-L2", "IM-L1"}

    result_pm = db.query(CompetitionEventResult).filter_by(student_id="sPM").one()
    result_im = db.query(CompetitionEventResult).filter_by(student_id="sIM").one()
    assert result_pm.is_released is True
    assert result_im.is_released is True


def test_release_unknown_event_raises_404():
    db = _session()
    admin = _admin(db)
    db.commit()
    with pytest.raises(HTTPException):
        scoring.ReleaseCompetitionEventResults(db, EventId="does-not-exist", CompetitionLevelCode=None, ReleasedBy=admin)


def test_recompute_never_flips_an_already_released_result_back():
    """pkg-06 checklist item 4: re-computation must never silently
    un-release or un-rank an already-released result. Simulates an
    admin-triggered recompute (e.g. after a technical-issue retry) by
    calling ComputeAndFinalizeCompetitionEventResult again directly on an
    attempt whose result has already been released and ranked."""
    db = _session()
    event = _event(db)
    admin = _admin(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()
    attempt_id = _submit_full_attempt(db, student, event.id, {"q-1-1": True})
    scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2", ReleasedBy=admin)

    result_before = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result_before.is_released is True
    released_at_before = result_before.released_at
    rank_before = result_before.rank

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    scoring.ComputeAndFinalizeCompetitionEventResult(db, attempt)
    db.commit()

    result_after = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert result_after.is_released is True
    assert result_after.released_at == released_at_before
    assert result_after.rank == rank_before
