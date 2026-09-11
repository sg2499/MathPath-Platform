"""Annual Competition paper registry -- 2026-09 build (Shailesh-approved
"build separately" architecture).

WHY THIS FILE EXISTS, SEPARATE FROM THE OTHER COMPETITION REGISTRIES:
competition_mock_generation_service.py's IM_COMPETITION_LEVEL_REGISTRY /
MM_COMPETITION_SECTION_CONCEPT_POOLS and pm_competition_mock_generation_
service.py's / ylm_competition_mock_generation_service.py's per-level
registries are read by THREE different features: the practice "Competition
Mock" feature, the real Annual Competition paper generator (previously,
before this file existed), and -- per Shailesh's 2026-07-22 design decision,
documented in assessment_blueprint_service.py -- Term Assessments for
IM/MM/PM/YLM ("assessments for these modules mirror the exact sections that
level's competition mock exam uses instead of a lesson-wise split... never a
copy, so an assessment's sections can never silently drift from that level's
mock exam sections"). Editing those shared registries to match the client's
Annual Competition gist therefore silently changes Term Assessment behavior
too (confirmed empirically: 10 pre-existing assessment tests broke when this
was tried).

Shailesh's explicit instruction (2026-09-09): "we should not remove or edit
anything but build the annual competition engine separately so that none of
the flows get affected and work as expected." This file is that separate
build's content: an independent registry, gist-exact, that the shared
registries above never reference and that never references them back
(except read-only imports of a handful of PURE, side-effect-free pool-
building functions from pm_competition_mock_generation_service.py -- see
below -- which read PM's own lesson-config tables, not the shared registry
dicts, and are safe, zero-risk reuse: no code path in that file is modified
by importing from it).

Source of truth for every number below: the client gist
(MathPath_Competition_Section_Scoring_Developer_Gist.docx, v1.0, 8 Sep 2026),
transcribed verbatim into docs/project-memory (see
ANNUAL_COMPETITION_ENGINE_SPEC.md in the working session's scratchpad for the
full level-by-level table this registry was built from). Marking is flat 1
mark per correct answer, 0 otherwise, no negative marking, everywhere --
never use conceptFamily SKILL_STACKER/CONCEPT_DRILL in any pool below (that
would trigger the shared engine's weighted-marks machinery, which must not
apply here).

CONCEPT POOL ENTRY SHAPE:
Every entry is a dict with a "generatorFamily" key selecting which
low-level, curriculum-independent question engine
annual_competition_paper_generation_service.py should call, plus whatever
fields that engine needs (forwarded close to verbatim -- see that file's
_GenerateOneAnnualQuestion for the exact per-family field mapping):
  "YLM"          -> question_engine.ylm (generate_ylm_question_set)
  "PM_L1"        -> question_engine.pm (generate_pm_question_set)
  "PM_L2"        -> question_engine.pm_l2 (generate_pm_l2_question_set)
  "PM_L3_ADD_LESS" / "PM_L3_MULTIPLY" -> question_engine.pm_l3
  "PM_L4_ADD_LESS" / "PM_L4_MULTIPLY" / "PM_L4_DIVIDE" -> question_engine.pm_l4
  "IM"           -> question_engine.im (GenerateImQuestionSet)
  "MM"           -> question_engine.mm (GenerateMmQuestionSet)
Every entry also carries a "title" (display/section-title use only).
"""
from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Read-only reuse of PM-L1/L2/L3/L4's pure concept-pool-building functions.
# These walk PM's own lesson-config tables (app/seed/preparatory_module_l*_
# config.py) -- not the shared competition registry dicts -- and have no
# side effects, so importing them creates zero coupling to the shared
# registry's own section/count/weighting logic. This is the same reuse
# already vetted during this build's research phase.
# ---------------------------------------------------------------------------
from app.services.pm_competition_mock_generation_service import (  # noqa: E402
    _addition_pool as _PmL1AdditionPool,
    _subtraction_pool as _PmL1SubtractionPool,
    _add_less_pool as _PmL1AddLessPool,
    _pm_l2_addless_pools as _PmL2AddLessPools,
    _pm_l3_addless_and_multiply_pools as _PmL3AddLessAndMultiplyPools,
    _pm_l4_addless_and_multiply_pools as _PmL4AddLessAndMultiplyPools,
)


