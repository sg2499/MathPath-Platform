"""Regression coverage for the 2026-09-03 live report (Shailesh, after the
flat-section-pinning fix had already shipped): "i still see this error, wtf
bor?" -- reproduced live via the Claude in Chrome extension against the
actual deployed Mock Studio: selecting IM · IM-L2, leaving every Section
Allocation box untouched (no admin overrides at all), and simply typing 55
into Total Marks made the section-plan PREVIEW request itself fail --
GET /api/admin/competition/mock-section-plan?...&totalMarks=55 -> 400
COMPETITION_MOCK_MARKS_INVALID -- before the admin ever touched a single
section box.

Root cause: an UNTOUCHED weighted (Skill Stacker/Concept Drill) section's
default question count came from DefaultPerSection = round(DefaultTotal /
section-count), a QUESTION count derived from the level's fixed default
TOTAL QUESTIONS constant (100 for IM), with zero relationship to
MarksTarget. For IM-L2 (6 sections) that put the untouched weighted
section's default at 17 questions x 5 marks/question = 85 marks -- before a
single flat section got anything -- so ANY MarksTarget below ~85 (most of
the admin's own 10-100 range) was structurally impossible with nothing
pinned, no matter what the admin did: RemainingMarks went negative and
_BalanceCompetitionMockSectionCounts() raised COMPETITION_MOCK_MARKS_INVALID
unconditionally.

The fix scales that same DefaultPerSection proportionally by
MarksTarget/100 -- exactly reproducing the old formula at MarksTarget=100
(the only value that existed before 2026-09-01, so every existing level's
100-mark default is provably unchanged, see
test_bm_dps_assessment_mock.py's untouched assertions), while shrinking in
step with the admin's chosen budget below 100 so it can never by itself
exceed MarksTarget.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Level, Module, User
from app.seed.seed_bridge_module_l1 import seed as seed_bm
from app.services.competition_mock_generation_service import (
    CompetitionMockSectionPlan,
    GenerateCompetitionMockDraft,
    _BalanceCompetitionMockSectionCounts,
    _ImCompetitionLevelConfig,
)


def test_im_l2_untouched_weighted_default_no_longer_blows_the_budget_at_55_marks():
    """Exact live repro, at the level of the pure function that raised the
    error: IM-L2's own real section registry, MarksTarget=55, NO admin
    overrides at all (CountsOverride=None) -- must succeed and total
    exactly 55 marks instead of raising COMPETITION_MOCK_MARKS_INVALID.
    """
    level = Level(id="level-im-l2-regression", module_id="module-im", level_code="IM-L2", level_name="Level - 2")
    ImConfig = _ImCompetitionLevelConfig(level)
    SectionDefinitions, SectionConceptPools = ImConfig["sectionDefinitions"], ImConfig["sectionConceptPools"]

    Result = _BalanceCompetitionMockSectionCounts(SectionDefinitions, SectionConceptPools, None, 100, 55)
    assert Result is not None
    WeightedMarks = Result["IM_L2_SKILL_DRILL"] * 5
    FlatMarks = sum(Count for Key, Count in Result.items() if Key != "IM_L2_SKILL_DRILL")
    assert WeightedMarks + FlatMarks == 55


def test_im_l2_untouched_weighted_default_works_across_the_full_10_to_100_marks_range():
    """The admin's Total Marks field accepts any value 10-100 -- with no
    section box touched, every single one of those values must resolve
    without error, exactly to that many marks.
    """
    level = Level(id="level-im-l2-regression-2", module_id="module-im", level_code="IM-L2", level_name="Level - 2")
    ImConfig = _ImCompetitionLevelConfig(level)
    SectionDefinitions, SectionConceptPools = ImConfig["sectionDefinitions"], ImConfig["sectionConceptPools"]

    for MarksTarget in range(10, 101, 5):
        Result = _BalanceCompetitionMockSectionCounts(SectionDefinitions, SectionConceptPools, None, 100, MarksTarget)
        assert Result is not None, f"MarksTarget={MarksTarget} unexpectedly has no weighted section"
        TotalMarks = sum(
            Count * (5 if Key == "IM_L2_SKILL_DRILL" else 1)
            for Key, Count in Result.items()
        )
        assert TotalMarks == MarksTarget, f"MarksTarget={MarksTarget} produced {TotalMarks} marks instead"


def test_im_l2_untouched_default_at_100_marks_is_unchanged_from_before_this_fix():
    """MarksTarget=100 is the only value that existed before 2026-09-01 and
    stays the default today -- the scaled formula (DefaultPerSection x
    MarksTarget/100) must be bit-for-bit identical to the old flat
    DefaultPerSection there, so this fix changes nothing about the
    already-working, already-seen-by-the-admin common case.
    """
    level = Level(id="level-im-l2-regression-3", module_id="module-im", level_code="IM-L2", level_name="Level - 2")
    ImConfig = _ImCompetitionLevelConfig(level)
    SectionDefinitions, SectionConceptPools = ImConfig["sectionDefinitions"], ImConfig["sectionConceptPools"]

    Result = _BalanceCompetitionMockSectionCounts(SectionDefinitions, SectionConceptPools, None, 100, 100)
    assert Result is not None
    # DefaultPerSection = round(100 / 6) = 17 -- same figure the live
    # screenshot showed ("17 question(s) ... already worth 85 marks") and
    # the same figure IM-L2 always resolved to at the 100-mark default.
    assert Result["IM_L2_SKILL_DRILL"] == 17


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
def bm_l1_level(db):
    seed_bm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "BM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "BM-L1").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def test_end_to_end_section_plan_preview_succeeds_at_low_marks_targets_with_nothing_touched(db, bm_l1_level):
    """Same bug, exercised through the actual public entrypoint the Mock
    Studio's Section Allocation panel calls on every level/marks change
    (CompetitionMockSectionPlan, backing GET /mock-section-plan) -- with
    zero admin overrides, a low Total Marks must no longer 400.
    """
    _module, level, _admin = bm_l1_level
    for MarksTarget in (10, 20, 30, 40):
        Plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=MarksTarget)
        TotalMarks = sum(
            Row["questionCount"] * Row["marksPerQuestion"] for Row in Plan["sections"]
        )
        assert TotalMarks == MarksTarget, f"MarksTarget={MarksTarget} produced {TotalMarks} marks instead"


def test_end_to_end_generate_draft_mock_succeeds_at_low_marks_target_with_nothing_touched(db, bm_l1_level):
    """Same as above, through the actual generation entrypoint -- an admin
    who sets Total Marks to a low value and clicks Generate Draft Mock
    straight away (no section box touched) must get a real mock, not
    COMPETITION_MOCK_MARKS_INVALID.
    """
    _module, level, admin = bm_l1_level
    Result = GenerateCompetitionMockDraft(
        db,
        LevelId=level.id,
        CreatedBy=admin,
        Title="BM-L1 Low Marks Target Regression Mock",
        TotalMarks=20,
        SectionCounts={},
    )
    assert Result["mockExamId"]
