"""Regression coverage for the 2026-10-06 Annual Competition multiplication /
division rule (Shailesh): "we need to remove sums like 23 x 1, 2 x 1, 23 x 10,
23 x 100 and so on these make it very easy for the students to just type the
answer without even solving it ... same goes for division ... max one or two
questions like this is okay", then "at most 2 is okay but never back to back",
and for papers already assigned: "regeneration is only required for division
and multiplication rest is fine ... all pending papers only."

Three things are locked in here, all against the real code paths:
  1. the classification itself (what is never allowed, what counts as a
     round-number sum, what is left alone);
  2. every paper the generator now produces, for every level that has a
     multiplication or division section, meets the rule and still has its
     exact question counts;
  3. the backfill (scripts/backfill_annual_competition_multiply_divide_rule.py
     through RebuildAnnualCompetitionMultiplyDivideSections) rebuilds only the
     offending multiplication / division sections of practice papers nobody
     has opened, and leaves every other question row, every opened or
     completed paper and every official paper exactly as it was.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.models import (
    CompetitionEventAttempt,
    CompetitionEventLevelPaper,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_paper_generation_service as generation
from app.services.annual_competition_paper_generation_service import (
    ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX,
    AnnualMultiplyDivideRuleFaults,
    ClassifyAnnualMultiplyDivideSum,
    GenerateAnnualCompetitionLevelPaper,
    IsAnnualMultiplyDivideSection,
    RebuildAnnualCompetitionMultiplyDivideSections,
    _CollectAnnualCompetitionQuestions,
)
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_annual_competition_multiply_divide_rule.py"
TIMES, DIVIDE = "×", "÷"
LEVELS_WITH_MULTIPLY_OR_DIVIDE = ["PM-L3", "PM-L4", "IM-L1", "IM-L2", "IM-L3", "IM-L4", "MM-L1", "MM-L2"]


# ---------------------------------------------------------------------------
# 1. Classification
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "operands, operator",
    [
        ([23, 1], TIMES), ([2, 1], TIMES), ([1, 47], TIMES),            # a factor of 1
        ([23, 10], TIMES), ([23, 100], TIMES), ([1000, 7], TIMES),      # a power of ten
        (["0.1", 46], TIMES), ([46, "0.01"], TIMES),
        ([23, 0], TIMES),
        ([48, 1], DIVIDE), ([480, 10], DIVIDE), ([4800, 100], DIVIDE),  # divisor 1 or a power of ten
        ([57, 57], DIVIDE),                                             # a number by itself
        ([540, 54], DIVIDE), ([800, 8], DIVIDE), ([8100, 81], DIVIDE),  # quotient 10 / 100
        ([200, 2], DIVIDE),
    ],
)
def test_sums_that_need_no_working_are_never_allowed(operands, operator):
    assert ClassifyAnnualMultiplyDivideSum(operands, ["", operator]) == "NEVER"


@pytest.mark.parametrize(
    "operands, operator",
    [
        ([30, 4], TIMES), ([200, 3], TIMES), ([400, 3], TIMES),         # one table fact plus zeros
        ([23, 20], TIMES), ([345, 200], TIMES), ([70, 86], TIMES),      # a round multiplier
        ([300, 5], DIVIDE), ([350, 5], DIVIDE), ([4200, 6], DIVIDE), ([900, 6], DIVIDE),
        ([450, 90], DIVIDE),
        ([4800, 20], DIVIDE),                                           # the zeros cancel
    ],
)
def test_round_number_sums_are_classed_as_round(operands, operator):
    assert ClassifyAnnualMultiplyDivideSum(operands, ["", operator]) == "ROUND"


@pytest.mark.parametrize(
    "operands, operators",
    [
        ([23, 2], ["", TIMES]), ([44, 9], ["", TIMES]),                 # the normal 2D x 1D sum
        ([930, 64], ["", TIMES]), ([689, 720], ["", TIMES]),            # merely ends in zero
        (["0.044", 94], ["", TIMES]), (["8.4", "0.061"], ["", TIMES]),
        ([9440, 8], ["", DIVIDE]), ([819, 91], ["", DIVIDE]),           # real working / estimation
        ([346, 6], ["", DIVIDE]),                                       # not exact (estimation concept)
        (["37.5", 15], ["", DIVIDE]), ([720, 24], ["", DIVIDE]),
        # other shapes are never classed at all
        ([36, -20, 11, -15], ["+", "-", "+", "-"]),
        ([330, 50], ["", "×%"]),
        (["(37)²"], [""]),
        (["∛1000"], [""]),
    ],
)
def test_everything_else_is_left_alone(operands, operators):
    assert ClassifyAnnualMultiplyDivideSum(operands, operators) is None


def test_fault_count_covers_never_too_many_round_and_back_to_back():
    ok = ([23, 4], ["", TIMES])
    never = ([23, 1], ["", TIMES])
    round_sum = ([30, 4], ["", TIMES])

    assert AnnualMultiplyDivideRuleFaults([ok, round_sum, ok, round_sum, ok])["faults"] == 0
    assert AnnualMultiplyDivideRuleFaults([ok, never, ok])["faults"] == 1
    assert AnnualMultiplyDivideRuleFaults([round_sum, ok, round_sum, ok, round_sum])["faults"] == 1  # three is one too many
    back_to_back = AnnualMultiplyDivideRuleFaults([ok, round_sum, round_sum, ok])
    assert back_to_back["round"] == 2 and back_to_back["adjacent"] == 1 and back_to_back["faults"] == 1
    assert ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX == 2


def test_multiply_divide_sections_are_found_from_the_registry_tags():
    found = {}
    for level_code, config in ANNUAL_COMPETITION_LEVEL_REGISTRY.items():
        titles = [
            section["title"] for section in config["sections"]
            if IsAnnualMultiplyDivideSection(config["sectionConceptPools"].get(section["key"]) or [])
        ]
        if titles:
            found[level_code] = titles
    assert sorted(found) == sorted(LEVELS_WITH_MULTIPLY_OR_DIVIDE)
    assert found["PM-L3"] == ["Multiplication (Abacus)"]
    for level_code in LEVELS_WITH_MULTIPLY_OR_DIVIDE[1:]:
        assert found[level_code] == ["Multiplication (Visual)", "Division (Visual)"]


# ---------------------------------------------------------------------------
# 2. Generation
# ---------------------------------------------------------------------------
def _multiply_divide_sections(level_code):
    config = ANNUAL_COMPETITION_LEVEL_REGISTRY[level_code]
    pools = config["sectionConceptPools"]
    return [s for s in config["sections"] if IsAnnualMultiplyDivideSection(pools.get(s["key"]) or [])], pools


@pytest.mark.parametrize("level_code", LEVELS_WITH_MULTIPLY_OR_DIVIDE)
def test_every_generated_section_meets_the_rule_and_keeps_its_count(level_code):
    sections, pools = _multiply_divide_sections(level_code)
    for paper_index in range(12):
        questions = _CollectAnnualCompetitionQuestions(level_code, sections, pools, f"rule-test-{paper_index}")
        for section in sections:
            rows = [q for q in questions if q["_annual_section_number"] == section["number"]]
            assert len(rows) == section["questionCount"]
            sums = [(q["operands"], q["operators"]) for q in rows]
            assert len({json.dumps(s, default=str) for s in sums}) == len(sums), "no repeated sum inside a section"
            faults = AnnualMultiplyDivideRuleFaults(sums)
            assert faults["never"] == 0, f"{level_code} {section['title']}: a no-working sum got through"
            assert faults["round"] <= ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX
            assert faults["adjacent"] == 0, "round-number sums must never be back to back"


def test_pm_l3_no_longer_carries_its_ten_times_one_sums():
    sections, pools = _multiply_divide_sections("PM-L3")
    questions = _CollectAnnualCompetitionQuestions("PM-L3", sections, pools, "pm-l3-times-one")
    assert len(questions) == 100
    assert not [q for q in questions if 1 in (q["operands"][0], q["operands"][1])]


def test_without_the_rule_the_old_content_really_did_break_it(monkeypatch):
    """Guards the tests above against passing for the wrong reason: with the
    rule switched off, the same generator does produce the ten x 1 sums."""
    monkeypatch.setattr(generation, "ClassifyAnnualMultiplyDivideSum", lambda _operands, _operators: None)
    sections, pools = _multiply_divide_sections("PM-L3")
    questions = _CollectAnnualCompetitionQuestions("PM-L3", sections, pools, "pm-l3-old")
    assert len([q for q in questions if q["operands"][1] == 1]) == 10


# ---------------------------------------------------------------------------
# 3. Backfill
# ---------------------------------------------------------------------------
@pytest.fixture()
def backfill_module():
    spec = importlib.util.spec_from_file_location("backfill_annual_competition_multiply_divide_rule", _SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)()


def _level(db, module_code, level_code):
    module = db.query(Module).filter(Module.module_code == module_code).first()
    if not module:
        module = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(module)
        db.flush()
    level = db.query(Level).filter(Level.level_code == level_code).first()
    if not level:
        level = Level(id=f"level-{level_code}", module_id=module.id, level_code=level_code, level_name=level_code, is_active=True)
        db.add(level)
        db.flush()
    return level


def _student(db, code):
    user = User(full_name=f"Student {code}", email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.flush()
    student = Student(user_id=user.id, student_code=code)
    db.add(student)
    db.flush()
    return student


def _old_style_paper(db, monkeypatch, level, level_code, student, *, paper_kind="PRACTICE"):
    """A real paper generated the way papers were generated BEFORE the rule
    (the rule switched off for this one call), linked the way
    _GeneratePracticePapersForOneStudent links a practice paper."""
    with monkeypatch.context() as patch:
        patch.setattr(generation, "ClassifyAnnualMultiplyDivideSum", lambda _operands, _operators: None)
        payload = GenerateAnnualCompetitionLevelPaper(
            db, LevelId=level.id, CreatedBy=None, CompetitionScope="ANNUAL_COMPETITION_PRACTICE", CompetitionLevelCode=level_code
        )
    paper = CompetitionEventLevelPaper(
        competition_level_code=level_code, mock_exam_id=payload["mockExamId"], paper_kind=paper_kind,
        status="READY", assigned_student_id=student.id if paper_kind == "PRACTICE" else None,
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.commit()
    return paper


def _snapshot(db, mock_exam_id):
    rows = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == mock_exam_id)
        .order_by(CompetitionMockQuestion.question_number)
        .all()
    )
    return [(r.id, r.question_number, r.section_number, r.section_title, r.operands_json, r.operators_json, r.correct_answer) for r in rows]


def _section_faults(snapshot, section_number):
    sums = [(json.loads(r[4]), json.loads(r[5])) for r in snapshot if r[2] == section_number]
    return AnnualMultiplyDivideRuleFaults(sums)


def test_backfill_rebuilds_only_the_offending_section_of_an_unopened_practice_paper(backfill_module, monkeypatch):
    db = _session()
    level = _level(db, "PM", "PM-L3")
    student = _student(db, "MP-ST-RULE-1")
    paper = _old_style_paper(db, monkeypatch, level, "PM-L3", student)
    before = _snapshot(db, paper.mock_exam_id)
    assert _section_faults(before, 3)["never"] == 10  # the ten x 1 sums are really there

    # Dry run: reports it, writes nothing.
    dry = backfill_module.run_practice_phase(db, apply=False, level_codes=backfill_module.target_level_codes())
    assert dry["rebuilt"] == 1 and dry["failed"] == 0
    assert _snapshot(db, paper.mock_exam_id) == before

    applied = backfill_module.run_practice_phase(db, apply=True, level_codes=backfill_module.target_level_codes())
    assert applied["rebuilt"] == 1 and applied["failed"] == 0
    after = _snapshot(db, paper.mock_exam_id)

    # Same paper, same size, same numbering.
    assert db.get(CompetitionEventLevelPaper, paper.id).mock_exam_id == paper.mock_exam_id
    assert [r[1] for r in after] == [r[1] for r in before] == list(range(1, 201))
    # Sections 1 and 2 (add / less) are the very same rows.
    assert [r for r in after if r[2] != 3] == [r for r in before if r[2] != 3]
    # Section 3 is new, complete, meets the rule and keeps its title.
    new_section = [r for r in after if r[2] == 3]
    assert len(new_section) == 100
    assert not ({r[0] for r in new_section} & {r[0] for r in before})
    assert {r[3] for r in new_section} == {r[3] for r in before if r[2] == 3}
    assert _section_faults(after, 3)["faults"] == 0
    # Options: none left pointing at a deleted question, every new question has its own.
    live_ids = {r[0] for r in after}
    option_owners = {row[0] for row in db.query(CompetitionMockQuestionOption.mock_question_id).all()}
    assert option_owners <= live_ids
    assert {r[0] for r in new_section} <= option_owners

    # Running it again finds nothing left to do.
    again = backfill_module.run_practice_phase(db, apply=True, level_codes=backfill_module.target_level_codes())
    assert again["rebuilt"] == 0 and again["fine"] == 1
    assert _snapshot(db, paper.mock_exam_id) == after


def test_backfill_leaves_a_compliant_multiplication_section_alone(backfill_module, monkeypatch):
    """PM-L4: only division breaks the rule, so only division is rebuilt."""
    db = _session()
    level = _level(db, "PM", "PM-L4")
    student = _student(db, "MP-ST-RULE-2")
    paper = None
    for _ in range(12):  # an old paper whose division section breaks the rule (nearly every one does)
        candidate = _old_style_paper(db, monkeypatch, level, "PM-L4", student)
        snapshot = _snapshot(db, candidate.mock_exam_id)
        if _section_faults(snapshot, 4)["faults"] > 0 and _section_faults(snapshot, 3)["faults"] == 0:
            paper = candidate
            break
        db.delete(candidate)
        db.commit()
    assert paper is not None
    before = _snapshot(db, paper.mock_exam_id)

    outcome = RebuildAnnualCompetitionMultiplyDivideSections(db, MockExamId=paper.mock_exam_id, CompetitionLevelCode="PM-L4", Apply=True)
    db.commit()
    after = _snapshot(db, paper.mock_exam_id)

    assert outcome["status"] == "REBUILT" and outcome["rebuiltSectionNumbers"] == [4]
    assert [r for r in after if r[2] != 4] == [r for r in before if r[2] != 4]  # sections 1-3 untouched, multiplication included
    assert _section_faults(after, 4)["faults"] == 0
    assert len(after) == len(before) == 300


def test_backfill_never_touches_opened_completed_or_official_papers(backfill_module, monkeypatch):
    db = _session()
    level = _level(db, "PM", "PM-L3")
    opened = _old_style_paper(db, monkeypatch, level, "PM-L3", _student(db, "MP-ST-RULE-OPEN"))
    db.add(CompetitionEventAttempt(
        level_paper_id=opened.id, student_id=opened.assigned_student_id, attempt_type="PRACTICE",
        status="IN_PROGRESS", started_at=datetime.now(timezone.utc),
    ))
    completed = _old_style_paper(db, monkeypatch, level, "PM-L3", _student(db, "MP-ST-RULE-DONE"))
    completed.consumed_at = datetime.now(timezone.utc)
    official = _old_style_paper(db, monkeypatch, level, "PM-L3", _student(db, "MP-ST-RULE-OFF"), paper_kind="OFFICIAL")
    db.commit()
    before = {p.id: _snapshot(db, p.mock_exam_id) for p in (opened, completed, official)}

    backfill_module.report_official_papers(db, backfill_module.target_level_codes())
    summary = backfill_module.run_practice_phase(db, apply=True, level_codes=backfill_module.target_level_codes())

    assert summary["rebuilt"] == 0 and summary["opened"] == 1
    for paper in (opened, completed, official):
        assert _snapshot(db, paper.mock_exam_id) == before[paper.id]


def test_backfill_reports_a_paper_whose_layout_differs_and_leaves_it(monkeypatch):
    db = _session()
    level = _level(db, "PM", "PM-L3")
    paper = _old_style_paper(db, monkeypatch, level, "PM-L3", _student(db, "MP-ST-RULE-LAYOUT"))
    # An older paper with a shorter multiplication section than today's 100.
    extra = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == paper.mock_exam_id, CompetitionMockQuestion.section_number == 3)
        .order_by(CompetitionMockQuestion.question_number.desc())
        .first()
    )
    db.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id == extra.id).delete()
    db.delete(extra)
    db.commit()
    before = _snapshot(db, paper.mock_exam_id)

    outcome = RebuildAnnualCompetitionMultiplyDivideSections(db, MockExamId=paper.mock_exam_id, CompetitionLevelCode="PM-L3", Apply=True)

    assert outcome["status"] == "STRUCTURE_DIFFERS"
    assert _snapshot(db, paper.mock_exam_id) == before


def test_levels_without_multiplication_or_division_are_not_applicable():
    db = _session()
    outcome = RebuildAnnualCompetitionMultiplyDivideSections(db, MockExamId="anything", CompetitionLevelCode="PM-L1", Apply=True)
    assert outcome["status"] == "NOT_APPLICABLE"