def _Tagged(Entries: list[dict[str, Any]], GeneratorFamily: str) -> list[dict[str, Any]]:
    return [{**Entry, "generatorFamily": GeneratorFamily} for Entry in Entries]


# ---------------------------------------------------------------------------
# Level 1 -> YLM-L1
# ---------------------------------------------------------------------------
_YLM_L1_DIRECT_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "YLM", "title": "Direct Add-Less (Bead Recognition & Single Digit)", "lessonNumber": 1},
    {"generatorFamily": "YLM", "title": "Direct Add-Less (Bead Recognition Number 5, Mixed Digit)", "lessonNumber": 2},
]

# ---------------------------------------------------------------------------
# Level 2 -> PM-L1 -- "all concepts covered in Level 1" read as PM-L1's full
# existing Addition + Subtraction + Add/Less pool combined into one section
# (PM-L1 has no Abacus/Visual split of its own -- it's a single-technique
# level, matching the gist's single "Abacus" mode row for this level).
# ---------------------------------------------------------------------------
_PM_L1_ALL_CONCEPTS_POOL: list[dict[str, Any]] = _Tagged(
    _PmL1AdditionPool() + _PmL1SubtractionPool() + _PmL1AddLessPool(), "PM_L1"
)

# ---------------------------------------------------------------------------
# Level 3 -> PM-L2
# ---------------------------------------------------------------------------
_PM_L2_ABACUS_POOL_RAW, _PM_L2_VISUAL_POOL_RAW = _PmL2AddLessPools()
_PM_L2_ABACUS_POOL = _Tagged(_PM_L2_ABACUS_POOL_RAW, "PM_L2")
_PM_L2_VISUAL_POOL = _Tagged(_PM_L2_VISUAL_POOL_RAW, "PM_L2")

# ---------------------------------------------------------------------------
# Level 4 -> PM-L3
# ---------------------------------------------------------------------------
_PM_L3_ABACUS_POOL_RAW, _PM_L3_VISUAL_POOL_RAW, _PM_L3_MULTIPLY_POOL_RAW = _PmL3AddLessAndMultiplyPools()
_PM_L3_ABACUS_POOL = _Tagged(_PM_L3_ABACUS_POOL_RAW, "PM_L3_ADD_LESS")
_PM_L3_VISUAL_POOL = _Tagged(_PM_L3_VISUAL_POOL_RAW, "PM_L3_ADD_LESS")
_PM_L3_MULTIPLY_POOL = _Tagged(_PM_L3_MULTIPLY_POOL_RAW, "PM_L3_MULTIPLY")

# ---------------------------------------------------------------------------
# Level 5 -> PM-L4
# ---------------------------------------------------------------------------
_PM_L4_ABACUS_POOL_RAW, _PM_L4_VISUAL_POOL_RAW, _PM_L4_MULTIPLY_POOL_RAW = _PmL4AddLessAndMultiplyPools()
_PM_L4_ABACUS_POOL = _Tagged(_PM_L4_ABACUS_POOL_RAW, "PM_L4_ADD_LESS")
_PM_L4_VISUAL_POOL = _Tagged(_PM_L4_VISUAL_POOL_RAW, "PM_L4_ADD_LESS")
_PM_L4_MULTIPLY_POOL = _Tagged(_PM_L4_MULTIPLY_POOL_RAW, "PM_L4_MULTIPLY")
# "Division -- 3D / 1D" -- PM-L4's own workbook-verified exact-division
# spec for this digit width (see pm_l4/config.py's PML4DivideConfig
# docstring); digitWidth is metadata only, divisor/dividend ranges are what
# drive generation.
_PM_L4_DIVIDE_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "PM_L4_DIVIDE", "title": "3D ÷ 1D Division", "digitWidth": 3, "divisorMin": 2, "divisorMax": 9, "dividendMin": 100, "dividendMax": 999},
]

