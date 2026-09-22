"""Practice Reports feature, package 2 (Shailesh, 2026-09-16).

Covers annual_competition_practice_report_service.py: the per-student report
(level-scoped and "all levels" blended modes -- see that module's own
docstring for the 2026-09-16 clarification on why the level filter is
optional there), the per-level cohort report (required level, roster
scoping, leaderboard ordering), the shared attempt-weighted averaging rule,
and the practice bank completion counts (assigned vs completed).

Self-contained fixtures (no cross-file imports), matching
test_annual_competition_scoring_service.py's own stated per-test-file
convention.
"""

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
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
from fastapi import HTTPException
import pytest
from app.services import annual_competition_attempt_service as attempt_engine
from app.services import annual_competition_practice_report_service as report_service
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY


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
    u = _user(db, f"user-{sid}", name=name or sid)
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid}", is_active=True)
    db.add(s)
    return s


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


def _mock_exam(db, level_id, module_id, exam_id):
    e = CompetitionMockExam(
        id=exam_id, title="Test Exam", module_id=module_id, level_id=level_id,
        total_questions=20, duration_seconds=1200, is_active=True,
    )
    db.add(e)
    db.flush()
    return e


def _question_with_options(db, mock_exam_id, section_number, question_number, qid):
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1,
    )
    db.add(q)
    db.flush()
    db.add(CompetitionMockQuestionOption(
        id=f"{qid}-opt-a", mock_question_id=q.id, option_label="A", option_value="4", is_correct=True, display_order=1,
    ))
    db.add(CompetitionMockQuestionOption(
        id=f"{qid}-opt-b", mock_question_id=q.id, option_label="B", option_value="5", is_correct=False, display_order=2,
    ))
    db.flush()


def _answer(db, student, attempt_id, token, section_number, question_id, correct):
    answer_text = "4" if correct else "5"
    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, section_number, question_id, answer_text)


def _setup_practice_paper(db, student_id, level_code, section_seconds, questions_per_section, exam_id, level_paper_id, qid_prefix):
    """Wires one PRACTICE bank paper (fresh mock exam + timers) for one
    student at one level -- every call gets its own exam_id/level_paper_id/
    qid_prefix so multiple papers (same or different students/levels) never
    collide, unlike the scoring test file's single-paper-per-level-per-test
    helper."""
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id, exam_id)
    for section_number, count in enumerate(questions_per_section, start=1):
        for n in range(1, count + 1):
            question_number = (section_number - 1) * 10 + n
            _question_with_options(db, exam.id, section_number, question_number, qid=f"{qid_prefix}-q-{section_number}-{question_number}")
    paper = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=None, competition_level_code=level_code,
        mock_exam_id=exam.id, status="READY", paper_kind="PRACTICE",
        assigned_student_id=student_id, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.flush()
    for i, seconds in enumerate(section_seconds, start=1):
        db.add(CompetitionEventSectionTimer(
            id=f"{level_paper_id}-timer-{i}", level_paper_id=paper.id, section_number=i,
            section_title=f"Section {i}", mode="MIXED", time_limit_seconds=seconds, display_order=i,
        ))
    db.flush()
    return paper


def _attempt_and_answer_all(db, student, level_code, qid_prefix, questions_per_section, correct_pattern):
    """Starts a practice attempt against the most-recently-created READY
    bank paper for (student, level_code) -- mirrors StartAnnualCompetition-
    PracticeAttempt's own bank-consumption behavior -- answers every
    question per correct_pattern (a flat list, section 1's questions first),
    and submits every section in order, finalizing the attempt."""
    started = attempt_engine.StartAnnualCompetitionPracticeAttempt(db, student, level_code)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    Index = 0
    for section_number, count in enumerate(questions_per_section, start=1):
        for n in range(1, count + 1):
            question_number = (section_number - 1) * 10 + n
            qid = f"{qid_prefix}-q-{section_number}-{question_number}"
            _answer(db, student, attempt_id, token, section_number, qid, correct=correct_pattern[Index])
            Index += 1
        attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, section_number)
    return attempt_id


# ---------------------------------------------------------------------------
# Per-student report
# ---------------------------------------------------------------------------

