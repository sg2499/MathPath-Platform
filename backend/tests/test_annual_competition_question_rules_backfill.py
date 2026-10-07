"""Backfill for the Annual Competition question rules of 2026-10-07, and
IM-3's removed Squares section (Shailesh):

  "once done we will need to backfill the assigned but pending practice
   papers and after it is applied then official and practice papers
   generated after that will obviously follow the new rules"

  "lets remove the scores obtained from the section which was removed in
   this pass so the total score will anyways be out of 300 ... lets
   recompute the stats there out of 300 only so everything is consistent
   ... for the completed attempt views across admin, teacher and students,
   lets update the answer sheet and scorecard tabs with 4 section sum info
   only and remove the things which is no longer there."

Every paper and every attempt here is made by the real services: papers by
the practice-bank generator, attempts by the student start / save / submit
flow, results by the one scoring function.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.models import (
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
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
from app.services import annual_competition_paper_generation_service as generation
from app.services import annual_competition_paper_registry as registry
from app.services import annual_competition_scoring_service as scoring
from app.services import annual_competition_studio_service as studio
from app.services.annual_competition_paper_generation_service import (
    ANNUAL_COMPETITION_QUESTION_RULES_VERSION,
    AnnualPaperQuestionRulesVersion,
)
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY
from app.services.annual_competition_practice_report_service import GetAnnualCompetitionPracticeReportForLevel
from app.services.annual_competition_retired_sections import (
    LevelCodesWithRetiredSections,
    RetiredSectionNumbersForLevelPaper,
)

from test_annual_competition_question_rules import check_level  # the whole-paper rule checker

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_annual_competition_question_rules.py"
MODULE_OF = {"YLM": "YLM", "PM": "PM", "IM": "IM", "MM": "MM"}


@pytest.fixture()
def backfill():
    spec = importlib.util.spec_from_file_location("backfill_annual_competition_question_rules", _SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)()


def _admin(db):
    admin = User(full_name="Admin", email="admin@test.local", password_hash="x", role="ADMIN")
    db.add(admin)
    db.flush()
    return admin


def _student(db, code):
    user = User(full_name=f"Student {code}", email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.flush()
    student = Student(user_id=user.id, student_code=code)
    db.add(student)
    db.flush()
    return student


def _level(db, level_code):
    module_code = level_code.split("-")[0]
    module = db.query(Module).filter(Module.module_code == module_code).first()
    if not module:
        module = Module(module_code=module_code, module_name=module_code, is_active=True)
        db.add(module)
        db.flush()
    level = db.query(Level).filter(Level.level_code == level_code).first()
    if not level:
        level = Level(module_id=module.id, level_code=level_code, level_name=level_code, is_active=True)
        db.add(level)
        db.flush()
    return level


def _im3_as_it_was_before_squares_was_removed(patch):
    """IM-3 as it stood until 2026-10-07: five sections, Squares last, 2D x
    2D still in the multiplication section."""
    current = ANNUAL_COMPETITION_LEVEL_REGISTRY["IM-L3"]
    old_sections = list(current["sections"]) + [
        {"key": "SEC5", "number": 5, "title": "Squares (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
    ]
    old_pools = {
        **current["sectionConceptPools"],
        "SEC3": registry._IM_L3_MULTIPLICATION_POOL,
        "SEC5": registry._IM_L3_SQUARES_POOL,
    }
    patch.setitem(ANNUAL_COMPETITION_LEVEL_REGISTRY, "IM-L3", {"sections": old_sections, "sectionConceptPools": old_pools})
    patch.setitem(
        studio.DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE, "IM-L3",
        [(int(s["number"]), str(s["title"]), str(s["mode"]), int(s["timeLimitSeconds"])) for s in old_sections],
    )


def _forget_rules_version(db, paper):
    """Make a stored paper look like one generated before the rules were
    versioned -- which is what every paper generated before 2026-10-07 is."""
    exam = db.get(CompetitionMockExam, paper.mock_exam_id)
    config = json.loads(exam.generation_config_json)
    config.pop("questionRulesVersion", None)
    exam.generation_config_json = json.dumps(config)
    db.commit()


def _practice_papers(db, admin, student, level_code, quantity=1, *, old=True, patch=None, assigned_at=None):
    level = _level(db, level_code if level_code not in ("MM-L2", "YLM-L0") else {"MM-L2": "MM-L1", "YLM-L0": "YLM-L1"}[level_code])
    db.commit()
    if old and level_code == "IM-L3":
        with patch.context() as inner:
            _im3_as_it_was_before_squares_was_removed(inner)
            papers, failure = studio._GeneratePracticePapersForOneStudent(
                db, LevelRecord=level, CompetitionLevelCode=level_code, StudentRecord=student, Quantity=quantity,
                AssignedBy=admin, NowUtc=assigned_at or datetime.now(timezone.utc),
            )
    else:
        papers, failure = studio._GeneratePracticePapersForOneStudent(
            db, LevelRecord=level, CompetitionLevelCode=level_code, StudentRecord=student, Quantity=quantity,
            AssignedBy=admin, NowUtc=assigned_at or datetime.now(timezone.utc),
        )
    assert failure is None, failure
    if old:
        for paper in papers:
            _forget_rules_version(db, paper)
    return papers


def _snapshot(db, paper):
    rows = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == paper.mock_exam_id)
        .order_by(CompetitionMockQuestion.question_number)
        .all()
    )
    return [(r.id, r.question_number, r.section_number, r.section_title, r.operands_json, r.operators_json, r.correct_answer) for r in rows]


def _timers(db, paper):
    rows = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == paper.id)
        .order_by(CompetitionEventSectionTimer.section_number)
        .all()
    )
    return [(r.id, r.section_number, r.section_title, r.mode, r.time_limit_seconds) for r in rows]


def _as_generated_questions(db, paper):
    """A stored paper in the shape check_level reads (the generator's own)."""
    rows = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == paper.mock_exam_id)
        .order_by(CompetitionMockQuestion.question_number)
        .all()
    )
    questions = []
    for row in rows:
        options = (
            db.query(CompetitionMockQuestionOption)
            .filter(CompetitionMockQuestionOption.mock_question_id == row.id)
            .order_by(CompetitionMockQuestionOption.display_order)
            .all()
        )
        metadata = json.loads(row.metadata_json or "{}")
        answer = row.correct_answer
        try:
            answer = int(answer) if "." not in str(answer) else answer
        except ValueError:
            pass
        questions.append({
            "display_type": row.display_type, "question_text": row.question_text,
            "operands": json.loads(row.operands_json), "operators": json.loads(row.operators_json),
            "correct_answer": answer, "metadata": metadata,
            "options": [{"value": o.option_value, "is_correct": o.is_correct} for o in options],
            "_annual_section_number": row.section_number, "_annual_section_title": row.section_title,
        })
    return questions