# ---------------------------------------------------------------------------
# Level 6 -> IM-L1. No borrowing/negative-answer requirement at this level
# per the gist, so IM's own engine is used throughout (no bias concern --
# see module docstring in annual_competition_paper_generation_service.py for
# why IM-L4/MM-L1/MM-L2's borrowing section routes through MM's engine
# instead).
# ---------------------------------------------------------------------------
_IM_L1_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 0, "magnitudeMax": 9},
    {"generatorFamily": "IM", "title": "Decimal Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 3, "magnitudeMin": 1, "magnitudeMax": 5},
    {"generatorFamily": "IM", "title": "Decimal Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 2, "magnitudeMax": 42},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 3, "magnitudeMax": 83},
]
# "Non-decimal Add/Less: 3D 2R + 2D 2R" -- a single mixed-row-width sum (2
# rows of 3-digit numbers + 2 rows of 2-digit numbers, combined into ONE
# addition problem), per the gist's own literal text. Uses the new
# rowWidthPlan mechanism added to im/operands.py's GenerateAddLess (2026-09,
# purely additive -- see that function's docstring).
_IM_L1_MIXED_ROW_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Add/Less (Visual) - 3D 2R + 2D 2R", "conceptFamily": "ADD_LESS", "rowWidthPlan": [(3, 2), (2, 2)]},
]
_IM_L1_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "2D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 1)},
    {"generatorFamily": "IM", "title": "3D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 1)},
]
_IM_L1_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "3D / 1D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 1)},
    {"generatorFamily": "IM", "title": "4D / 1D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 1)},
]

# ---------------------------------------------------------------------------
# Level 7 -> IM-L2
# ---------------------------------------------------------------------------
_IM_L2_DECIMAL_ADD_LESS_ABACUS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 246},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 6, "magnitudeMin": 10, "magnitudeMax": 89},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 31, "magnitudeMax": 3769},
]
_IM_L2_DECIMAL_ADD_LESS_VISUAL_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 1, "magnitudeMax": 9},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 6, "magnitudeMin": 10, "magnitudeMax": 90},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 6, "magnitudeMin": 0, "magnitudeMax": 4},
]
_IM_L2_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "2D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 1)},
    {"generatorFamily": "IM", "title": "3D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 1)},
    {"generatorFamily": "IM", "title": "4D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (4, 1)},
]
_IM_L2_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "4D / 1D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 1)},
    {"generatorFamily": "IM", "title": "3D / 1D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 1)},
    {"generatorFamily": "IM", "title": "3D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2)},
]

# ---------------------------------------------------------------------------
# Level 8 -> IM-L3
# ---------------------------------------------------------------------------
_IM_L3_DECIMAL_ADD_LESS_ABACUS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2},
]
_IM_L3_DECIMAL_ADD_LESS_VISUAL_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2},
    {"generatorFamily": "IM", "title": "Add/Less Sums (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 3, "magnitudeMin": 1, "magnitudeMax": 99},
]
_IM_L3_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "2D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 2)},
    {"generatorFamily": "IM", "title": "3D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 1)},
    {"generatorFamily": "IM", "title": "4D x 1D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (4, 1)},
]
_IM_L3_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "4D / 1D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 1)},
    {"generatorFamily": "IM", "title": "3D / 1D Division With Estimation", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 1), "isLongDivisionEstimation": True},
    {"generatorFamily": "IM", "title": "3D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2)},
]
_IM_L3_SQUARES_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Squares", "conceptFamily": "SQUARES"},
]