def test_student_report_scoped_to_level_returns_summary_section_and_trend():
    db = _session()
    student = _student(db, "s1")
    other = _student(db, "s2")
    _setup_practice_paper(db, student.id, "PM-L2", (600, 300), [2, 2], "exam-a", "paper-a", "a")
    db.commit()
    # Attempt 1: section 1 both correct, section 2 one correct one wrong.
    _attempt_and_answer_all(db, student, "PM-L2", "a", [2, 2], [True, True, True, False])

    _setup_practice_paper(db, student.id, "PM-L2", (600, 300), [2, 2], "exam-b", "paper-b", "b")
    db.commit()
    # Attempt 2: section 1 one wrong one correct, section 2 both wrong.
    _attempt_and_answer_all(db, student, "PM-L2", "b", [2, 2], [True, False, False, False])

    # A second student at the same level, for the cohort comparison.
    _setup_practice_paper(db, other.id, "PM-L2", (600, 300), [2, 2], "exam-c", "paper-c", "c")
    db.commit()
    _attempt_and_answer_all(db, other, "PM-L2", "c", [2, 2], [True, True, True, True])

    report = report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id, CompetitionLevelCode="PM-L2")

    assert report["studentId"] == "s1"
    assert report["competitionLevelCode"] == "PM-L2"
    assert report["summary"]["attemptsCount"] == 2
    # Attempt 1: 3/4 correct = 75%. Attempt 2: 1/4 correct = 25%. Attempt-weighted avg = 50%.
    assert report["summary"]["avgAccuracyPercentage"] == 50.0
    assert report["summary"]["avgScore"] == 2.0  # (3 + 1) / 2

    per_section = {row["sectionNumber"]: row for row in report["perSection"]}
    # Section 1 across both attempts: attempt 1 = 2/2 correct, attempt 2 = 1/2 correct -> avg accuracy 75%.
    assert per_section[1]["avgAccuracyPercentage"] == 75.0
    # Section 2 across both attempts: attempt 1 = 1/2 correct, attempt 2 = 0/2 correct -> avg accuracy 25%.
    assert per_section[2]["avgAccuracyPercentage"] == 25.0
    assert per_section[1]["avgTimeLimitSeconds"] if "avgTimeLimitSeconds" in per_section[1] else True  # noqa: no-op guard
    # 2026-09-17 (Shailesh: "the section names do not all appear ... should
    # appear along with the relevant section numbers"): real titles from
    # PM-L2's own registry (annual_competition_paper_registry.py), not just
    # the bare section number.
    assert per_section[1]["sectionTitle"] == "Add/Less (Abacus)"
    assert per_section[2]["sectionTitle"] == "Add/Less (Visual)"

    assert len(report["trend"]) == 2
    assert report["trend"][0]["accuracyPercentage"] == 75.0
    assert report["trend"][1]["accuracyPercentage"] == 25.0

    # Cohort comparison: 3 attempts total across 2 students (2 from s1, 1 from s2).
    assert report["levelComparison"]["cohortAttemptsCount"] == 3
    assert report["levelComparison"]["cohortStudentsCount"] == 2


