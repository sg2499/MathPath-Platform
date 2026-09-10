"""Annual Competition question-generation engine tests (2026-09-10 build).

Covers annual_competition_paper_registry.py + annual_competition_paper_
generation_service.py -- the standalone, additive-only engine that generates
each competition level's official paper directly from each module's own
low-level question generator (never via the shared IM/MM/PM/YLM competition
registries or GenerateCompetitionMockDraft -- see both modules' docstrings
for why). Source of truth for every expected number below: the client gist
(MathPath_Competition_Section_Scoring_Developer_Gist.docx, v1.0, 8 Sep 2026).

Unlike the practice Competition Mock engine, this one does not read any
seeded Lesson/DPS content from the database -- every low-level generator it
calls is driven entirely by GeneratorConfig fields set from the registry, so
a bare active Level/Module row (no real curriculum seed) is enough to
generate a real paper. This keeps these tests fast and self-contained.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CompetitionMockExam, CompetitionMockQuestion, Level, Module, User
from app.services.annual_competition_paper_generation_service import GenerateAnnualCompetitionLevelPaper
from app.services.annual_competition_paper_registry import (
    ANNUAL_COMPETITION_LEVEL_REGISTRY,
    GetAnnualCompetitionLevelConfig,
)


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _admin(db):
    a = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _module_and_level(db, module_code, level_code, level_name):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
    db.add(l)
    db.flush()
    return m, l


# ---------------------------------------------------------------------------
# Gist-exact expected shape per level: (module_code, section_count,
# question_count, duration_seconds). module_code is only used to seed a
# plausible stub Level/Module pair here -- generation itself never checks
# module_code against the level code.
# ---------------------------------------------------------------------------
EXPECTED = {
    "YLM-L1": ("YLM", 1, 50, 10 * 60),
    "PM-L1": ("PM", 1, 100, 10 * 60),
    "PM-L2": ("PM", 2, 100, 10 * 60),
    "PM-L3": ("PM", 3, 200, 20 * 60),
    "PM-L4": ("PM", 4, 300, 20 * 60),
    "IM-L1": ("IM", 4, 300, 20 * 60),
    "IM-L2": ("IM", 4, 300, 20 * 60),
    "IM-L3": ("IM", 5, 350, 25 * 60),
    "IM-L4": ("IM", 6, 400, 30 * 60),
    "MM-L1": ("MM", 7, 450, 35 * 60),
}

_FORBIDDEN_WEIGHTED_FAMILIES = {"SKILL_STACKER", "CONCEPT_DRILL"}


@pytest.mark.parametrize("level_code,expected", sorted(EXPECTED.items()))
def test_generates_gist_exact_paper_for_every_level(level_code, expected):
    module_code, expected_sections, expected_questions, expected_duration = expected
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, module_code, level_code, level_code)
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"])
        .order_by(CompetitionMockQuestion.question_number)
        .all()
    )
    section_numbers = sorted(set(q.section_number for q in questions))
    concept_families = {q.concept_family for q in questions}

    assert len(questions) == expected_questions
    assert len(section_numbers) == expected_sections
    assert payload["durationSeconds"] == expected_duration
    assert not (concept_families & _FORBIDDEN_WEIGHTED_FAMILIES)
    assert {q.marks for q in questions} == {1}  # flat 1 mark/question, no negative marking
    assert payload["totalMarks"] == expected_questions


def test_mm_l2_generates_via_competition_level_code_override_on_mm_l1_row():
    """MM-L2 has no curriculum Level row of its own anywhere on this
    platform (the Master Module only ever seeds "MM-L1" -- see
    app/seed/seed_master_module.py) -- but it is a real, gist-specified
    Annual Competition target. GenerateAnnualCompetitionLevelPaper's
    CompetitionLevelCode override lets a caller generate MM-L2's own content
    while linking through the real MM-L1 Level row for Module/DB context."""
    db = _session()
    admin = _admin(db)
    _module, mm_l1_level = _module_and_level(db, "MM", "MM-L1", "Master Module Level 1")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(
        db, LevelId=mm_l1_level.id, CreatedBy=admin, CompetitionLevelCode="MM-L2"
    )

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"])
        .all()
    )
    assert len(questions) == 450
    assert len(set(q.section_number for q in questions)) == 7
    assert payload["durationSeconds"] == 35 * 60

    exam = db.get(CompetitionMockExam, payload["mockExamId"])
    assert exam.level_id == mm_l1_level.id  # linked through the real MM-L1 row
    assert '"levelCode": "MM-L2"' in (exam.generation_config_json or "")  # content generated for MM-L2


def test_im_l4_section1_borrowing_produces_genuine_mixed_answer_signs():
    """Regression guard for the 2026-09-09 fix: IM-4's own borrowingMode=
    POSITIVE_NEGATIVE is (correctly, for IM's own curriculum) biased ~90%
    negative, which fails the gist's "include positive and negative final
    answers" requirement for this section. IM-L4 Section 1 is routed through
    MM's engine instead (MIXED_POSITIVE_NEGATIVE) -- this asserts the fix is
    still wired, not just that generation succeeds."""
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)
    section1_questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"], CompetitionMockQuestion.section_number == 1)
        .all()
    )
    assert len(section1_questions) == 50
    signs = {("-" in q.correct_answer) for q in section1_questions}
    assert signs == {True, False}  # both positive and negative answers present, not near-all-negative


def test_pm_l1_round_hundreds_narrow_diversity_does_not_break_generation():
    """Regression guard for the pool-fallback-cycling fix: PM-L1's 'Direct
    Add/Less (Round Hundreds)' concept has a fully deterministic (1-unique-
    value) achievable output space, which used to make PM-L1's 100-question
    section ungeneratable once the equal-split schedule assigned it more
    than one slot. Asserting the full 100-question count here would silently
    pass even if the fallback broke and PM-L1 shrank some other pool instead,
    so this only needs the base full-generation test above -- this test
    exists to name the specific regression being guarded against."""
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, "PM", "PM-L1", "Preparatory Level 1")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)
    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"])
        .all()
    )
    assert len(questions) == 100
    # No two questions in the paper share an identical operand signature.
    signatures = {(tuple(q.operands_json or ""), q.correct_answer) for q in questions}
    assert len(signatures) == len(questions)


def test_registry_has_no_entry_for_non_competition_levels():
    assert GetAnnualCompetitionLevelConfig("BM-L1") is None
    assert GetAnnualCompetitionLevelConfig("NOT-A-REAL-CODE") is None


def test_mm_l2_registry_entry_is_alias_of_mm_l1():
    """Documented, intentional design (annual_competition_paper_registry.py):
    the gist's "MM-2" row maps to both platform levels with identical
    section/concept/count/time content."""
    assert ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L2"] is ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L1"]


def test_generate_fails_cleanly_for_inactive_level():
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, "PM", "PM-L1", "Preparatory Level 1")
    level.is_active = False
    db.commit()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)
    assert exc_info.value.status_code == 404