def _sit_whole_paper(db, student, level_code, correct_per_section, *, seconds_used_per_section=60):
    """A student starts the next practice paper of the level, answers the
    first N questions of each section correctly, and submits every section
    in turn -- through the real start / save / submit flow."""
    started = attempt_engine.StartAnnualCompetitionPracticeAttempt(db, student, level_code)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    attempt = db.get(CompetitionEventAttempt, attempt_id)
    paper = db.get(CompetitionEventLevelPaper, attempt.level_paper_id)
    for section_number in [s["sectionNumber"] for s in started["sections"]]:
        questions = (
            db.query(CompetitionMockQuestion)
            .filter(CompetitionMockQuestion.mock_exam_id == paper.mock_exam_id, CompetitionMockQuestion.section_number == section_number)
            .order_by(CompetitionMockQuestion.question_number)
            .all()
        )
        for question in questions[: correct_per_section.get(section_number, 0)]:
            attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, section_number, question.id, question.correct_answer)
        # One wrong answer in every section, so wrong counts are exercised too.
        attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, section_number, questions[-1].id, "999999999")
        state = attempt_engine._ActiveSection(db, attempt)
        state.remaining_seconds_at_last_heartbeat = state.time_limit_seconds - seconds_used_per_section
        db.commit()
        attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, section_number)
        db.refresh(attempt)
    return attempt_id


def _old_im3_attempt_scored_the_old_way(db, admin, student, patch, correct_per_section):
    """An IM-3 practice paper from before 2026-10-07, completed and scored
    the way it was scored then: all five sections, out of 350."""
    _practice_papers(db, admin, student, "IM-L3", patch=patch)
    with patch.context() as inner:
        inner.setattr(scoring, "RetiredSectionNumbersForLevelPaper", lambda _db, _paper: set())
        attempt_id = _sit_whole_paper(db, student, "IM-L3", correct_per_section)
    db.commit()
    return attempt_id