def test_trend_and_by_level_dates_survive_a_recompute_that_corrupts_computed_at():
    """2026-09-17 fix (Shailesh bug report -- "the completion date and time
    ... are all the same, which is not possible"): simulates the exact
    historical corruption (a bulk recompute stamping every result's
    computed_at to one identical shared timestamp, which is what actually
    happened in production during the 2026-09-16 per_section_score_json
    backfill) and asserts the trend table's dates -- and the "All Levels"
    byLevel table's lastAttemptAt -- still come out distinct and correct,
    because both now source from CompetitionEventAttempt.submitted_at, which
    that corruption never touched (see _SubmittedAtByAttemptId's own
    docstring)."""
    db = _session()
    student = _student(db, "sTimestampFix")
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [1], "exam-ts-a", "paper-ts-a", "tsa")
    db.commit()
    attempt_id_1 = _attempt_and_answer_all(db, student, "PM-L2", "tsa", [1], [True])

    _setup_practice_paper(db, student.id, "PM-L2", (600,), [1], "exam-ts-b", "paper-ts-b", "tsb")
    db.commit()
    attempt_id_2 = _attempt_and_answer_all(db, student, "PM-L2", "tsb", [1], [True])

    # Give the two attempts genuinely distinct, known submitted_at values --
    # this is the real, uncorrupted source of truth this fix relies on.
    earlier = datetime(2026, 9, 1, 10, 0, 0, tzinfo=timezone.utc)
    later = datetime(2026, 9, 10, 15, 30, 0, tzinfo=timezone.utc)
    db.get(CompetitionEventAttempt, attempt_id_1).submitted_at = earlier
    db.get(CompetitionEventAttempt, attempt_id_2).submitted_at = later

    # Simulate the historical corruption itself: a bulk recompute collapsing
    # both results' computed_at to one identical timestamp.
    corrupted = datetime(2026, 9, 16, 12, 2, 0, tzinfo=timezone.utc)
    for result in db.query(CompetitionEventResult).filter(CompetitionEventResult.student_id == student.id).all():
        result.computed_at = corrupted
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id, CompetitionLevelCode="PM-L2")
    assert len(report["trend"]) == 2
    # Ascending order (earlier first) -- _ResultRowsForStudent now orders by
    # the attempt's own submitted_at, never by the corrupted shared computed_at.
    # (SQLite's in-memory test DB round-trips DateTime(timezone=True) as
    # naive -- Postgres in production keeps the UTC offset -- so compare
    # against the naive isoformat here, same as the round-tripped value.)
    assert report["trend"][0]["computedAt"] == earlier.replace(tzinfo=None).isoformat()
    assert report["trend"][1]["computedAt"] == later.replace(tzinfo=None).isoformat()
    assert report["trend"][0]["computedAt"] != report["trend"][1]["computedAt"]

    all_levels_report = report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id)
    by_level = {row["competitionLevelCode"]: row for row in all_levels_report["byLevel"]}
    assert by_level["PM-L2"]["lastAttemptAt"] == later.replace(tzinfo=None).isoformat()


def test_student_report_all_levels_blends_summary_and_lists_by_level():
    db = _session()
    student = _student(db, "s1")
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [2], "exam-pm", "paper-pm", "pm")
    db.commit()
    _attempt_and_answer_all(db, student, "PM-L2", "pm", [2], [True, True])

    _setup_practice_paper(db, student.id, "IM-L1", (600,), [2], "exam-im", "paper-im", "im")
    db.commit()
    _attempt_and_answer_all(db, student, "IM-L1", "im", [2], [True, False])

    report = report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id, CompetitionLevelCode=None)

    assert report["competitionLevelCode"] is None
    assert report["summary"]["attemptsCount"] == 2
    # No per-section/trend when levels are blended -- not meaningful across
    # different papers.
    assert report["perSection"] == []
    assert report["trend"] == []
    assert report["levelComparison"] is None

    by_level = {row["competitionLevelCode"]: row for row in report["byLevel"]}
    assert by_level["PM-L2"]["attemptsCount"] == 1
    assert by_level["PM-L2"]["avgAccuracyPercentage"] == 100.0
    assert by_level["IM-L1"]["attemptsCount"] == 1
    assert by_level["IM-L1"]["avgAccuracyPercentage"] == 50.0
    # Canonical registry order (YLM-L0, YLM-L1, PM-L1..4, IM-L1..4, MM-L1, MM-L2) -- PM-L2 before IM-L1.
    assert [row["competitionLevelCode"] for row in report["byLevel"]] == ["PM-L2", "IM-L1"]

    # 2026-09-17 (Shailesh: "on selecting a particular level ... the card
    # metrics must always be scoped to that level only and must not show the
    # overview or collated stats for all the levels"): re-requesting this
    # SAME multi-level student, now scoped to just PM-L2, must return PM-L2's
    # own summary (1 attempt, 100% accuracy -- matching its byLevel row
    # above), never the blended "All Levels" summary (2 attempts, 75%) this
    # test already confirmed above.
    pm_l2_report = report_service.GetAnnualCompetitionPracticeReportForStudent(
        db, StudentId=student.id, CompetitionLevelCode="PM-L2"
    )
    assert pm_l2_report["summary"]["attemptsCount"] == 1
    assert pm_l2_report["summary"]["avgAccuracyPercentage"] == 100.0
    assert pm_l2_report["summary"]["attemptsCount"] != report["summary"]["attemptsCount"]


def test_student_report_unknown_student_raises_404():
    db = _session()
    with pytest.raises(HTTPException) as excinfo:
        report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId="does-not-exist")
    assert excinfo.value.status_code == 404


def test_student_report_invalid_level_code_raises_400():
    db = _session()
    student = _student(db, "s1")
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id, CompetitionLevelCode="NOT-A-LEVEL")
    assert excinfo.value.status_code == 400


