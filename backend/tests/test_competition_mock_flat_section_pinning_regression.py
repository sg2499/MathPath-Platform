"""Regression coverage for the 2026-09-03 Mock Studio fix (Shailesh, live
report): "on trying to allocate the number of questions section wise all
the sections except the skill stacker and concept drill one remain greyed
out and adjust automatically, ideally the user should be able to edit any
of the section's question numbers as they deem fit and the other sections
should adjust accordingly to whatever the total marks is set for that
particular exam."

Before this fix, _BalanceCompetitionMockSectionCounts() (the function
GenerateCompetitionMockDraft calls for any level with a weighted
Concept Drill/Skill Stacker section -- BM-L1, MM-L1, IM levels, etc.)
only ever read admin overrides for the WEIGHTED section key(s);
SectionCountsOverride entries for any flat (1 mark/question) section were
silently discarded and that section was always auto-computed instead, no
matter what the admin's Section Allocation panel sent for it. This file
locks in that a flat section's admin-set count is now honored (pinned,
same as a weighted section's always was), that the marks-balancing
invariant (mock always totals exactly MarksTarget marks) still holds when
a flat section is pinned, and that COMPETITION_MOCK_MARKS_INVALID still
fires correctly when the admin's pinned counts (weighted + flat) leave no
untouched section able to absorb the remainder.

Uses BM-L1 (BM_COMPETITION_SECTION_DEFINITIONS: 5 flat sections --
Add/Less Abacus, Add/Less Visual, Multiplication, Division, BODMAS -- plus
BM_CONCEPT_DRILL weighted 5 marks/question) purely because
test_bm_dps_assessment_mock.py already has a working db/bm_l1_level
fixture pair to reuse; nothing here is BM-specific -- the fix lives in the
shared _BalanceCompetitionMockSectionCounts(), used by every weighted
module/level alike.
"""
from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import CompetitionMockQuestion, Level, Module, User
from app.seed.seed_bridge_module_l1 import seed as seed_bm
from app.services.competition_mock_generation_service import (
    CompetitionMockSectionPlan,
    GenerateCompetitionMockDraft,
)


def _section_key(question: CompetitionMockQuestion) -> str:
    metadata = json.loads(question.metadata_json or "{}")
    return str(metadata.get("competitionSectionKey") or "")


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


def test_pinning_a_flat_section_is_honored_not_silently_discarded(db, bm_l1_level):
    """The actual bug: before the fix, pinning BM_BODMAS (a flat section) to
    an unusual count had zero effect on the generated mock -- it was always
    silently overwritten by the auto-computed remainder split. Two mocks
    built from the same base plan but different BM_BODMAS pins must now
    produce genuinely different BM_BODMAS question counts.
    """
    _module, level, admin = bm_l1_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=60)
    base_counts = {row["sectionKey"]: row["questionCount"] for row in plan["sections"]}
    assert "BM_BODMAS" in base_counts and "BM_CONCEPT_DRILL" in base_counts

    # Pin BODMAS to a value well away from its auto default, redistributing
    # the delta across the other untouched flat sections so the mock still
    # totals 60 marks -- everything except BM_BODMAS and BM_CONCEPT_DRILL is
    # left floating.
    pinned_bodmas = base_counts["BM_BODMAS"] + 4
    section_counts = {
        "BM_CONCEPT_DRILL": base_counts["BM_CONCEPT_DRILL"],
        "BM_BODMAS": pinned_bodmas,
    }

    result = GenerateCompetitionMockDraft(
        db,
        LevelId=level.id,
        CreatedBy=admin,
        Title="BM-L1 Flat Section Pin Regression Mock",
        TotalMarks=60,
        SectionCounts=section_counts,
    )

    persisted = db.query(CompetitionMockQuestion).filter(
        CompetitionMockQuestion.mock_exam_id == result["mockExamId"]
    ).all()
    bodmas_count = sum(1 for q in persisted if _section_key(q) == "BM_BODMAS")
    assert bodmas_count == pinned_bodmas, (
        "Pinning a flat section's question count must be honored, not silently "
        "overwritten by the auto-computed remainder split (the exact bug reported live)."
    )

    # The mock must still total exactly 60 marks -- each question's own
    # persisted `marks` column is authoritative (5 for Concept Drill, 1 for
    # everything else), no need to re-derive it from section membership.
    total_marks = sum(q.marks for q in persisted)
    assert total_marks == 60


def test_untouched_flat_sections_still_float_to_absorb_the_remainder(db, bm_l1_level):
    """Pinning only ONE flat section (BM_BODMAS) must leave every OTHER flat
    section still auto-adjusting to keep the mock at MarksTarget marks --
    the "other sections should adjust accordingly" half of the request.
    """
    # 100, not 50: BM_CONCEPT_DRILL's own default (10 questions x 5 marks =
    # 50 marks) is independent of MarksTarget, so a 50-mark target would
    # already be fully consumed by the untouched weighted section alone,
    # leaving no room to also pin a flat section without tripping the
    # (correct, separately covered) MARKS_INVALID guard.
    _module, level, admin = bm_l1_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=100)
    base_counts = {row["sectionKey"]: row["questionCount"] for row in plan["sections"]}

    section_counts = {"BM_BODMAS": base_counts["BM_BODMAS"] + 6}

    result = GenerateCompetitionMockDraft(
        db,
        LevelId=level.id,
        CreatedBy=admin,
        Title="BM-L1 Single Flat Pin Regression Mock",
        TotalMarks=100,
        SectionCounts=section_counts,
    )

    persisted = db.query(CompetitionMockQuestion).filter(
        CompetitionMockQuestion.mock_exam_id == result["mockExamId"]
    ).all()
    bodmas_count = sum(1 for q in persisted if _section_key(q) == "BM_BODMAS")
    assert bodmas_count == base_counts["BM_BODMAS"] + 6
    total_marks = sum(q.marks for q in persisted)
    assert total_marks == 100, "Untouched sections must still redistribute to hold the mock at MarksTarget marks."


def test_marks_invalid_still_fires_when_pinned_flat_and_weighted_counts_leave_no_room(db, bm_l1_level):
    """Same guard as before the fix, now also reachable by over-pinning a
    FLAT section (not just the weighted one): if every section is pinned
    (nothing left floating) and the pinned counts don't add up to exactly
    MarksTarget marks, generation must fail loudly with
    COMPETITION_MOCK_MARKS_INVALID rather than silently drift off-target.
    """
    _module, level, admin = bm_l1_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=60)
    all_keys = [row["sectionKey"] for row in plan["sections"]]

    # Pin every single section (including every flat one) to 1 question each
    # -- 6 sections, one of them (BM_CONCEPT_DRILL) worth 5 marks, the rest 1
    # mark each = 10 marks total, nowhere near the 60-mark target, and with
    # nothing left floating to absorb the other 50.
    section_counts = {key: 1 for key in all_keys}

    with pytest.raises(HTTPException) as exc_info:
        GenerateCompetitionMockDraft(
            db,
            LevelId=level.id,
            CreatedBy=admin,
            Title="BM-L1 Fully Pinned Mismatch Regression Mock",
            TotalMarks=60,
            SectionCounts=section_counts,
        )
    assert exc_info.value.detail.get("code") == "COMPETITION_MOCK_MARKS_INVALID"
