"""Regression coverage for scripts/backfill_annual_competition_ylm_direct_
add_less_digit_mix.py (2026-09-17) -- the one-time backfill that regenerates
already-assigned, never-attempted Annual Competition PRACTICE papers for
YLM-L0 (Bloomers) and YLM-L1 (Beginners) so they pick up the same-day
registry/generator digit-mix fix (single/double/mixed direct add/less,
instead of the old 25/25 single-digit/mixed-only split).

Mirrors test_backfill_annual_competition_add_less_difficulty_ease.py's own
structure and conventions almost exactly -- same underlying situation (a
registry pool content change a frozen, already-assigned practice paper can't
pick up on its own), same production pipeline (GenerateAnnualCompetitionLevelPaper),
same real in-memory SQLite database, loaded by file path.
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
    CompetitionMockExam,
    CompetitionMockQuestion,
    Level,
    Module,
    Student,
    User,
)

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_annual_competition_ylm_direct_add_less_digit_mix.py"


@pytest.fixture()
def backfill_module():
    spec = importlib.util.spec_from_file_location("backfill_annual_competition_ylm_direct_add_less_digit_mix", _SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _module_and_level(db, module_code, level_code):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = db.query(Level).filter(Level.level_code == level_code).first()
    if not l:
        l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_code, is_active=True)
        db.add(l)
        db.flush()
    return m, l


def _student(db, code="MP-ST-DIRECTMIX"):
    user = User(full_name="DirectMix Backfill Student", email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.flush()
    student = Student(user_id=user.id, student_code=code)
    db.add(student)
    db.flush()
    return student


def _seed_practice_paper(db, level_code, student, mock_code="OLD-MOCK-CODE"):
    """A real, previously-generated exam+paper pair -- exactly what
    _GeneratePracticePapersForOneStudent leaves behind for a student who was
    assigned before the digit-mix fix landed (old 25/25 single/mixed-only
    content, standing in for it here with a single stub question -- the
    backfill never inspects a paper's existing question content, only its
    attempt/consumed_at state, so a stub is sufficient)."""
    _module, level = _module_and_level(db, "YLM", level_code if level_code != "YLM-L0" else "YLM-L1")
    exam = CompetitionMockExam(
        title=f"Annual Competition Practice -- {level_code}",
        mock_code=mock_code,
        module_id=level.module_id,
        level_id=level.id,
        competition_scope="ANNUAL_COMPETITION_PRACTICE",
        total_questions=1,
        duration_seconds=600,
        status="DRAFT",
    )
    db.add(exam)
    db.flush()
    question = CompetitionMockQuestion(
        mock_exam_id=exam.id, section_number=1, section_title="Direct Sums (Abacus)", question_number=1,
        display_type="VERTICAL", question_text="1 + 1", operands_json="[1, 1]", operators_json='["+"]',
        correct_answer="2", difficulty="MEDIUM", concept_family="DIRECT_ADD_LESS", concept_tag="DIRECT_ADD_LESS",
        source_type="ANNUAL_COMPETITION_GENERATOR", source_reference_id="", seed="old-seed", marks=1,
    )
    db.add(question)
    db.flush()
    paper = CompetitionEventLevelPaper(
        competition_level_code=level_code, mock_exam_id=exam.id, paper_kind="PRACTICE",
        status="READY", assigned_student_id=student.id, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.commit()
    return {"level": level, "exam_id": exam.id, "paper_id": paper.id, "student_id": student.id}


# ---------------------------------------------------------------------------
# Level resolution (mirrors AssignAnnualCompetitionPracticeToStudents' own
# CurriculumLookupLevelCode + is_active resolution exactly)
# ---------------------------------------------------------------------------


def test_resolve_level_records_maps_ylm_l0_through_the_real_ylm_l1_row(backfill_module):
    db = _session()
    _module_and_level(db, "YLM", "YLM-L1")
    db.commit()

    records = backfill_module._resolve_level_records(db)

    assert set(records.keys()) == {"YLM-L0", "YLM-L1"}
    assert records["YLM-L0"].level_code == "YLM-L1"
    assert records["YLM-L0"].id == records["YLM-L1"].id


def test_resolve_level_records_skips_when_no_active_row(backfill_module):
    db = _session()
    records = backfill_module._resolve_level_records(db)

    assert records == {}


# ---------------------------------------------------------------------------
# PRACTICE phase
# ---------------------------------------------------------------------------


def test_practice_dry_run_reports_without_writing(backfill_module):
    db = _session()
    student = _student(db)
    scenario = _seed_practice_paper(db, "YLM-L1", student)
    level_records = backfill_module._resolve_level_records(db)

    summary = backfill_module._run_practice_phase(db, apply=False, level_records=level_records)

    assert summary["regenerated"] == 1
    assert summary["by_level"]["YLM-L1"] == 1

    paper = db.get(CompetitionEventLevelPaper, scenario["paper_id"])
    assert paper.mock_exam_id == scenario["exam_id"]  # untouched


@pytest.mark.parametrize("level_code", ["YLM-L1", "YLM-L0"])
def test_practice_apply_regenerates_with_the_new_digit_mix_and_deletes_old_exam(backfill_module, level_code):
    db = _session()
    student = _student(db)
    scenario = _seed_practice_paper(db, level_code, student)
    level_records = backfill_module._resolve_level_records(db)

    summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert summary["regenerated"] == 1
    assert summary["failed"] == 0

    paper = db.get(CompetitionEventLevelPaper, scenario["paper_id"])
    assert paper.mock_exam_id != scenario["exam_id"]

    new_exam = db.get(CompetitionMockExam, paper.mock_exam_id)
    assert new_exam is not None
    assert "DIRECTMIX" in new_exam.mock_code

    old_exam = db.get(CompetitionMockExam, scenario["exam_id"])
    assert old_exam is None  # cleaned up via DeleteCompetitionMockExam

    new_questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == paper.mock_exam_id)
        .all()
    )
    assert len(new_questions) == 50
    assert {q.concept_family for q in new_questions} == {"DIRECT_ADD_LESS"}  # concept never changes

    def _base_width(q):
        operands = json.loads(q.operands_json or "[]")
        base = abs(int(operands[0])) if operands else 0
        return "1D" if base < 10 else "2D"

    widths = {_base_width(q) for q in new_questions}
    assert widths == {"1D", "2D"}  # the regenerated paper actually has the new mix, not the old stub content


def test_practice_skipped_once_any_attempt_exists_any_status(backfill_module):
    db = _session()
    student = _student(db)
    scenario = _seed_practice_paper(db, "YLM-L1", student)
    attempt = CompetitionEventAttempt(
        level_paper_id=scenario["paper_id"], student_id=student.id, attempt_type="PRACTICE",
        status="IN_PROGRESS", started_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.commit()
    level_records = backfill_module._resolve_level_records(db)

    summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert summary["regenerated"] == 0
    paper = db.get(CompetitionEventLevelPaper, scenario["paper_id"])
    assert paper.mock_exam_id == scenario["exam_id"]  # untouched, even though consumed_at is still NULL


def test_practice_skipped_once_consumed(backfill_module):
    db = _session()
    student = _student(db)
    scenario = _seed_practice_paper(db, "YLM-L1", student)
    paper = db.get(CompetitionEventLevelPaper, scenario["paper_id"])
    paper.consumed_at = datetime.now(timezone.utc)
    db.commit()
    level_records = backfill_module._resolve_level_records(db)

    summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert summary["regenerated"] == 0


def test_practice_apply_is_idempotent(backfill_module):
    db = _session()
    student = _student(db)
    _seed_practice_paper(db, "YLM-L1", student)
    level_records = backfill_module._resolve_level_records(db)

    backfill_module._run_practice_phase(db, apply=True, level_records=level_records)
    second_summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert second_summary["regenerated"] == 0


def test_practice_skipped_when_no_curriculum_level_row(backfill_module):
    db = _session()
    student = _student(db)
    # Seed the paper/exam directly (bypassing _module_and_level) so no Level
    # row exists at all -- no YLM module/level seeded.
    module = Module(id="module-YLM", module_code="YLM", module_name="YLM", is_active=True)
    db.add(module)
    db.flush()
    stub_level = Level(id="level-YLM-STUB", module_id=module.id, level_code="YLM-STUB", level_name="stub", is_active=True)
    db.add(stub_level)
    db.flush()
    exam = CompetitionMockExam(
        title="Annual Competition Practice -- YLM-L1", mock_code="OLD-MOCK-CODE-2",
        module_id=module.id, level_id=stub_level.id, competition_scope="ANNUAL_COMPETITION_PRACTICE",
        total_questions=1, duration_seconds=600, status="DRAFT",
    )
    db.add(exam)
    db.flush()
    paper = CompetitionEventLevelPaper(
        competition_level_code="YLM-L1", mock_exam_id=exam.id, paper_kind="PRACTICE",
        status="READY", assigned_student_id=student.id, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.commit()

    level_records = backfill_module._resolve_level_records(db)  # YLM-L1 absent -- no real Level row seeded
    summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert summary["regenerated"] == 0
    fresh_paper = db.get(CompetitionEventLevelPaper, paper.id)
    assert fresh_paper.mock_exam_id == exam.id


def test_practice_levels_outside_scope_are_never_touched(backfill_module):
    db = _session()
    student = _student(db)
    _module_and_level(db, "IM", "IM-L2")
    exam = CompetitionMockExam(
        title="Annual Competition Practice -- IM-L2", mock_code="OLD-MOCK-CODE-IM",
        module_id=db.query(Module).filter(Module.module_code == "IM").first().id,
        level_id=db.query(Level).filter(Level.level_code == "IM-L2").first().id,
        competition_scope="ANNUAL_COMPETITION_PRACTICE", total_questions=1, duration_seconds=1200, status="DRAFT",
    )
    db.add(exam)
    db.flush()
    paper = CompetitionEventLevelPaper(
        competition_level_code="IM-L2", mock_exam_id=exam.id, paper_kind="PRACTICE",  # not in this script's TARGET_LEVEL_CODES
        status="READY", assigned_student_id=student.id, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.commit()
    level_records = backfill_module._resolve_level_records(db)

    summary = backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    assert summary["regenerated"] == 0
    assert summary["checked"] == 0
    fresh_paper = db.get(CompetitionEventLevelPaper, paper.id)
    assert fresh_paper.mock_exam_id == exam.id


# ---------------------------------------------------------------------------
# OFFICIAL papers -- reported only, never touched
# ---------------------------------------------------------------------------


def test_official_papers_are_reported_but_apply_never_touches_them(backfill_module):
    db = _session()
    _module, level = _module_and_level(db, "YLM", "YLM-L1")
    exam = CompetitionMockExam(
        title="YLM-L1 Official", mock_code="ANNUAL-OFFICIAL-YLM-L1", module_id=level.module_id, level_id=level.id,
        competition_scope="ANNUAL_COMPETITION", total_questions=1, duration_seconds=600, status="DRAFT",
    )
    db.add(exam)
    db.flush()
    official_paper = CompetitionEventLevelPaper(
        competition_level_code="YLM-L1", mock_exam_id=exam.id, paper_kind="OFFICIAL", status="READY",
    )
    db.add(official_paper)
    db.commit()

    official_count = backfill_module._report_official_papers(db)
    assert official_count == 1

    level_records = backfill_module._resolve_level_records(db)
    backfill_module._run_practice_phase(db, apply=True, level_records=level_records)

    fresh = db.get(CompetitionEventLevelPaper, official_paper.id)
    assert fresh.mock_exam_id == exam.id  # completely untouched
    assert db.get(CompetitionMockExam, exam.id) is not None


# ---------------------------------------------------------------------------
# Idempotency-tag detection
# ---------------------------------------------------------------------------


def test_is_already_backfilled_detects_the_directmix_tag(backfill_module):
    db = _session()
    _module, level = _module_and_level(db, "YLM", "YLM-L1")
    exam = CompetitionMockExam(title="x", mock_code="ANNUAL-PRACTICE-YLM-L1-DIRECTMIX-ABCD1234", module_id=level.module_id, level_id=level.id, total_questions=1, duration_seconds=60, status="DRAFT")
    db.add(exam)
    db.commit()

    assert backfill_module._is_already_backfilled(db, exam.id) is True


def test_is_already_backfilled_false_for_untagged_exam(backfill_module):
    db = _session()
    _module, level = _module_and_level(db, "YLM", "YLM-L1")
    exam = CompetitionMockExam(title="x", mock_code="ANNUAL-PRACTICE-YLM-L1-ABCD1234", module_id=level.module_id, level_id=level.id, total_questions=1, duration_seconds=60, status="DRAFT")
    db.add(exam)
    db.commit()

    assert backfill_module._is_already_backfilled(db, exam.id) is False


def test_is_already_backfilled_false_for_none(backfill_module):
    db = _session()
    assert backfill_module._is_already_backfilled(db, None) is False