# ---------------------------------------------------------------------------
# The rules version stamp
# ---------------------------------------------------------------------------
def test_every_newly_generated_paper_carries_todays_rules_version():
    db = _session()
    admin, student = _admin(db), _student(db, "MP-V-1")
    paper = _practice_papers(db, admin, student, "PM-L3", old=False)[0]
    exam = db.get(CompetitionMockExam, paper.mock_exam_id)
    assert AnnualPaperQuestionRulesVersion(exam) == ANNUAL_COMPETITION_QUESTION_RULES_VERSION == "2026-10-07"
    _forget_rules_version(db, paper)
    assert AnnualPaperQuestionRulesVersion(db.get(CompetitionMockExam, paper.mock_exam_id)) is None
    assert AnnualPaperQuestionRulesVersion(None) is None


# ---------------------------------------------------------------------------
# Part 1: unopened practice papers
# ---------------------------------------------------------------------------
def test_an_unopened_old_im3_paper_becomes_a_four_section_paper_in_place(backfill, monkeypatch):
    db = _session()
    admin, student = _admin(db), _student(db, "MP-B-1")
    assigned_at = datetime.now(timezone.utc) - timedelta(days=3)
    paper = _practice_papers(db, admin, student, "IM-L3", patch=monkeypatch, assigned_at=assigned_at)[0]
    before, timers_before = _snapshot(db, paper), _timers(db, paper)
    exam = db.get(CompetitionMockExam, paper.mock_exam_id)
    identity = (paper.id, paper.mock_exam_id, paper.assigned_student_id, paper.assigned_at, exam.mock_code, exam.title)
    assert len(before) == 350 and len(timers_before) == 5 and exam.total_questions == 350 and exam.duration_seconds == 1500
    assert {r[3] for r in before if r[2] == 5} == {"Squares (Visual)"}

    dry = backfill.run_practice_phase(db, apply=False, level_codes=backfill.target_level_codes())
    assert dry["rebuilt"] == 1 and dry["failed"] == 0
    assert _snapshot(db, paper) == before and _timers(db, paper) == timers_before  # a dry run writes nothing

    applied = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert applied["rebuilt"] == 1 and applied["failed"] == 0 and applied["opened"] == 0
    db.expire_all()
    paper = db.get(CompetitionEventLevelPaper, identity[0])
    exam = db.get(CompetitionMockExam, paper.mock_exam_id)
    after, timers_after = _snapshot(db, paper), _timers(db, paper)

    # The same paper...
    assert (paper.id, paper.mock_exam_id, paper.assigned_student_id, paper.assigned_at, exam.mock_code, exam.title) == identity
    assert paper.status == "READY" and paper.consumed_at is None
    # ...with a whole new, four-section content.
    assert [r[1] for r in after] == list(range(1, 301))
    assert sorted({r[2] for r in after}) == [1, 2, 3, 4]
    assert not ({r[0] for r in after} & {r[0] for r in before})
    assert [(t[1], t[2], t[4]) for t in timers_after] == [
        (1, "Decimal Add/Less (Abacus)", 300), (2, "Decimal Add/Less (Visual)", 300),
        (3, "Multiplication (Visual)", 300), (4, "Division (Visual)", 300),
    ]
    # The exam record describes what it now holds.
    assert (exam.total_questions, exam.total_marks, exam.duration_seconds) == (300, 300, 1200)
    assert exam.instructions.startswith("IM-L3 Annual Competition — 4 section(s), 300 questions, 20 minutes total.")
    assert [s["number"] for s in json.loads(exam.syllabus_coverage_json)["sections"]] == [1, 2, 3, 4]
    assert AnnualPaperQuestionRulesVersion(exam) == ANNUAL_COMPETITION_QUESTION_RULES_VERSION
    # No option left behind, every new question has its own.
    live_ids = {r[0] for r in after}
    option_owners = {row[0] for row in db.query(CompetitionMockQuestionOption.mock_question_id).all()}
    assert option_owners == live_ids
    # And the new content meets every 2026-10-07 rule for the level.
    assert not check_level("IM-L3", _as_generated_questions(db, paper))

    # What the student is told, and what the student gets.
    instructions = attempt_engine.GetAnnualCompetitionPracticeInstructions(db, student, "IM-L3")
    assert instructions["totalDurationSeconds"] == 1200
    assert [(s["sectionNumber"], s["questionCount"]) for s in instructions["sections"]] == [(1, 50), (2, 50), (3, 100), (4, 100)]
    started = attempt_engine.StartAnnualCompetitionPracticeAttempt(db, student, "IM-L3")
    assert [s["sectionNumber"] for s in started["sections"]] == [1, 2, 3, 4]

    # Running it again finds nothing left to do (the paper is now opened, too).
    again = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert again["rebuilt"] == 0