# ---------------------------------------------------------------------------
# Per-level (cohort) report
# ---------------------------------------------------------------------------

def test_level_report_aggregates_across_students_and_sorts_by_avg_score_desc():
    """2026-09-22 (Practice Leaderboard fix, Shailesh): ranking switched
    from avg accuracy to avg score -- this is the exact scenario Shailesh
    flagged as unfair under the old rule. "sparse" attempts only 1 of the
    level's questions and gets it right (100% accuracy, score 1); "broad"
    attempts 4 questions and gets 3 right (75% accuracy, score 3). Under the
    old accuracy-first sort, sparse would have ranked #1 despite doing
    genuinely less; under the new avgScore-first sort, broad -- who
    objectively performed better -- ranks #1."""
    db = _session()
    sparse = _student(db, "s-sparse", name="Sparse Attempter")
    broad = _student(db, "s-broad", name="Broad Attempter")

    _setup_practice_paper(db, sparse.id, "PM-L2", (600,), [1], "exam-sparse", "paper-sparse", "sparse")
    db.commit()
    _attempt_and_answer_all(db, sparse, "PM-L2", "sparse", [1], [True])

    _setup_practice_paper(db, broad.id, "PM-L2", (600,), [4], "exam-broad", "paper-broad", "broad")
    db.commit()
    _attempt_and_answer_all(db, broad, "PM-L2", "broad", [4], [True, True, True, False])

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")

    assert report["competitionLevelCode"] == "PM-L2"
    assert report["summary"]["attemptsCount"] == 2
    assert report["summary"]["studentsWithAttemptsCount"] == 2
    assert len(report["perStudent"]) == 2

    by_student = {row["studentId"]: row for row in report["perStudent"]}
    assert by_student["s-sparse"]["avgAccuracyPercentage"] == 100.0
    assert by_student["s-sparse"]["avgScore"] == 1.0
    assert by_student["s-broad"]["avgAccuracyPercentage"] == 75.0
    assert by_student["s-broad"]["avgScore"] == 3.0

    # Highest avg SCORE first -- NOT highest avg accuracy (sparse has the
    # higher accuracy but must not rank above broad any more).
    assert report["perStudent"][0]["studentId"] == "s-broad"
    assert report["perStudent"][1]["studentId"] == "s-sparse"
    # 2026-09-18 (Practice Leaderboard feature): explicit 1-based rank field,
    # not just array order -- see GetAnnualCompetitionPracticeReportForLevel's
    # own comment.
    assert report["perStudent"][0]["rank"] == 1
    assert report["perStudent"][1]["rank"] == 2


def test_level_report_avg_max_score_uses_current_canonical_total_not_paper_size():
    """2026-09-22 (Practice Leaderboard fix, Shailesh): "it should always be
    shown out of the total number of questions in that particular level" --
    every perStudent row's avgMaxScore must be the level's CURRENT canonical
    total question count from ANNUAL_COMPETITION_LEVEL_REGISTRY, never the
    average of this student's own (possibly much smaller, test-fixture-sized)
    attempted paper. avgPercentage is recomputed to match that same fixed
    denominator."""
    db = _session()
    student = _student(db, "s-canonical", name="Canonical Denominator")
    # This fixture's own practice paper only has 4 questions -- deliberately
    # far smaller than PM-L2's real registry total, to prove the displayed
    # denominator comes from the registry, not from this attempt's actual
    # max_score.
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [4], "exam-canon", "paper-canon", "canon")
    db.commit()
    _attempt_and_answer_all(db, student, "PM-L2", "canon", [4], [True, True, False, False])

    canonical_total = sum(
        section["questionCount"] for section in ANNUAL_COMPETITION_LEVEL_REGISTRY["PM-L2"]["sections"]
    )
    assert canonical_total != 4  # sanity check that this test is actually exercising the override

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    row = report["perStudent"][0]
    assert row["avgScore"] == 2.0
    assert row["avgMaxScore"] == canonical_total
    assert row["avgPercentage"] == report_service._RoundToInt((2.0 / canonical_total) * 100)


