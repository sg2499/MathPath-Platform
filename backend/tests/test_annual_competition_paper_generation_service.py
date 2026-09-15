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
    # 2026-09-14 batch (Shailesh): Section 6 (Percentage) removed entirely --
    # was ("IM", 6, 400, 30 * 60). Totals are always computed live from
    # whatever sections remain, never hardcoded, so this table just reflects
    # the new live total.
    "IM-L4": ("IM", 5, 350, 25 * 60),
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


def test_mm_l2_squares_cubes_roots_stay_within_moderated_magnitude():
    """Regression guard for the 2026-09-11 difficulty-moderation pass
    (Shailesh's "not too tough, standard/moderate" instruction).

    Squares/Cubes/Square-Root/Cube-Root were originally staged to MM's
    internal Band 5 (lesson 25) + CHALLENGE tier purely to clear a pool-size
    floor (see annual_competition_paper_registry.py's own comment above
    _MM_SQUARES_CUBES_POOL) -- not because the gist demands maximum
    difficulty there. That combination pushed Squares' base numbers as high
    as 900 and Cubes' as high as 160. The moderation dropped to Band 4
    (lesson 20), which live-verified testing confirmed keeps every concept's
    achievable-output headroom safely above the 25-per-concept floor. This
    test locks in the moderated ceiling so a future edit cannot silently
    push these sections back toward maximum difficulty without this test
    failing first.

    2026-09-14 batch (Shailesh, "MM-1 and MM-2 are two distinct papers"):
    this content (Squares AND Cubes, Square Root AND Cube Root) now lives on
    MM-L2 only -- MM-L1's Section 5/7 were replaced with new, separately
    tested content (see test_mm_l1_squares_section_is_digit_targeted_2_and_3
    / test_mm_l1_cube_roots_section_is_digit_targeted_4_5_6 below). This test
    was retargeted from MM-L1 to MM-L2 rather than deleted, since MM-L2 keeps
    the exact original content the moderation pass above was about.
    """
    db = _session()
    admin = _admin(db)
    _module, mm_l1_level = _module_and_level(db, "MM", "MM-L1", "Master Module Level 1")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(
        db, LevelId=mm_l1_level.id, CreatedBy=admin, CompetitionLevelCode="MM-L2"
    )

    import json
    import re

    # Pre-moderation (Band 5/lesson 25 + CHALLENGE) ceilings per concept,
    # derived from mm/operands.py's own _SquareBaseRange/_CubeBaseRange/
    # _SquareRootBaseRange/_CubeRootBaseRange band-5 CHALLENGE rows. Squares
    # and Square Root have a clean, large before/after gap (moderation
    # roughly halves their range); Cubes similarly. Cube Root's ceiling is
    # capped near 99 at every band by the generator's own `min(Maximum, 99)`
    # rule, so its before/after gap is small -- checked mainly as a no-blowup
    # sanity guard, not a strong discriminator.
    OLD_CEILINGS = {
        "SQUARES": 900,            # was (400, 900)
        "CUBES": 160,               # was (90, 160)
        "SQUARE_ROOT": 450 ** 2,    # was base (220, 450) -> radicand up to 450**2
        "CUBE_ROOT": 100 ** 3,      # was base capped ~99 -> radicand up to ~99**3
    }

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(
            CompetitionMockQuestion.mock_exam_id == payload["mockExamId"],
            CompetitionMockQuestion.section_number.in_((5, 7)),
        )
        .all()
    )
    assert questions, "sections 5/7 (Squares/Cubes/Roots) produced no questions"
    seen_families = set()
    for question in questions:
        ceiling = OLD_CEILINGS.get(question.concept_family)
        assert ceiling is not None, f"unexpected concept_family {question.concept_family!r} in Squares/Cubes/Roots sections"
        seen_families.add(question.concept_family)
        max_operand = 0
        for operand in json.loads(question.operands_json or "[]"):
            for number in re.findall(r"\d+", str(operand)):
                max_operand = max(max_operand, int(number))
        assert max_operand < ceiling, (
            f"{question.concept_family}: operand {max_operand} did not drop below the "
            f"pre-moderation ceiling {ceiling} -- difficulty moderation may have regressed"
        )
    assert seen_families == set(OLD_CEILINGS)