@pytest.mark.parametrize("level_code", ["YLM-L0", "YLM-L1", "PM-L1", "PM-L2", "PM-L3", "PM-L4", "IM-L1", "IM-L2", "IM-L4", "MM-L1", "MM-L2"])
def test_an_unopened_old_paper_of_every_other_level_is_rebuilt_to_the_new_rules(backfill, level_code):
    db = _session()
    admin, student = _admin(db), _student(db, "MP-B-2")
    paper = _practice_papers(db, admin, student, level_code)[0]
    before, timers_before = _snapshot(db, paper), _timers(db, paper)

    applied = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert applied["rebuilt"] == 1 and applied["failed"] == 0
    db.expire_all()
    after = _snapshot(db, paper)
    config = ANNUAL_COMPETITION_LEVEL_REGISTRY[level_code]
    assert len(after) == sum(s["questionCount"] for s in config["sections"])
    assert [r[1] for r in after] == list(range(1, len(after) + 1))
    assert not ({r[0] for r in after} & {r[0] for r in before})
    assert _timers(db, paper) == timers_before  # sections unchanged: the timers are the very same rows
    assert not check_level(level_code, _as_generated_questions(db, paper))
    assert AnnualPaperQuestionRulesVersion(db.get(CompetitionMockExam, paper.mock_exam_id)) == ANNUAL_COMPETITION_QUESTION_RULES_VERSION

    again = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert again["rebuilt"] == 0 and again["current"] == 1
    assert _snapshot(db, paper) == after


def test_papers_a_student_has_opened_or_finished_and_current_papers_are_never_touched(backfill, monkeypatch):
    db = _session()
    admin = _admin(db)
    opened_student, finished_student, current_student, pending_student = (_student(db, f"MP-B-3{i}") for i in range(4))
    now = datetime.now(timezone.utc)
    opened = _practice_papers(db, admin, opened_student, "PM-L3", assigned_at=now - timedelta(days=2))[0]
    finished = _practice_papers(db, admin, finished_student, "PM-L3", assigned_at=now - timedelta(days=2))[0]
    current = _practice_papers(db, admin, current_student, "PM-L3", old=False)[0]
    pending = _practice_papers(db, admin, pending_student, "PM-L3")[0]

    attempt_engine.StartAnnualCompetitionPracticeAttempt(db, opened_student, "PM-L3")  # opened, nothing answered
    _sit_whole_paper(db, finished_student, "PM-L3", {1: 3, 2: 3, 3: 3})                # finished
    db.commit()
    assert db.get(CompetitionEventLevelPaper, finished.id).consumed_at is not None
    snapshots = {p.id: _snapshot(db, p) for p in (opened, finished, current, pending)}

    applied = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    db.expire_all()
    assert (applied["rebuilt"], applied["opened"], applied["current"], applied["failed"]) == (1, 1, 1, 0)
    for paper in (opened, finished, current):
        assert _snapshot(db, paper) == snapshots[paper.id]
    assert _snapshot(db, pending) != snapshots[pending.id]
    # The finished student's stored answers still point at their own questions.
    answered = {row[0] for row in db.query(CompetitionEventAttemptAnswer.mock_question_id).all()}
    assert answered <= {r[0] for r in snapshots[finished.id]}


def test_official_papers_are_listed_and_never_rebuilt(backfill, capsys):
    db = _session()
    admin, student = _admin(db), _student(db, "MP-B-4")
    paper = _practice_papers(db, admin, student, "PM-L4")[0]
    paper.paper_kind = "OFFICIAL"
    paper.assigned_student_id = None
    db.commit()
    before = _snapshot(db, paper)

    official = backfill.report_official_papers(db, backfill.target_level_codes())
    assert official == {"listed": 1, "old": 1, "old_locked": 0}
    assert "Regenerate Official Paper" in capsys.readouterr().out
    applied = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert applied["checked"] == 0 and applied["rebuilt"] == 0
    assert _snapshot(db, paper) == before
    assert studio.RebuildUnopenedPracticePaperToCurrentRules(db, LevelPaperId=paper.id, Apply=True)["status"] == "NOT_PRACTICE"
    db.rollback()
    assert _snapshot(db, paper) == before