# ---------------------------------------------------------------------------
# gist "MM-1" -> platform IM-L4. Section 1's borrowing/negative-answer
# requirement routes through MM's engine (generatorFamily "MM") -- see the
# generation service's module docstring for why: IM's own borrowingMode=
# "POSITIVE_NEGATIVE" is deliberately (and correctly, for IM's own
# curriculum) biased ~90% negative, which does not satisfy the gist's
# "include positive and negative final answers" for a competition section;
# MM's MIXED_POSITIVE_NEGATIVE mode (fixed 2026-09-09, this same build) is
# a genuine, verified ~50/50 mix using the identical mechanism gist row
# "MM-2" (MM-L1/MM-L2) already uses for its own, identically-worded Section
# 1. Decimal multiplication/division and Percentage similarly route through
# MM's engine since IM's own dispatch has no DECIMAL_MULTIPLICATION /
# DECIMAL_DIVISION / PERCENTAGE_ADD_LESS support (and deliberately never
# will -- im/operands.py's own module docstring: "does not import anything
# from app.question_engine.mm"). This is a property of the NEW generation
# service only: it calls MM's already-shipped, unmodified public API
# (GenerateMmQuestionSet) exactly the way MM-L1/MM-L2 do, and does not
# touch im/operands.py to add these families.
#
# 2026-09-11 moderation pass -- reviewed and deliberately LEFT UNCHANGED:
# mmStagingQuestionNumber=9 (CHALLENGE stage) here is not an incidental
# difficulty choice the way it was for Squares/Cubes/Roots below. With no
# mmLessonNumber override this defaults to LessonNumber=5 (Band 1, the
# GENTLEST magnitude band MM has), and per the generation service's own
# comment on _GenerateMmQuestion, CHALLENGE stage + Band <=2 is specifically
# what makes MM's staging trick land on row_count=4 with ~4-digit operands
# -- i.e. it is what PRODUCES the "4D 4R" shape this pool's own title names,
# not excess difficulty layered on top of it. Lowering the stage here would
# shrink the row/digit count below the gist's literal "4D 4R" spec, not just
# soften the numbers within it. Flagging this rather than changing it.
# ---------------------------------------------------------------------------
_IM_L4_ADD_LESS_BORROWING_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add/Less 4D 4R (Abacus) - Borrowing, Positive/Negative Answers", "conceptFamily": "ADD_LESS", "borrowingMode": "MIXED_POSITIVE_NEGATIVE", "mmStagingQuestionNumber": 9},
]
_IM_L4_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 6, "magnitudeMin": 0, "magnitudeMax": 1},
    {"generatorFamily": "IM", "title": "Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 6, "magnitudeMin": 10, "magnitudeMax": 90},
]
_IM_L4_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "3D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 2)},
    {"generatorFamily": "IM", "title": "2D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 2)},
    {"generatorFamily": "MM", "title": "Decimal Multiplication", "conceptFamily": "DECIMAL_MULTIPLICATION", "multiplicationDigits": (2, 2)},
]
_IM_L4_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "4D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 2)},
    {"generatorFamily": "IM", "title": "5D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (5, 2)},
    {"generatorFamily": "MM", "title": "Decimal Division", "conceptFamily": "DECIMAL_DIVISION", "divisionDigits": (3, 2)},
    {"generatorFamily": "IM", "title": "3D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2)},
]
_IM_L4_SQUARES_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Squares", "conceptFamily": "SQUARES"},
]
_IM_L4_PERCENTAGE_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add Percentage Challenge", "conceptFamily": "PERCENTAGE_ADD_LESS"},
    {"generatorFamily": "MM", "title": "Less Percentage Challenge", "conceptFamily": "PERCENTAGE_ADD_LESS"},
]