def test_pm_l3_section3_renamed_to_multiplication_abacus():
    """2026-09-14 batch (Shailesh: rename Section 3 to "Multiplication
    (Abacus)"; "nothing else in that paper changes"). Title and mode both
    changed together (mode is a pure display badge, matched to the title so
    it never contradicts it) -- the underlying pool/question content and
    every other section are untouched."""
    section3 = next(s for s in ANNUAL_COMPETITION_LEVEL_REGISTRY["PM-L3"]["sections"] if s["key"] == "SEC3")
    assert section3["title"] == "Multiplication (Abacus)"
    assert section3["mode"] == "ABACUS"
    assert section3["questionCount"] == 100
    assert section3["timeLimitSeconds"] == 600


def test_registry_has_no_entry_for_non_competition_levels():
    assert GetAnnualCompetitionLevelConfig("BM-L1") is None
    assert GetAnnualCompetitionLevelConfig("NOT-A-REAL-CODE") is None


def test_mm_l1_and_mm_l2_are_independent_registry_entries():
    """2026-09-14 batch (Shailesh: "MM-1 and MM-2... in reality they are two
    distinct papers and are different from each other"). Supersedes the old
    "MM-L2 is a plain alias of MM-L1" design this test used to assert --
    they are now two fully independent dict objects, so editing one's
    sections can never silently change the other's. MM-L2 keeps the exact
    section/title/mode/questionCount/timeLimitSeconds content MM-1 used to
    share with it; only MM-1's Section 5/7 content actually changed."""
    mm_l1 = ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L1"]
    mm_l2 = ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L2"]
    assert mm_l1 is not mm_l2
    assert mm_l1["sections"] is not mm_l2["sections"]

    # Sections 1-4 (untouched by this batch) still match exactly between the
    # two levels -- only Section 5/7 are meant to differ now.
    for section_key in ("SEC1", "SEC2", "SEC3", "SEC4", "SEC6"):
        mm_l1_section = next(s for s in mm_l1["sections"] if s["key"] == section_key)
        mm_l2_section = next(s for s in mm_l2["sections"] if s["key"] == section_key)
        assert mm_l1_section == mm_l2_section

    mm_l1_sec5 = next(s for s in mm_l1["sections"] if s["key"] == "SEC5")
    mm_l2_sec5 = next(s for s in mm_l2["sections"] if s["key"] == "SEC5")
    assert mm_l1_sec5["title"] == "Squares (Visual)"
    assert mm_l2_sec5["title"] == "Squares and Cubes (Visual)"
    # Shared, unchanged metadata (questionCount/timeLimitSeconds) even though
    # the title/content differs -- per Shailesh's "keep the section totals
    # as-is, just the questions inside follow the new rules" instruction.
    assert mm_l1_sec5["questionCount"] == mm_l2_sec5["questionCount"] == 50
    assert mm_l1_sec5["timeLimitSeconds"] == mm_l2_sec5["timeLimitSeconds"] == 300

    mm_l1_sec7 = next(s for s in mm_l1["sections"] if s["key"] == "SEC7")
    mm_l2_sec7 = next(s for s in mm_l2["sections"] if s["key"] == "SEC7")
    assert mm_l1_sec7["title"] == "Cube Roots (Visual)"
    assert mm_l2_sec7["title"] == "Roots (Visual)"
    assert mm_l1_sec7["questionCount"] == mm_l2_sec7["questionCount"] == 50
    assert mm_l1_sec7["timeLimitSeconds"] == mm_l2_sec7["timeLimitSeconds"] == 300


def test_mm_l1_squares_section_is_digit_targeted_2_and_3():
    """2026-09-14 batch (Shailesh: "the squares section should have 2 digit
    and 3 digit sums only"). Cubes must be gone entirely -- only SQUARES
    concept questions, with base values (the number being squared) that are
    always exactly 2 or 3 digits, roughly evenly split across the section,
    and unique."""
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, "MM", "MM-L1", "Master Module Level 1")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)

    import json

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"], CompetitionMockQuestion.section_number == 5)
        .all()
    )
    assert len(questions) == 50
    assert {q.concept_family for q in questions} == {"SQUARES"}

    digit_counts = []
    signatures = set()
    for question in questions:
        metadata = json.loads(question.metadata_json or "{}")
        base_value = metadata.get("base_value")
        assert base_value is not None, f"no base_value in metadata for {question.id}"
        digit_count = len(str(base_value))
        assert digit_count in (2, 3), f"base {base_value} is not 2 or 3 digits"
        digit_counts.append(digit_count)
        signatures.add((question.operands_json, question.correct_answer))

    assert set(digit_counts) == {2, 3}  # both tiers actually present, not just one
    assert len(signatures) == len(questions)  # all 50 unique