def test_one_failing_paper_is_left_exactly_as_it_was_and_the_rest_carry_on(backfill, monkeypatch):
    db = _session()
    admin = _admin(db)
    first_student, second_student = _student(db, "MP-B-51"), _student(db, "MP-B-52")
    first = _practice_papers(db, admin, first_student, "PM-L1", assigned_at=datetime.now(timezone.utc) - timedelta(days=1))[0]
    second = _practice_papers(db, admin, second_student, "PM-L1")[0]
    first_before, first_timers = _snapshot(db, first), _timers(db, first)
    second_before = _snapshot(db, second)

    real = generation._CollectAnnualCompetitionQuestions
    calls = {"count": 0}

    def fail_first(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("generation could not finish")
        return real(*args, **kwargs)

    monkeypatch.setattr(generation, "_CollectAnnualCompetitionQuestions", fail_first)
    applied = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    db.expire_all()
    assert (applied["rebuilt"], applied["failed"]) == (1, 1)
    assert _snapshot(db, first) == first_before and _timers(db, first) == first_timers
    assert AnnualPaperQuestionRulesVersion(db.get(CompetitionMockExam, first.mock_exam_id)) is None
    assert _snapshot(db, second) != second_before

    # The next run picks the failed paper up.
    again = backfill.run_practice_phase(db, apply=True, level_codes=backfill.target_level_codes())
    assert (again["rebuilt"], again["current"], again["failed"]) == (1, 1, 0)


def test_rebuild_statuses_for_things_that_are_not_rebuildable(monkeypatch):
    db = _session()
    admin, student = _admin(db), _student(db, "MP-B-6")
    assert studio.RebuildUnopenedPracticePaperToCurrentRules(db, LevelPaperId="no-such-paper", Apply=True)["status"] == "NOT_FOUND"
    paper = _practice_papers(db, admin, student, "PM-L2")[0]
    assert studio.RebuildUnopenedPracticePaperToCurrentRules(db, LevelPaperId=paper.id, Apply=False)["status"] == "WOULD_REBUILD"
    paper.consumed_at = datetime.now(timezone.utc)
    db.commit()
    assert studio.RebuildUnopenedPracticePaperToCurrentRules(db, LevelPaperId=paper.id, Apply=True)["status"] == "OPENED"


# ---------------------------------------------------------------------------
# Part 2: IM-3's removed Squares section
# ---------------------------------------------------------------------------
CORRECT = {1: 10, 2: 8, 3: 20, 4: 15, 5: 30}  # 53 on sections 1-4, 30 more on Squares


def test_which_sections_count_as_retired(monkeypatch):
    assert LevelCodesWithRetiredSections() == ["IM-L3"]
    db = _session()
    admin, old_student, new_student, im4_student = _admin(db), _student(db, "MP-R-01"), _student(db, "MP-R-02"), _student(db, "MP-R-03")
    old = _practice_papers(db, admin, old_student, "IM-L3", patch=monkeypatch)[0]
    new = _practice_papers(db, admin, new_student, "IM-L3", old=False)[0]
    im4 = _practice_papers(db, admin, im4_student, "IM-L4", old=False)[0]
    assert RetiredSectionNumbersForLevelPaper(db, old) == {5}
    assert RetiredSectionNumbersForLevelPaper(db, new) == set()   # a current IM-3 paper has no fifth section
    assert RetiredSectionNumbersForLevelPaper(db, im4) == set()   # IM-4 keeps its own Squares section
    assert RetiredSectionNumbersForLevelPaper(db, None) == set()

    # A NEW fifth section under another name, should IM-3 ever get one, is an ordinary section.
    db.query(CompetitionEventSectionTimer).filter_by(level_paper_id=old.id, section_number=5).update({"section_title": "Cubes (Visual)"})
    db.query(CompetitionMockQuestion).filter_by(mock_exam_id=old.mock_exam_id, section_number=5).update({"section_title": "Cubes (Visual)"})
    db.commit()
    assert RetiredSectionNumbersForLevelPaper(db, old) == set()


def test_old_im3_result_is_recomputed_on_four_sections_everywhere(backfill, monkeypatch):
    db = _session()
    admin, student = _admin(db), _student(db, "MP-R-1")
    attempt_id = _old_im3_attempt_scored_the_old_way(db, admin, student, monkeypatch, CORRECT)
    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    # As it was stored before this change: five sections, out of 350.
    assert (result.score, result.max_score, result.correct_count, result.wrong_count, result.unanswered_count) == (83, 350, 83, 5, 262)
    assert result.time_taken_seconds == 5 * 60
    assert [e["sectionNumber"] for e in json.loads(result.per_section_score_json)] == [1, 2, 3, 4, 5]
    answers_before = db.query(CompetitionEventAttemptAnswer).filter_by(attempt_id=attempt_id).count()
    questions_before = db.query(CompetitionMockQuestion).count()

    dry = backfill.run_results_phase(db, apply=False)
    assert (dry["checked"], dry["recomputed"], dry["failed"]) == (1, 1, 0)
    db.expire_all()
    assert db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one().max_score == 350  # a dry run writes nothing

    applied = backfill.run_results_phase(db, apply=True)
    assert (applied["recomputed"], applied["failed"]) == (1, 0)
    db.expire_all()
    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert (result.score, result.max_score, result.correct_count, result.wrong_count, result.unanswered_count) == (53, 300, 53, 4, 243)
    assert result.percentage == round(53 / 300 * 100, 2)
    assert result.accuracy_percentage == round(53 / 57 * 100, 2)
    assert result.time_taken_seconds == 4 * 60
    per_section = json.loads(result.per_section_score_json)
    assert [(e["sectionNumber"], e["correctCount"], e["maxScore"]) for e in per_section] == [(1, 10, 50), (2, 8, 50), (3, 20, 100), (4, 15, 100)]
    assert [e["sectionNumber"] for e in json.loads(result.per_section_time_json)] == [1, 2, 3, 4]
    assert result.is_released and not result.is_voided
    assert db.get(CompetitionEventAttempt, attempt_id).status == "FINALIZED"

    # Nothing was deleted: the Squares questions and the student's answers are still stored.
    assert db.query(CompetitionEventAttemptAnswer).filter_by(attempt_id=attempt_id).count() == answers_before
    assert db.query(CompetitionMockQuestion).count() == questions_before

    # Answer Sheet and Scorecard, for admin, teacher and student: four sections, no Squares.
    reviews = [
        attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=attempt_id),
        attempt_engine.GetCompetitionEventAttemptReviewForStudent(db, student, attempt_id),
        attempt_engine.GetCompetitionEventAttemptReviewForTeacher(db, attempt_id, StudentIdsFilter=[student.id]),
    ]
    for review in reviews:
        sections = review["sections"]
        assert [s["sectionNumber"] for s in sections] == [1, 2, 3, 4]
        assert "Squares (Visual)" not in [s.get("sectionTitle") for s in sections]
        assert sum(len(s["questions"]) for s in sections) == 300
        assert not any("²" in json.dumps(q, ensure_ascii=False) for s in sections for q in s["questions"])
        assert sum(1 for s in sections for q in s["questions"] if q.get("isCorrect")) == 53
    for review in reviews:
        assert (review["result"]["score"], review["result"]["maxScore"]) == (53, 300)

    # The student's own result and list of attempts.
    own = scoring.GetCompetitionEventResultForStudent(db, student, attempt_id)["result"]
    assert (own["score"], own["maxScore"]) == (53, 300)
    listed = attempt_engine.ListMyAnnualCompetitionPracticeAttempts(db, student, "IM-L3")
    assert "350" not in json.dumps(listed)

    # The practice leaderboard for the level: everything out of 300.
    report = GetAnnualCompetitionPracticeReportForLevel(db, CompetitionLevelCode="IM-L3")
    row = next(r for r in report["perStudent"] if r["studentId"] == student.id)
    assert (row["highestScore"], row["highestMaxScore"], row["avgScore"], row["avgMaxScore"]) == (53, 300, 53, 300)
    assert [s["sectionNumber"] for s in report["perSection"]] == [1, 2, 3, 4]
    assert "350" not in json.dumps(report) and "Squares" not in json.dumps(report)

    # Running it again finds nothing left to do.
    again = backfill.run_results_phase(db, apply=True)
    assert (again["checked"], again["recomputed"], again["fine"]) == (1, 0, 1)


