"""Point 7 (Shailesh, 2026-09-08): admin per-question Annual Competition
attempt review -- GetCompetitionEventAttemptReviewForAdmin
(annual_competition_attempt_service.py).

Every section, every question, the student's typed answer next to the
correct answer, for one specific attempt. Fixtures mirror
test_annual_competition_scoring_service.py's own conventions (self-
contained, no cross-file imports) since this also needs real gradeable
questions, not just timers.
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
    CompetitionEventAttemptAnswer,
    CompetitionEventLevelPaper,
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


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _student(db, sid="student-1", name=None):
    u = _user(db, f"user-{sid}", name=name or "Ravi Kumar")
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
    m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
    db.add(m)
    db.flush()
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


def _question(db, mock_exam_id, section_number, question_number, correct_answer="4", qid=None):
    qid = qid or f"q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer=correct_answer, concept_family="Addition", marks=1,
        question_text=f"Question {question_number}",
    )
    db.add(q)
    db.flush()
    return q


def _setup_student_with_questions(db, student_id, event_id, section_seconds, questions_per_section, level_code="PM-L2"):
    student = _student(db, student_id)
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id, exam_id=f"exam-{level_code}")
    for section_number, count in enumerate(questions_per_section, start=1):
        for n in range(1, count + 1):
            question_number = (section_number - 1) * 10 + n
            _question(db, exam.id, section_number, question_number)

    assignment = CompetitionEventAssignment(
        id=f"assign-{student_id}", event_id=event_id, student_id=student.id,
        assigned_level_code=level_code, assignment_source="AUTO", is_active=True,
    )
    db.add(assignment)
    db.flush()

    level_paper_id = f"paper-{level_code}"
    paper = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=exam.id, status="READY",
    )
    db.add(paper)
    db.flush()
    for i, seconds in enumerate(section_seconds, start=1):
        t = CompetitionEventSectionTimer(
            id=f"{level_paper_id}-timer-{i}", level_paper_id=paper.id, section_number=i,
            section_title=f"Speed Round {i}", mode="ABACUS", time_limit_seconds=seconds, display_order=i,
        )
        db.add(t)
    db.flush()
    db.commit()
    return student


def _answer(db, student, attempt_id, token, section_number, question_id, answer_text):
    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, section_number, question_id, answer_text)


def test_review_shows_every_question_with_student_and_correct_answer_and_result_summary():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[2])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", "4")   # correct
    _answer(db, student, attempt_id, token, 1, "q-1-2", "5")   # wrong (correct is "4")

    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)

    assert review["attemptId"] == attempt_id
    assert review["studentId"] == student.id
    assert review["studentName"] == "Ravi Kumar"
    assert review["studentCode"] == "MP-s1"
    assert review["assignedLevelCode"] == "PM-L2"
    assert review["eventName"] == "Annual Competition 2026"
    assert review["status"] == "FINALIZED"

    assert len(review["sections"]) == 1
    section = review["sections"][0]
    assert section["sectionNumber"] == 1
    assert section["sectionTitle"] == "Speed Round 1"
    assert section["mode"] == "ABACUS"
    assert len(section["questions"]) == 2

    q1 = next(q for q in section["questions"] if q["questionId"] == "q-1-1")
    assert q1["questionNumber"] == 1
    assert q1["studentAnswer"] == "4"
    assert q1["correctAnswer"] == "4"
    assert q1["isCorrect"] is True
    assert q1["isUnanswered"] is False

    q2 = next(q for q in section["questions"] if q["questionId"] == "q-1-2")
    assert q2["questionNumber"] == 2
    assert q2["studentAnswer"] == "5"
    assert q2["correctAnswer"] == "4"
    assert q2["isCorrect"] is False
    assert q2["isUnanswered"] is False

    # Result summary reflects the same finalize this attempt already went
    # through (Package 6) -- the review screen must never disagree with it.
    assert review["result"] is not None
    assert review["result"]["correctCount"] == 1
    assert review["result"]["wrongCount"] == 1
    assert review["result"]["score"] == 1
    assert review["result"]["maxScore"] == 2


def test_review_marks_unanswered_question_correctly():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[2])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", "4")
    # q-1-2 left unanswered.

    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    section = review["sections"][0]
    q2 = next(q for q in section["questions"] if q["questionId"] == "q-1-2")
    assert q2["studentAnswer"] is None
    assert q2["isUnanswered"] is True
    assert q2["isCorrect"] is False
    assert q2["correctAnswer"] == "4"


def test_review_before_submission_has_no_result_but_still_shows_saved_answers():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[2])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", "4")

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    assert review["result"] is None
    assert review["status"] == "IN_PROGRESS"
    q1 = next(q for q in review["sections"][0]["questions"] if q["questionId"] == "q-1-1")
    assert q1["studentAnswer"] == "4"
    assert q1["isCorrect"] is True


def test_review_unknown_attempt_raises_404():
    db = _session()
    with pytest.raises(HTTPException) as exc_info:
        attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId="does-not-exist")
    assert exc_info.value.status_code == 404


def test_review_correctness_is_tolerant_like_the_live_save_path():
    """Mirrors the correctness guarantee Shailesh explicitly called out --
    a formatting difference (a redundant leading zero) that answers_match
    already tolerates at save time must read identically here, never as a
    false "wrong" on the audit screen. Uses a leading zero rather than
    whitespace since SaveCompetitionEventAnswer already strips whitespace
    before persisting -- this exercises answers_match's own numeric
    tolerance, not just the save path's trimming."""
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "q-1-1", "04")

    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    q1 = review["sections"][0]["questions"][0]
    assert q1["studentAnswer"] == "04"
    assert q1["correctAnswer"] == "4"
    assert q1["isCorrect"] is True