# ---------------------------------------------------------------------------
# gist "MM-2" -> platform MM-L1 AND MM-L2 (identical content, both levels).
# Same "2026-09-11 moderation pass -- deliberately left unchanged" note as
# _IM_L4_ADD_LESS_BORROWING_POOL above applies here: mmStagingQuestionNumber
# =9 at the default Band-1 LessonNumber is what produces this pool's own
# "4D 4R" title, not incidental difficulty.
# ---------------------------------------------------------------------------
_MM_ADD_LESS_BORROWING_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add/Less 4D 4R (Abacus) - Borrowing, Positive/Negative Answers", "conceptFamily": "ADD_LESS", "borrowingMode": "MIXED_POSITIVE_NEGATIVE", "mmStagingQuestionNumber": 9},
]
_MM_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Decimal Add-Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS"},
]
_MM_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "3D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 2)},
    {"generatorFamily": "MM", "title": "3D x 3D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 3)},
    {"generatorFamily": "MM", "title": "2D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 2)},
    {"generatorFamily": "MM", "title": "Decimal Multiplication", "conceptFamily": "DECIMAL_MULTIPLICATION", "multiplicationDigits": (2, 2)},
]
_MM_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "4D ÷ 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 2)},
    {"generatorFamily": "MM", "title": "5D ÷ 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (5, 2)},
    {"generatorFamily": "MM", "title": "Decimal Division", "conceptFamily": "DECIMAL_DIVISION", "divisionDigits": (3, 2)},
    {"generatorFamily": "MM", "title": "3D ÷ 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2)},
]
# mmLessonNumber/mmStagingQuestionNumber here widen MM's own internal
# base-number range for Squares/Cubes/Roots -- both concept families' base
# range scales with MM's LessonBand/DifficultyStage (see mm/operands.py's
# _SquareBaseRange/_CubeBaseRange/_SquareRootBaseRange/_CubeRootBaseRange),
# and at the module's own default LessonNumber (mid-band) + a first-slot
# QuestionNumber (WARM_UP stage), Cubes/Cube-Root's achievable output space
# is too small to fill 25 in-paper-unique questions each (live-confirmed
# 2026-09-09 build session: only 8 unique Cubes / 7 unique Cube Roots at the
# un-staged default, reliably exhausted well before slot 25/50).
#
# 2026-09-11 moderation pass (Shailesh's "not too tough, standard/moderate"
# instruction): the original fix went straight to Band 5/lesson 25 +
# CHALLENGE stage (the highest of both knobs) purely to clear the pool-size
# floor above -- not because the client gist calls for maximum difficulty on
# these sections (unlike the Add/Less "4D 4R" pools below, these titles
# carry no digit-count spec of their own). That combination pushed Squares
# into a 400-900 base range and Cubes into 90-160 -- needlessly hard for a
# flat 1-mark, no-negative-marking paper.
#
# Lesson 20 (Band 4, one band down from 25/Band 5) keeps the CHALLENGE stage
# (still needed -- see below) but moderates the base range: Squares 150-350
# (was 400-900), Cubes 60-95 (was 90-160). An earlier attempt at moderating
# BOTH knobs together (Band 4 + ADVANCED stage/staging 7) looked fine on an
# isolated uniqueness probe (250-300 sample) but measurably flaked under the
# real collector's retry budget -- 1 failure in 8 real full-paper-generation
# runs (test_mm_l2_generates_via_competition_level_code_override_on_mm_l1_row,
# live-observed 2026-09-11) -- because Cubes'/Cube-Root's achievable output
# space at ADVANCED is close enough to the 25-per-concept floor that the
# in-paper duplicate-signature check occasionally exhausts it before all 10
# retries land a fresh question. Keeping staging at 9 (CHALLENGE) and only
# dropping the lesson band is the more moderate combination that stayed
# reliable: live-verified 2026-09-11 across 400 sampled seeds each --
# Squares 177 unique, Cubes 36 unique, Square Root 114 unique, Cube Root 41
# unique (all comfortably above both the 25/section-half floor AND the
# current-production Band-5 numbers for Cube Root specifically, which are
# tighter at only ~26 unique) -- plus 20/20 clean real full-paper-generation
# runs at this setting with no flakes. Retained the collector's own
# cross-concept fallback (a slot that can't get a fresh Cubes question falls
# back to Squares, and Cube Root to Square Root, both of which have ample
# headroom) as the same safety net it always was.
_MM_SQUARES_CUBES_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Squares", "conceptFamily": "SQUARES", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
    {"generatorFamily": "MM", "title": "Cubes", "conceptFamily": "CUBES", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
]
_MM_PERCENTAGE_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add Percentage Challenge", "conceptFamily": "PERCENTAGE_ADD_LESS"},
    {"generatorFamily": "MM", "title": "Less Percentage Challenge", "conceptFamily": "PERCENTAGE_ADD_LESS"},
]
# See the 2026-09-11 moderation note above _MM_SQUARES_CUBES_POOL -- same
# rationale and same live-verified (lesson 20 / staging 9) combination
# applied here for Square Root / Cube Root.
_MM_ROOTS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Square Root", "conceptFamily": "SQUARE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
    {"generatorFamily": "MM", "title": "Cube Root", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
]


# ---------------------------------------------------------------------------
# The registry itself: level code -> {"sections": [...], "sectionConceptPools": {...}}
# Section dict shape: key, number, title, mode ("ABACUS"/"VISUAL"),
# questionCount, timeLimitSeconds.
# ---------------------------------------------------------------------------
ANNUAL_COMPETITION_MARKS_PER_QUESTION = 1

ANNUAL_COMPETITION_LEVEL_REGISTRY: dict[str, dict[str, Any]] = {
    "YLM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Direct Sums (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 600},
        ],
        "sectionConceptPools": {"SEC1": _YLM_L1_DIRECT_POOL},
    },
    "PM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "All Concepts (Abacus)", "mode": "ABACUS", "questionCount": 100, "timeLimitSeconds": 600},
        ],
        "sectionConceptPools": {"SEC1": _PM_L1_ALL_CONCEPTS_POOL},
    },
    "PM-L2": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {"SEC1": _PM_L2_ABACUS_POOL, "SEC2": _PM_L2_VISUAL_POOL},
    },
    "PM-L3": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 600},
        ],
        "sectionConceptPools": {"SEC1": _PM_L3_ABACUS_POOL, "SEC2": _PM_L3_VISUAL_POOL, "SEC3": _PM_L3_MULTIPLY_POOL},
    },
    "PM-L4": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {"SEC1": _PM_L4_ABACUS_POOL, "SEC2": _PM_L4_VISUAL_POOL, "SEC3": _PM_L4_MULTIPLY_POOL, "SEC4": _PM_L4_DIVIDE_POOL},
    },
    "IM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Decimal Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L1_DECIMAL_ADD_LESS_POOL,
            "SEC2": _IM_L1_MIXED_ROW_ADD_LESS_POOL,
            "SEC3": _IM_L1_MULTIPLICATION_POOL,
            "SEC4": _IM_L1_DIVISION_POOL,
        },
    },
    "IM-L2": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Decimal Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L2_DECIMAL_ADD_LESS_ABACUS_POOL,
            "SEC2": _IM_L2_DECIMAL_ADD_LESS_VISUAL_POOL,
            "SEC3": _IM_L2_MULTIPLICATION_POOL,
            "SEC4": _IM_L2_DIVISION_POOL,
        },
    },
    "IM-L3": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Decimal Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC5", "number": 5, "title": "Squares (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L3_DECIMAL_ADD_LESS_ABACUS_POOL,
            "SEC2": _IM_L3_DECIMAL_ADD_LESS_VISUAL_POOL,
            "SEC3": _IM_L3_MULTIPLICATION_POOL,
            "SEC4": _IM_L3_DIVISION_POOL,
            "SEC5": _IM_L3_SQUARES_POOL,
        },
    },
    "IM-L4": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC5", "number": 5, "title": "Squares (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC6", "number": 6, "title": "Percentage (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L4_ADD_LESS_BORROWING_POOL,
            "SEC2": _IM_L4_DECIMAL_ADD_LESS_POOL,
            "SEC3": _IM_L4_MULTIPLICATION_POOL,
            "SEC4": _IM_L4_DIVISION_POOL,
            "SEC5": _IM_L4_SQUARES_POOL,
            "SEC6": _IM_L4_PERCENTAGE_POOL,
        },
    },
    "MM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC5", "number": 5, "title": "Squares and Cubes (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC6", "number": 6, "title": "Percentage (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC7", "number": 7, "title": "Roots (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _MM_ADD_LESS_BORROWING_POOL,
            "SEC2": _MM_DECIMAL_ADD_LESS_POOL,
            "SEC3": _MM_MULTIPLICATION_POOL,
            "SEC4": _MM_DIVISION_POOL,
            "SEC5": _MM_SQUARES_CUBES_POOL,
            "SEC6": _MM_PERCENTAGE_POOL,
            "SEC7": _MM_ROOTS_POOL,
        },
    },
}
# MM-L2 -- identical content to MM-L1 per the gist ("MM-2" maps to both
# platform levels with the same section/concept/count/time spec). A plain
# alias (not a deepcopy) is intentional: every pool entry here is treated as
# read-only data by the generation service, never mutated in place.
ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L2"] = ANNUAL_COMPETITION_LEVEL_REGISTRY["MM-L1"]


def GetAnnualCompetitionLevelConfig(LevelCode: str) -> dict[str, Any] | None:
    return ANNUAL_COMPETITION_LEVEL_REGISTRY.get(LevelCode)