def test_a_current_im3_attempt_and_other_levels_are_left_alone(backfill, monkeypatch):
    db = _session()
    admin, im3_student, im4_student = _admin(db), _student(db, "MP-R-21"), _student(db, "MP-R-22")
    _practice_papers(db, admin, im3_student, "IM-L3", old=False)
    _practice_papers(db, admin, im4_student, "IM-L4", old=False)
    im3_attempt = _sit_whole_paper(db, im3_student, "IM-L3", {1: 5, 2: 5, 3: 5, 4: 5})
    im4_attempt = _sit_whole_paper(db, im4_student, "IM-L4", {1: 5, 2: 5, 3: 5, 4: 5, 5: 7})
    db.commit()
    stored = {
        r.attempt_id: (r.score, r.max_score, r.per_section_score_json, r.time_taken_seconds)
        for r in db.query(CompetitionEventResult).all()
    }
    assert stored[im3_attempt][:2] == (20, 300)
    assert stored[im4_attempt][:2] == (27, 350)  # IM-4's Squares still counts

    applied = backfill.run_results_phase(db, apply=True)
    assert (applied["checked"], applied["recomputed"], applied["fine"]) == (1, 0, 1)  # only IM-3 results are even looked at
    db.expire_all()
    assert {
        r.attempt_id: (r.score, r.max_score, r.per_section_score_json, r.time_taken_seconds)
        for r in db.query(CompetitionEventResult).all()
    } == stored
    review = attempt_engine.GetCompetitionEventAttemptReviewForAdmin(db, AttemptId=im4_attempt)
    assert [s["sectionNumber"] for s in review["sections"]] == [1, 2, 3, 4, 5]