# ---------------------------------------------------------------------------
# Point 9 (Shailesh, 2026-09-08): legacy MCQ-era answers must still review
# correctly -- an attempt answered before the typed-answer switch has
# selected_option_id set and selected_value NULL forever (no backfill; see
# ensure_annual_competition_answer_text_column's own docstring). Without a
# fallback, GetCompetitionEventAttemptReviewForAdmin would show every such
# question as "Not Answered" even though it was genuinely answered and
# already correctly scored -- exactly the bug Shailesh reported from a real
# attempt on the live server.
# ---------------------------------------------------------------------------

def _legacy_option_answer(db, attempt_id, question_id, option_id, is_correct, answer_id=None):
    """Directly inserts a CompetitionEventAttemptAnswer the way the OLD
    MCQ save path used to -- selected_option_id populated, selected_value
    left NULL -- bypassing SaveCompetitionEventAnswer (which only ever
    writes the new typed-answer shape now) so this test fixture accurately
    represents real pre-migration data rather than something the current
    code could itself produce."""
    answer = CompetitionEventAttemptAnswer(
        id=answer_id or f"answer-{question_id}",
        attempt_id=attempt_id,
        mock_question_id=question_id,
        selected_option_id=option_id,
        selected_value=None,
        is_correct=is_correct,
    )
    db.add(answer)
    db.flush()
    return answer


def test_review_falls_back_to_legacy_option_when_selected_value_is_null():
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[2])
    db.commit()

    correct_option = CompetitionMockQuestionOption(
        id="opt-1-1-correct", mock_question_id="q-1-1", option_label="A", option_value="4", is_correct=True, display_order=1,
    )
    wrong_option = CompetitionMockQuestionOption(
        id="opt-1-2-wrong", mock_question_id="q-1-2", option_label="B", option_value="7", is_correct=False, display_order=1,
    )
    db.add(correct_option)
    db.add(wrong_option)
    db.flush()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]
    _legacy_option_answer(db, attempt_id, "q-1-1", correct_option.id, is_correct=True)
    _legacy_option_answer(db, attempt_id, "q-1-2", wrong_option.id, is_correct=False, answer_id="answer-q-1-2")
    db.commit()

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    section = review["sections"][0]

    q1 = next(q for q in section["questions"] if q["questionId"] == "q-1-1")
    assert q1["studentAnswer"] == "4"
    assert q1["isUnanswered"] is False
    assert q1["isCorrect"] is True

    q2 = next(q for q in section["questions"] if q["questionId"] == "q-1-2")
    assert q2["studentAnswer"] == "7"
    assert q2["isUnanswered"] is False
    assert q2["isCorrect"] is False


def test_review_legacy_fallback_trusts_the_options_own_is_correct_flag_not_a_text_rematch():
    """The option's is_correct flag is the ground truth for an MCQ pick --
    this must be honoured even if the option's display text would NOT
    textually match correct_answer via answers_match, since that's exactly
    the scenario a naive "just re-run answers_match on the option value"
    fallback would silently mis-grade on the review screen."""
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()

    # correct_answer on q-1-1 is "4" (see _question()'s default), but the
    # option marked correct here deliberately has a differently-formatted
    # display value ("Four") that answers_match would NOT consider equal
    # to "4" -- is_correct=True on the option must still win.
    option = CompetitionMockQuestionOption(
        id="opt-1-1-worded", mock_question_id="q-1-1", option_label="A", option_value="Four", is_correct=True, display_order=1,
    )
    db.add(option)
    db.flush()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]
    _legacy_option_answer(db, attempt_id, "q-1-1", option.id, is_correct=True)
    db.commit()

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    q1 = review["sections"][0]["questions"][0]
    assert q1["studentAnswer"] == "Four"
    assert q1["isCorrect"] is True


def test_review_prefers_selected_value_over_legacy_option_when_both_somehow_present():
    """Belt-and-braces: if a row ever has BOTH selected_value and a stale
    selected_option_id (e.g. a very old row touched by both code paths),
    the new typed-answer value must win -- selected_option_id is kept only
    for legacy display, never treated as authoritative once a real typed
    answer exists."""
    db = _session()
    event = _event(db)
    student = _setup_student_with_questions(db, "s1", event.id, section_seconds=(600,), questions_per_section=[1])
    db.commit()

    option = CompetitionMockQuestionOption(
        id="opt-1-1-stale", mock_question_id="q-1-1", option_label="B", option_value="5", is_correct=False, display_order=1,
    )
    db.add(option)
    db.flush()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]
    answer = CompetitionEventAttemptAnswer(
        id="answer-mixed", attempt_id=attempt_id, mock_question_id="q-1-1",
        selected_option_id=option.id, selected_value="4", is_correct=True,
    )
    db.add(answer)
    db.commit()

    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id)
    q1 = review["sections"][0]["questions"][0]
    assert q1["studentAnswer"] == "4"
    assert q1["isCorrect"] is True