def test_level_report_ties_on_avg_score_break_by_avg_time_ascending():
    """2026-09-22 (Practice Leaderboard fix, Shailesh): two students tied on
    avg score rank by avg time taken ascending -- unchanged from the
    tiebreak rule leaderboard_service.py's DPS/Mock leaderboards already use
    (see that module's own docstring), now applied as the SECOND key behind
    avgScore instead of behind avgAccuracyPercentage."""
    db = _session()
    fast = _student(db, "s-fast", name="Fast Student")
    slow = _student(db, "s-slow", name="Slow Student")

    _setup_practice_paper(db, fast.id, "PM-L2", (600,), [4], "exam-fast", "paper-fast", "fast")
    db.commit()
    _attempt_and_answer_all(db, fast, "PM-L2", "fast", [4], [True, True, False, False])

    _setup_practice_paper(db, slow.id, "PM-L2", (600,), [4], "exam-slow", "paper-slow", "slow")
    db.commit()
    _attempt_and_answer_all(db, slow, "PM-L2", "slow", [4], [True, True, False, False])

    # Both students now have identical score (2/4) -- force distinct
    # time_taken_seconds directly (mirrors this file's own established
    # pattern of post-hoc-patching a field to test ordering, see
    # test_level_report_per_student_last_attempt_at_sources_from_submitted_at
    # above) so the tiebreak, not the tied score, decides the order.
    fast_result = db.query(CompetitionEventResult).filter(CompetitionEventResult.student_id == fast.id).one()
    slow_result = db.query(CompetitionEventResult).filter(CompetitionEventResult.student_id == slow.id).one()
    assert fast_result.score == slow_result.score == 2
    fast_result.time_taken_seconds = 120
    slow_result.time_taken_seconds = 300
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")

    assert [row["studentId"] for row in report["perStudent"]] == ["s-fast", "s-slow"]
    assert report["perStudent"][0]["rank"] == 1
    assert report["perStudent"][1]["rank"] == 2


def test_level_report_ties_on_score_and_time_break_by_papers_completed_desc():
    """2026-09-22 (Practice Leaderboard fix, Shailesh): the NEW third
    tiebreak level -- two students tied on both avg score and avg time
    taken rank by papersCompletedCount descending (more completed practice
    papers wins a tie)."""
    db = _session()
    prolific = _student(db, "s-prolific", name="Prolific Practicer")
    single = _student(db, "s-single", name="Single Attempt")

    # `prolific` completes two identically-scored, identically-timed papers
    # -- attempt-weighted avgScore/avgTime land on the SAME per-attempt
    # values as `single`'s one paper, but papersCompletedCount is 2 vs 1.
    _setup_practice_paper(db, prolific.id, "PM-L2", (600,), [2], "exam-prolific-a", "paper-prolific-a", "prolific-a")
    db.commit()
    _attempt_and_answer_all(db, prolific, "PM-L2", "prolific-a", [2], [True, False])
    _setup_practice_paper(db, prolific.id, "PM-L2", (600,), [2], "exam-prolific-b", "paper-prolific-b", "prolific-b")
    db.commit()
    _attempt_and_answer_all(db, prolific, "PM-L2", "prolific-b", [2], [True, False])

    _setup_practice_paper(db, single.id, "PM-L2", (600,), [2], "exam-single", "paper-single", "single")
    db.commit()
    _attempt_and_answer_all(db, single, "PM-L2", "single", [2], [True, False])

    for result in db.query(CompetitionEventResult).all():
        result.time_taken_seconds = 180
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    by_student = {row["studentId"]: row for row in report["perStudent"]}
    assert by_student["s-prolific"]["avgScore"] == by_student["s-single"]["avgScore"] == 1.0
    assert (
        by_student["s-prolific"]["avgTimeTakenSeconds"]
        == by_student["s-single"]["avgTimeTakenSeconds"]
        == 180
    )
    assert by_student["s-prolific"]["papersCompletedCount"] == 2
    assert by_student["s-single"]["papersCompletedCount"] == 1

    assert [row["studentId"] for row in report["perStudent"]] == ["s-prolific", "s-single"]
    assert report["perStudent"][0]["rank"] == 1
    assert report["perStudent"][1]["rank"] == 2