def test_mm_l1_cube_roots_section_is_digit_targeted_4_5_6():
    """2026-09-14 batch (Shailesh: "Section 7 'Roots' should only include
    cube roots of 4 digit, 5 digit and 6 digit numbers"). Square Root must
    be gone entirely -- only CUBE_ROOT concept questions, radicand digit
    counts always in {4, 5, 6}, all three tiers actually present, unique."""
    db = _session()
    admin = _admin(db)
    _module, level = _module_and_level(db, "MM", "MM-L1", "Master Module Level 1")
    db.commit()

    payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == payload["mockExamId"], CompetitionMockQuestion.section_number == 7)
        .all()
    )
    assert len(questions) == 50
    assert {q.concept_family for q in questions} == {"CUBE_ROOT"}

    import json

    digit_counts = []
    signatures = set()
    for question in questions:
        metadata = json.loads(question.metadata_json or "{}")
        digit_count = metadata.get("radicand_digit_count")
        assert digit_count in (4, 5, 6), f"radicand digit count {digit_count} is not 4, 5, or 6"
        digit_counts.append(digit_count)
        signatures.add((question.question_text, question.correct_answer))

    assert set(digit_counts) == {4, 5, 6}  # all three tiers actually present
    assert len(signatures) == len(questions)  # all 50 unique


# 2026-09-15 (Shailesh): "while we are assigning practice papers to
# students for the competition we see the following error:
# ANNUAL_COMPETITION_SECTION_GENERATION_INCOMPLETE ... sectionKey: SEC5,
# slotIndex: 47, required: 50 ... this is shown and when we refresh it and
# try again it works ... we need to make sure this never happens ...
# whether we assign 5 or 25 sheets everything should work at once without
# any kind of issues." Root cause: IM-L3/IM-L4 Section 5 ("Squares
# (Visual)") is a single-concept pool (_IM_L3_SQUARES_POOL/
# _IM_L4_SQUARES_POOL -- no fallback-to-another-concept possible) drawing
# 50 unique values from GenerateSquares's 89-value domain
# (app/question_engine/im/operands.py, Base = randint(11, 99)). At
# ANNUAL_COMPETITION_SLOT_MAX_RETRIES = 10 the tightest slot (49 of 89
# already used) had a real, non-negligible chance of exhausting its retry
# budget before finding a fresh value. Raised to 50 (see the constant's own
# comment in annual_competition_paper_generation_service.py for the exact
# probability math). This test regenerates both levels' full papers
# repeatedly -- each run draws all the way to the same 49-of-89 tightest
# slot the bug report hit -- to give this fix real, repeated exercise
# rather than relying on a single lucky/unlucky random seed.
@pytest.mark.parametrize("level_code,module_code", [("IM-L3", "IM"), ("IM-L4", "IM")])
def test_im_squares_section_generates_reliably_across_many_runs(level_code, module_code):
    for _run in range(15):
        db = _session()
        admin = _admin(db)
        _module, level = _module_and_level(db, module_code, level_code, level_code)
        db.commit()

        payload = GenerateAnnualCompetitionLevelPaper(db, LevelId=level.id, CreatedBy=admin)
        squares_questions = (
            db.query(CompetitionMockQuestion)
            .filter(
                CompetitionMockQuestion.mock_exam_id == payload["mockExamId"],
                CompetitionMockQuestion.section_number == 5,
            )
            .all()
        )
        assert len(squares_questions) == 50
        signatures = {(q.operands_json, q.correct_answer) for q in squares_questions}
        assert len(signatures) == 50  # every one of the 50 is a genuinely fresh, unique square


def test_slot_max_retries_raised_to_survive_single_concept_pool_exhaustion():
    """Locks in the deliberate 10 -> 50 change with a visible test failure if
    it's ever accidentally lowered again -- see the constant's own comment
    for the full probability rationale."""
    from app.services.annual_competition_paper_generation_service import (
        ANNUAL_COMPETITION_SLOT_MAX_RETRIES,
    )

    assert ANNUAL_COMPETITION_SLOT_MAX_RETRIES >= 50


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