def test_a_student_finishing_an_old_five_section_paper_after_the_change_is_scored_on_four(monkeypatch):
    """The live flow is untouched -- all five sections are sat -- but the
    result that is stored, and the review, are four sections out of 300."""
    db = _session()
    admin, student = _admin(db), _student(db, "MP-R-3")
    _practice_papers(db, admin, student, "IM-L3", patch=monkeypatch)
    attempt_id = _sit_whole_paper(db, student, "IM-L3", CORRECT)
    db.commit()
    result = db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one()
    assert (result.score, result.max_score, result.time_taken_seconds) == (53, 300, 240)
    assert scoring.RetiredSectionRecomputeFor(db, result) is None
    assert db.get(CompetitionEventAttempt, attempt_id).status == "FINALIZED"
    review = attempt_engine.GetCompetitionEventAttemptReviewForStudent(db, student, attempt_id)
    assert [s["sectionNumber"] for s in review["sections"]] == [1, 2, 3, 4]


def test_whole_script_dry_run_then_apply_then_nothing_left(backfill, monkeypatch, capsys):
    db = _session()
    admin = _admin(db)
    done_student, pending_student = _student(db, "MP-S-1"), _student(db, "MP-S-2")
    attempt_id = _old_im3_attempt_scored_the_old_way(db, admin, done_student, monkeypatch, CORRECT)
    pending = _practice_papers(db, admin, pending_student, "IM-L3", patch=monkeypatch)[0]
    monkeypatch.setattr(backfill, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    monkeypatch.setattr(sys, "argv", ["backfill", "--dry-run"])
    backfill.main()
    out = capsys.readouterr().out
    assert "DRY RUN (no changes will be written)" in out and "WOULD REBUILD -- layout changes" in out
    assert "5 sections, 350 questions -> 4 sections, 300 questions" in out
    assert "WOULD RECOMPUTE" in out and "83/350 -> 53/300" in out
    db.expire_all()
    assert len(_snapshot(db, pending)) == 350
    assert db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one().max_score == 350

    monkeypatch.setattr(sys, "argv", ["backfill", "--apply"])
    backfill.main()
    out = capsys.readouterr().out
    assert "PRACTICE papers rebuilt: 1" in out and "RESULTS recomputed: 1" in out
    db.expire_all()
    assert len(_snapshot(db, pending)) == 300
    assert db.query(CompetitionEventResult).filter_by(attempt_id=attempt_id).one().max_score == 300

    backfill.main()
    out = capsys.readouterr().out
    assert "PRACTICE papers rebuilt: 0" in out and "RESULTS recomputed: 0" in out