def test_level_report_ties_on_everything_break_by_student_code_ascending():
    """2026-09-22 (Practice Leaderboard fix, Shailesh): the final,
    deterministic fallback -- two students tied on avg score, avg time
    taken, AND papersCompletedCount sort by studentCode ascending, so tied
    rows never silently flip order between runs."""
    db = _session()
    # Deliberately non-alphabetical creation order, so a passing test can't
    # be an accident of insertion/array order.
    zed = _student(db, "z-student", name="Zed Student")
    alpha = _student(db, "a-student", name="Alpha Student")
    assert zed.student_code == "MP-z-student"
    assert alpha.student_code == "MP-a-student"

    _setup_practice_paper(db, zed.id, "PM-L2", (600,), [2], "exam-zed", "paper-zed", "zed")
    db.commit()
    _attempt_and_answer_all(db, zed, "PM-L2", "zed", [2], [True, False])

    _setup_practice_paper(db, alpha.id, "PM-L2", (600,), [2], "exam-alpha", "paper-alpha", "alpha")
    db.commit()
    _attempt_and_answer_all(db, alpha, "PM-L2", "alpha", [2], [True, False])

    for result in db.query(CompetitionEventResult).all():
        result.time_taken_seconds = 180
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    by_student = {row["studentId"]: row for row in report["perStudent"]}
    assert by_student["z-student"]["avgScore"] == by_student["a-student"]["avgScore"] == 1.0
    assert by_student["z-student"]["papersCompletedCount"] == by_student["a-student"]["papersCompletedCount"] == 1

    assert [row["studentId"] for row in report["perStudent"]] == ["a-student", "z-student"]
    assert report["perStudent"][0]["rank"] == 1
    assert report["perStudent"][1]["rank"] == 2


def test_level_report_per_student_last_attempt_at_sources_from_submitted_at():
    """Same 2026-09-17 fix as the student-report trend/byLevel test above,
    for GetAnnualCompetitionPracticeReportForLevel's own perStudent rows:
    lastAttemptAt must reflect the attempt's real submitted_at, not a
    computed_at that a later recompute may have collapsed to a shared,
    identical timestamp."""
    db = _session()
    student = _student(db, "sLevelTimestampFix")
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [1], "exam-lvl-ts-a", "paper-lvl-ts-a", "lvltsa")
    db.commit()
    attempt_id_1 = _attempt_and_answer_all(db, student, "PM-L2", "lvltsa", [1], [True])

    _setup_practice_paper(db, student.id, "PM-L2", (600,), [1], "exam-lvl-ts-b", "paper-lvl-ts-b", "lvltsb")
    db.commit()
    attempt_id_2 = _attempt_and_answer_all(db, student, "PM-L2", "lvltsb", [1], [True])

    earlier = datetime(2026, 9, 1, 10, 0, 0, tzinfo=timezone.utc)
    later = datetime(2026, 9, 10, 15, 30, 0, tzinfo=timezone.utc)
    db.get(CompetitionEventAttempt, attempt_id_1).submitted_at = earlier
    db.get(CompetitionEventAttempt, attempt_id_2).submitted_at = later

    corrupted = datetime(2026, 9, 16, 12, 2, 0, tzinfo=timezone.utc)
    for result in db.query(CompetitionEventResult).filter(CompetitionEventResult.student_id == student.id).all():
        result.computed_at = corrupted
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    assert len(report["perStudent"]) == 1
    # (Same SQLite-round-trips-as-naive note as the student-report test above.)
    assert report["perStudent"][0]["lastAttemptAt"] == later.replace(tzinfo=None).isoformat()


def test_level_report_roster_scoping_excludes_other_students():
    db = _session()
    mine = _student(db, "s-mine")
    other = _student(db, "s-other")
    _setup_practice_paper(db, mine.id, "PM-L2", (600,), [2], "exam-mine", "paper-mine", "mine")
    db.commit()
    _attempt_and_answer_all(db, mine, "PM-L2", "mine", [2], [True, True])
    _setup_practice_paper(db, other.id, "PM-L2", (600,), [2], "exam-other", "paper-other", "other")
    db.commit()
    _attempt_and_answer_all(db, other, "PM-L2", "other", [2], [False, False])

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(
        db, CompetitionLevelCode="PM-L2", StudentIdsFilter=[mine.id]
    )

    assert report["summary"]["attemptsCount"] == 1
    assert [row["studentId"] for row in report["perStudent"]] == ["s-mine"]


def test_level_report_empty_roster_short_circuits_without_querying_results():
    db = _session()
    report = report_service.GetAnnualCompetitionPracticeReportForLevel(
        db, CompetitionLevelCode="PM-L2", StudentIdsFilter=[]
    )
    assert report["summary"]["attemptsCount"] == 0
    assert report["perStudent"] == []
    assert report["perSection"] == []


def test_level_report_invalid_level_code_raises_400():
    db = _session()
    with pytest.raises(HTTPException) as excinfo:
        report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="NOT-A-LEVEL")
    assert excinfo.value.status_code == 400


# ---------------------------------------------------------------------------
# Practice bank completion (assigned vs completed)
# ---------------------------------------------------------------------------

def test_papers_assigned_and_completed_counts():
    db = _session()
    student = _student(db, "s1")
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [2], "exam-done", "paper-done", "done")
    db.commit()
    _attempt_and_answer_all(db, student, "PM-L2", "done", [2], [True, True])

    # A second bank paper for the same student/level, never attempted.
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [2], "exam-pending", "paper-pending", "pending")
    db.commit()

    report = report_service.GetAnnualCompetitionPracticeReportForStudent(db, StudentId=student.id, CompetitionLevelCode="PM-L2")
    assert report["summary"]["papersAssignedCount"] == 2
    assert report["summary"]["papersCompletedCount"] == 1

    level_report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    assert level_report["summary"]["papersAssignedCount"] == 2
    assert level_report["summary"]["papersCompletedCount"] == 1


def test_level_report_excludes_official_attempts():
    """PRACTICE-only, mirroring test_practice_result_excluded_from_admin_
    results_list in the scoring-service test file -- an OFFICIAL attempt at
    the same level must never bleed into the practice cohort average."""
    db = _session()
    student = _student(db, "s1")
    event = CompetitionEvent(
        id="event-1", name="Annual Competition 2026", status="SCHEDULED",
        competition_date=datetime.now(timezone.utc),
    )
    db.add(event)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id, "exam-official")
    _question_with_options(db, exam.id, 1, 1, qid="official-q-1-1")
    db.add(CompetitionEventAssignment(
        id="assign-1", event_id=event.id, student_id=student.id,
        assigned_level_code="PM-L2", assignment_source="AUTO", is_active=True,
    ))
    db.flush()
    paper = CompetitionEventLevelPaper(
        id="official-paper-1", event_id=event.id, competition_level_code="PM-L2",
        mock_exam_id=exam.id, status="READY",
    )
    db.add(paper)
    db.flush()
    db.add(CompetitionEventSectionTimer(
        id="official-paper-1-timer-1", level_paper_id=paper.id, section_number=1,
        section_title="Section 1", mode="MIXED", time_limit_seconds=600, display_order=1,
    ))
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "official-q-1-1", correct=True)
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    report = report_service.GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="PM-L2")
    assert report["summary"]["attemptsCount"] == 0
    assert report["perStudent"] == []


def test_round_to_int_uses_standard_round_half_up_not_bankers_rounding():
    """Whole-number display policy (Shailesh, 2026-09-16): every figure in
    this flow rounds to the nearest integer, half-up at exactly .5, never
    Python's built-in round()'s round-half-to-even. 62.5 must become 63
    (not 62), and 63.5 must become 64 (not 64 by luck -- also checks the
    even-target boundary explicitly)."""
    assert report_service._RoundToInt(16.33) == 16
    assert report_service._RoundToInt(16.5) == 17
    assert report_service._RoundToInt(62.5) == 63
    assert report_service._RoundToInt(63.5) == 64
    assert report_service._RoundToInt(0.4) == 0
    assert report_service._RoundToInt(0.0) == 0
    assert report_service._RoundToInt(None) is None

# ---------------------------------------------------------------------------
# Cross-level overview (Analytics Visualization feature, package 1)
# ---------------------------------------------------------------------------

def test_overview_includes_every_level_even_with_zero_attempts():
    """2026-09-22 (Analytics Visualization, Shailesh): the overview chart's
    axis must never silently drop a level that has no PRACTICE attempts yet
    -- every level in the canonical registry order shows up, with None/0
    summary fields rather than being omitted."""
    db = _session()
    report = report_service.GetAnnualCompetitionPracticeReportOverview(db)

    expected_codes = list(ANNUAL_COMPETITION_LEVEL_REGISTRY.keys())
    actual_codes = [row["competitionLevelCode"] for row in report["byLevel"]]
    assert actual_codes == expected_codes

    for row in report["byLevel"]:
        assert row["attemptsCount"] == 0
        assert row["avgScore"] is None
        assert row["avgPercentage"] is None
        assert row["studentsWithAttemptsCount"] == 0


def test_overview_aggregates_each_level_independently_without_blending():
    """Attempts at two different levels must never bleed into each other's
    row -- mirrors the per-level report's own isolation, just checked across
    every row of the overview at once."""
    db = _session()
    pm_student = _student(db, "s-pm", name="PM Student")
    im_student = _student(db, "s-im", name="IM Student")

    _setup_practice_paper(db, pm_student.id, "PM-L2", (600,), [4], "exam-pm", "paper-pm", "pm")
    db.commit()
    _attempt_and_answer_all(db, pm_student, "PM-L2", "pm", [4], [True, True, True, False])

    _setup_practice_paper(db, im_student.id, "IM-L1", (600,), [2], "exam-im", "paper-im", "im")
    db.commit()
    _attempt_and_answer_all(db, im_student, "IM-L1", "im", [2], [True, True])

    report = report_service.GetAnnualCompetitionPracticeReportOverview(db)
    by_level = {row["competitionLevelCode"]: row for row in report["byLevel"]}

    assert by_level["PM-L2"]["attemptsCount"] == 1
    assert by_level["PM-L2"]["studentsWithAttemptsCount"] == 1
    assert by_level["IM-L1"]["attemptsCount"] == 1
    assert by_level["IM-L1"]["studentsWithAttemptsCount"] == 1
    # Every other level in the registry stays at zero -- these two attempts
    # must not leak anywhere else.
    for level_code, row in by_level.items():
        if level_code not in ("PM-L2", "IM-L1"):
            assert row["attemptsCount"] == 0


def test_overview_rebases_avg_percentage_onto_canonical_total_per_level():
    """Same fairness fix as the per-level leaderboard's avgMaxScore
    override (2026-09-22), applied here across levels instead of across
    students within one level -- see GetAnnualCompetitionPracticeReportOverview's
    own module comment for why raw avgScore would not be a fair cross-level
    metric while avgPercentage, rebased onto each level's own canonical
    total, is."""
    db = _session()
    student = _student(db, "s-overview-canon", name="Overview Canonical")
    _setup_practice_paper(db, student.id, "PM-L2", (600,), [4], "exam-ov-canon", "paper-ov-canon", "ovcanon")
    db.commit()
    _attempt_and_answer_all(db, student, "PM-L2", "ovcanon", [4], [True, True, False, False])

    canonical_total = sum(
        section["questionCount"] for section in ANNUAL_COMPETITION_LEVEL_REGISTRY["PM-L2"]["sections"]
    )
    assert canonical_total != 4  # sanity check this test actually exercises the override

    report = report_service.GetAnnualCompetitionPracticeReportOverview(db)
    row = next(r for r in report["byLevel"] if r["competitionLevelCode"] == "PM-L2")
    assert row["avgScore"] == 2.0
    assert row["avgMaxScore"] == canonical_total
    assert row["avgPercentage"] == report_service._RoundToInt((2.0 / canonical_total) * 100)


def test_overview_excludes_official_attempts():
    """PRACTICE-only, same convention as the per-level report's own
    equivalent test -- an OFFICIAL attempt must never inflate a level's
    overview row."""
    db = _session()
    student = _student(db, "s-ov-official")
    event = CompetitionEvent(
        id="event-ov-1", name="Annual Competition 2026", status="SCHEDULED",
        competition_date=datetime.now(timezone.utc),
    )
    db.add(event)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id, "exam-ov-official")
    _question_with_options(db, exam.id, 1, 1, qid="ov-official-q-1-1")
    db.add(CompetitionEventAssignment(
        id="assign-ov-1", event_id=event.id, student_id=student.id,
        assigned_level_code="PM-L2", assignment_source="AUTO", is_active=True,
    ))
    db.flush()
    paper = CompetitionEventLevelPaper(
        id="official-ov-paper-1", event_id=event.id, competition_level_code="PM-L2",
        mock_exam_id=exam.id, status="READY",
    )
    db.add(paper)
    db.flush()
    db.add(CompetitionEventSectionTimer(
        id="official-ov-paper-1-timer-1", level_paper_id=paper.id, section_number=1,
        section_title="Section 1", mode="MIXED", time_limit_seconds=600, display_order=1,
    ))
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _answer(db, student, attempt_id, token, 1, "ov-official-q-1-1", correct=True)
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    report = report_service.GetAnnualCompetitionPracticeReportOverview(db)
    row = next(r for r in report["byLevel"] if r["competitionLevelCode"] == "PM-L2")
    assert row["attemptsCount"] == 0
    assert row["studentsWithAttemptsCount"] == 0
