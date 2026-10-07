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
    # 2026-09-17 (Shailesh, Bloomers/Beginners digit-mix fix): "most of the
    # sums are single digit direct addition ... we need to have a mix of
    # both single, double and single-double mixed sums but direct add/less
    # only, the concept remains the same." Before this entry, the 50
    # questions split only 25/25 between pure single-digit (lessonNumber 1)
    # and single-and-double mixed (lessonNumber 2) -- no pure double-digit
    # tier existed, so roughly half the paper never went past single
    # digits. This third entry reuses lessonNumber 1's own DIRECT_ADD_LESS/
    # ADD_LESS/DIRECT-template base (the only two lessons in
    # YLM_LESSON_RULES that are DIRECT_ADD_LESS at all -- see
    # annual_competition_paper_generation_service.py's _GenerateYlmQuestion
    # for why lessonNumber 2 would work identically here: only digit_pattern
    # feeds the DIRECT template) and overrides just the digit pattern to
    # "2D" (operands.py's _direct_bases(): range(10, 100)) via the new,
    # opt-in digitPatternOverride key -- still direct add/less, still the
    # exact same concept, only the operand width changes. With 3 pool
    # entries, 50 questions now split ~17/17/16 across pure single-digit,
    # mixed single-double, and pure double-digit. Applies to both YLM-L0
    # (Bloomers) and YLM-L1 (Beginners) automatically, since both share this
    # exact pool object -- and to both OFFICIAL and PRACTICE generation,
    # since GenerateAnnualCompetitionLevelPaper reads this same registry
    # entry for either scope, with no official/practice branching in what
    # content gets selected.
    {"generatorFamily": "YLM", "title": "Direct Add-Less (Double Digit)", "lessonNumber": 1, "digitPatternOverride": "2D"},
]

# ---------------------------------------------------------------------------
# 2026-09-15 (Shailesh): "Bloomers (Below 8 Years)" / "Beginners (Above 8
# Years)" split. YLM-L1 (this file's existing entry below) is the age-8-and-
# above bracket, publicly labelled "Beginners (Above 8 Years)" -- its
# content, code, and every existing row referencing it are untouched. The
# new "Bloomers (Below 8 Years)" bracket is a pure content clone of YLM-L1
# under its own code, YLM-L0 -- same _YLM_L1_DIRECT_POOL object, same single
# "Direct Sums (Abacus)" section shape, so the two papers are guaranteed to
# never drift apart in content, only in who they're assigned to. YLM-L0 has
# no curriculum Level row of its own (same shape as MM-L2 -- see
# annual_competition_studio_service.py's _CURRICULUM_LOOKUP_LEVEL_CODE_
# OVERRIDES, which resolves YLM-L0's curriculum linkage through YLM-L1).
# Explicitly NOT age/DOB-driven: the admin assigns Beginners vs Bloomers
# manually (practice batches and the official event day alike), same as
# every other level -- see annual_competition_assignment_service.py's own
# docstring on why Student.dob is deliberately unused there.
# ---------------------------------------------------------------------------

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
# 2026-09-17 (Shailesh, relaying a teacher concern: "the abacus section and
# visual section of add less are seemingly tough ... get the difficulty
# level a little eased out either by reducing the number of digits or by
# reducing the number of rows ... 2 or 3 digits including the decimal in IM
# levels" -- "ease it, but keep it a real challenge, not impossible").
# IM-L2's Abacus pool used to range up to a 4-digit magnitude (31-3769) plus
# 2 decimal places on a 4-row sum -- by far the toughest entry in the whole
# IM/MM Add/Less set. Every entry here is now capped to a 2-digit whole
# part (10-99) + 2dp, fixed at 4 rows, matching the teacher's "2-3 digits
# including the decimal" guidance while staying meaningfully harder than
# IM-L1's own Abacus pool (which stays untouched -- already light).
_IM_L2_DECIMAL_ADD_LESS_ABACUS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 99},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 89},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 15, "magnitudeMax": 99},
]
# Visual pool was already lighter (magnitude never exceeded 2 digits) --
# only the row count needed easing, from up to 6 rows down to a 4-row cap,
# same "ease but keep it a real challenge" instruction.
_IM_L2_DECIMAL_ADD_LESS_VISUAL_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 1, "magnitudeMax": 9},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 90},
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 0, "magnitudeMax": 4},
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
# 2026-09-17 (Shailesh, teacher concern -- see IM-L2 Abacus pool's own
# comment above for the full instruction). These two pools used to carry NO
# explicit rowCount/magnitude overrides at all, so both fell through to
# im/operands.py's _AddLessRowPlan generic decimal fallback -- 4 rows,
# magnitude 10-999 (up to a 3-digit whole part) plus 2 decimal places.
# Given explicit overrides here now, same target as IM-L2's own Abacus fix:
# 2-digit whole part (10-99) + 2dp, 4 rows.
_IM_L3_DECIMAL_ADD_LESS_ABACUS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Abacus)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 99},
]
_IM_L3_DECIMAL_ADD_LESS_VISUAL_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 99},
    # Already within the eased target (2-digit magnitude, 3 rows) -- left
    # unchanged.
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
#
# 2026-09-17 UPDATE (Shailesh, relaying a teacher concern): "the abacus
# section ... of add less [is] seemingly tough ... ease it out ... either by
# reducing the number of digits or by reducing the number of rows ... still
# challenging but gettable." This supersedes (does not contradict) the
# 2026-09-11 note above -- that note was about not accidentally drifting
# away from the gist's literal spec via an unrelated lever (mmStagingQuestion
# Number/mmLessonNumber); this is a deliberate, explicitly-approved ease of
# that same spec in response to real classroom feedback. Kept the 4-digit
# magnitude (mmStagingQuestionNumber=9 / Band 1 untouched -- still the exact
# mechanism that produces "4D") and dropped one row instead, via the new,
# opt-in addLessRowCountOverride (mm/operands.py's _BuildBorrowingAddLess --
# every other MM caller is unaffected since it never sets this key). Title
# updated from "4D 4R" to "4D 3R" so it stays accurate to what's generated.
# ---------------------------------------------------------------------------
_IM_L4_ADD_LESS_BORROWING_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add/Less 4D 3R (Abacus) - Borrowing, Positive/Negative Answers", "conceptFamily": "ADD_LESS", "borrowingMode": "MIXED_POSITIVE_NEGATIVE", "mmStagingQuestionNumber": 9, "addLessRowCountOverride": 3},
]
# 2026-09-17 (Shailesh, teacher concern -- see IM-L4 Abacus pool's own
# comment above for the full instruction): row count eased from 6 down to
# 4, magnitude left untouched (already light -- 1 or 2 digits).
_IM_L4_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "Decimal Number Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 0, "magnitudeMax": 1},
    {"generatorFamily": "IM", "title": "Add/Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "isDecimal": True, "decimalPlaces": 2, "rowCount": 4, "magnitudeMin": 10, "magnitudeMax": 90},
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
#
# 2026-09-17 UPDATE (Shailesh, same teacher concern and same fix as
# _IM_L4_ADD_LESS_BORROWING_POOL above -- see that pool's own comment for
# the full rationale): row count eased from 4 to 3 via addLessRowCountOverride,
# 4-digit magnitude untouched, title updated to "4D 3R" to match.
# ---------------------------------------------------------------------------
_MM_ADD_LESS_BORROWING_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Add/Less 4D 3R (Abacus) - Borrowing, Positive/Negative Answers", "conceptFamily": "ADD_LESS", "borrowingMode": "MIXED_POSITIVE_NEGATIVE", "mmStagingQuestionNumber": 9, "addLessRowCountOverride": 3},
]
# 2026-09-17 (Shailesh, teacher concern -- see above): this was the single
# toughest Add/Less spot in the whole IM/MM set -- _DecimalVisualAddLessWholeDigitPlan
# (mm/operands.py) randomly produces either 3-4 rows all at 4 digits, or 5
# rows mixing 2/3/4-digit values, each with 2 decimal places, with no
# override hook at all. maxWholeDigits/rowCountCap (new, opt-in
# GeneratorConfig keys, mm/operands.py) cap that plan to 2-3 digit values
# and 4 rows -- every other MM caller of this decimal-visual path (which
# never sets these keys) is unaffected.
_MM_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Decimal Add-Less (Visual)", "conceptFamily": "DECIMAL_ADD_LESS", "maxWholeDigits": 3, "rowCountCap": 4},
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

# MM-1-only pools (2026-09-14 batch, Shailesh: "the squares section should
# have 2 digit and 3 digit sums only... Cube roots section -> cube roots
# of 4 digit, 5 digit and 6 digit numbers"). MM-2 keeps the original
# _MM_SQUARES_CUBES_POOL/_MM_ROOTS_POOL above untouched (see MM-L2's own
# registry entry below) -- MM-1 and MM-2 are now two fully independent
# papers, not two codes for the same content.
#
# The title strings below drive _SquareBaseDigitTargets/
# _CubeRootRadicandDigitTargets's title-parsing mechanism in
# mm/operands.py -- the digit-tiered cube-root titles are the exact same
# convention already proven in production via competition_mock_generation_
# service.py's MM_CUBES_ROOTS pool. Uniqueness is comfortable for both: 90
# 2-digit + 900 3-digit = 990 unique squares against 50 questions; ~12+25+53
# = 90 unique cube roots across the three 4/5/6-digit tiers against 50
# questions (see the 2026-09-11 moderation note above for the matching
# MM-2/Competition-Mock analysis this mirrors).
# Two separate single-digit-target entries, NOT one combined "2 & 3 digit"
# title -- MM's own Annual Competition staging convention
# (mmStagingQuestionNumber, see _GenerateMmQuestion's own docstring) always
# requests a fixed-size batch and takes the LAST question from it, so the
# internal QuestionNumber a within-title digit-alternation scheme would
# cycle on is always the same value on every call, not varying 1..50 the
# way a naive reading of GenerateSquares/GenerateSquareRoot's cycling logic
# suggests. Splitting into two entries lets the section COLLECTOR alternate
# between them across the 50 slots instead (live-verified 2026-09-14: 50/50
# split, all base values 2-digit or 3-digit, 50 unique) -- exactly the same
# pattern _MM_L1_CUBE_ROOTS_POOL below already uses for its three digit
# tiers, and the one that actually works under this staging convention.
_MM_L1_SQUARES_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Squares 2 Digit Number", "conceptFamily": "SQUARES", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
    {"generatorFamily": "MM", "title": "Squares 3 Digit Number", "conceptFamily": "SQUARES", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
]
_MM_L1_CUBE_ROOTS_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "Cube Root 4 Digit Number", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
    {"generatorFamily": "MM", "title": "Cube Root 5 Digit Number", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
    {"generatorFamily": "MM", "title": "Cube Root 6 Digit Number", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9},
]


# ---------------------------------------------------------------------------
# The registry itself: level code -> {"sections": [...], "sectionConceptPools": {...}}
# Section dict shape: key, number, title, mode ("ABACUS"/"VISUAL"),
# questionCount, timeLimitSeconds.
# ---------------------------------------------------------------------------
ANNUAL_COMPETITION_MARKS_PER_QUESTION = 1

# ---------------------------------------------------------------------------
# 2026-10-07 (Shailesh): the per-level question rules for the Annual
# Competition, official and practice papers alike -- "these need to be
# pristine, accurate and exact". The full request, the answers given to the
# open questions ("go ahead with the default answers") and the measurements
# behind every line are in the project note
# claude/mathpath-annual-question-rules-oct7-findings.md.
#
# Three registry keys are new, all read only by the Annual Competition
# collector (annual_competition_paper_generation_service.py) and never
# passed to a module engine:
#   quota                 how many of a section's questions this entry gets
#                         (every entry of a pool carries one, or none do --
#                         then the section is split equally as before)
#   mixKey                the pattern name used when a section is mixed
#                         (defaults to the entry's title)
#   annualNeverBelowZero  the first number is never negative and the running
#                         total never drops below zero
# and two section keys:
#   mixMaxRun             mix the section's patterns through the paper, no
#                         pattern more than this many questions in a row
#   strictQuotas          a pattern that cannot fill its quota fails the
#                         paper loudly instead of quietly borrowing sums
#                         from the next pattern (how MM-2's roots came out
#                         34 square roots / 16 cube roots instead of 25 / 25)
# ---------------------------------------------------------------------------
def _SplitByWeights(Total: int, Weights: list[int]) -> list[int]:
    """Total shared out in proportion to Weights, whole numbers that add up
    to exactly Total (largest remainder first, earlier entry on a tie)."""
    WeightSum = sum(Weights)
    Exact = [Total * Weight / WeightSum for Weight in Weights]
    Shares = [int(Value) for Value in Exact]
    Order = sorted(range(len(Weights)), key=lambda Index: (-(Exact[Index] - Shares[Index]), Index))
    for Index in Order[: Total - sum(Shares)]:
        Shares[Index] += 1
    return Shares


# Of every 25 PM-1 / PM-2 sums of one shape: 4 direct only, 7 that use the
# complement of 5, 7 that use the complement of 10, 7 that use both --
# "PM 1 should include all concepts, current Q paper has only direct sums".
_BEAD_PROFILE_WEIGHTS: list[tuple[str, int, str]] = [
    ("DIRECT", 4, "DIRECT_ADD_LESS"),
    ("FIVE", 7, "COMPLEMENT_OF_5"),
    ("TEN", 7, "COMPLEMENT_OF_10"),
    ("ALL", 7, "MIXED_REVISION"),
]


def _BeadSumPool(Total: int, Shapes: list[tuple[str, list[int]]], MaxTotal: int = 999) -> list[dict[str, Any]]:
    """One entry per (row shape, technique mix) with its exact quota: Total
    split equally over the shapes, each shape's share split 4 : 7 : 7 : 7
    over the technique mixes."""
    Pool: list[dict[str, Any]] = []
    ShapeShares = _SplitByWeights(Total, [1] * len(Shapes))
    for (Title, Shape), ShapeShare in zip(Shapes, ShapeShares):
        ProfileShares = _SplitByWeights(ShapeShare, [Weight for _Profile, Weight, _Family in _BEAD_PROFILE_WEIGHTS])
        for (Profile, _Weight, ConceptFamily), Quota in zip(_BEAD_PROFILE_WEIGHTS, ProfileShares):
            if Quota <= 0:
                continue
            Pool.append({
                "generatorFamily": "ANNUAL_RULE", "annualRuleKind": "BEAD_SUM", "title": Title, "mixKey": Title,
                "conceptFamily": ConceptFamily, "beadShape": list(Shape), "beadProfile": Profile,
                "beadMaxTotal": MaxTotal, "quota": Quota,
            })
    return Pool


# Bloomers and Beginners: "make direct sums with mixed digit like 5+2+2,
# 9-5-2, 3+10+5, 12-1+7, 12+55-50, 22+15-27, 50+40-60, 31-21+27. Mix the
# patterns don't keep single digit sums together. Mix all the patterns and
# present". Three rows, every row one or two digits, every bead move
# direct, answers 0 to 99. A quarter all single digit, a quarter single and
# double together, half all double -- the proportions of his own eight
# examples (2 : 2 : 4). Beginners keeps sharing Bloomers' paper design
# (Shailesh, 2026-10-07: default accepted).
def _DirectSumsPool(Total: int) -> list[dict[str, Any]]:
    SingleShare, MixedShare, DoubleShare = _SplitByWeights(Total, [1, 1, 2])
    MixedShapes = [[1, 2, 1], [2, 1, 1], [1, 1, 2], [2, 2, 1], [2, 1, 2], [1, 2, 2]]
    Groups: list[tuple[str, str, list[int], int]] = [("Direct Add-Less (Single Digit)", "SINGLE", [1, 1, 1], SingleShare)]
    for Shape, Share in zip(MixedShapes, _SplitByWeights(MixedShare, [1] * len(MixedShapes))):
        Groups.append(("Direct Add-Less (Single & Double Digit)", "MIXED", Shape, Share))
    Groups.append(("Direct Add-Less (Double Digit)", "DOUBLE", [2, 2, 2], DoubleShare))
    return [
        {
            "generatorFamily": "ANNUAL_RULE", "annualRuleKind": "BEAD_SUM", "title": Title, "mixKey": MixKey,
            "conceptFamily": "DIRECT_ADD_LESS", "beadShape": Shape, "beadProfile": "DIRECT", "beadMaxTotal": 99,
            "quota": Quota,
        }
        for Title, MixKey, Shape, Quota in Groups if Quota > 0
    ]


_ANNUAL_DIRECT_SUMS_POOL = _DirectSumsPool(100)

# PM-1 and PM-2 Abacus: "Abacus sums should not be of single digits. A mix
# of 2d 3 rows + 1d 2 rows / 2d+2d+2d+2d (2digit, 4rows) / 3d 3 rows /
# 2d 2rows + 3d 1row". Rows come in the order written.
_PM_ABACUS_SUM_SHAPES: list[tuple[str, list[int]]] = [
    ("Add/Less 2D,3R & 1D,2R (Abacus)", [2, 2, 2, 1, 1]),
    ("Add/Less 2D,4R (Abacus)", [2, 2, 2, 2]),
    ("Add/Less 3D,3R (Abacus)", [3, 3, 3]),
    ("Add/Less 2D,2R & 3D,1R (Abacus)", [2, 2, 3]),
]
# PM-2 Visual: "2d 1 rows +1d 2 rows / 2d 4rows / 3d 1 row + 2d 2 rows /
# 2d 2rows + 3d 1row+ 1d 1row".
_PM_L2_VISUAL_SUM_SHAPES: list[tuple[str, list[int]]] = [
    ("Add/Less 2D,1R & 1D,2R (Visual)", [2, 1, 1]),
    ("Add/Less 2D,4R (Visual)", [2, 2, 2, 2]),
    ("Add/Less 3D,1R & 2D,2R (Visual)", [3, 2, 2]),
    ("Add/Less 2D,2R & 3D,1R & 1D,1R (Visual)", [2, 2, 3, 1]),
]
_PM_L1_ANNUAL_ABACUS_POOL = _BeadSumPool(100, _PM_ABACUS_SUM_SHAPES)
_PM_L2_ANNUAL_ABACUS_POOL = _BeadSumPool(50, _PM_ABACUS_SUM_SHAPES)
_PM_L2_ANNUAL_VISUAL_POOL = _BeadSumPool(50, _PM_L2_VISUAL_SUM_SHAPES)

# PM-3 Visual: "from visual sums remove 2d 2r sums". They are what the
# level's "3D,2R & 2D,2R" sheet produces when it is asked for one sum at a
# time, so that entry is left out of the competition paper; the other five
# shapes share its questions.
_PM_L3_ANNUAL_VISUAL_POOL = [
    Entry for Entry in _PM_L3_VISUAL_POOL if Entry.get("title") != "Add/Less 3D,2R & 2D,2R (Visual)"
]

# PM-3 and PM-4 multiplication: "mix the multiplication sums now it is
# multiply with 2 then 3 then 4 serially change the order like 66x 2,
# 54 x 9, 86 x 4, 95 x 7". One entry per multiplier 2 to 9 with an equal
# share, any two-digit number (his own example goes to 95; the old ceiling
# was 90), mixed so the same multiplier never comes twice running.
def _MixedMultiplyPool(GeneratorFamily: str, ConceptFamily: str, Total: int) -> list[dict[str, Any]]:
    Multipliers = list(range(2, 10))
    return [
        {
            "generatorFamily": GeneratorFamily, "title": "2D X 1D Multiplication", "conceptFamily": ConceptFamily,
            "numberMin": 11, "numberMax": 99, "multiplierMin": Multiplier, "multiplierMax": Multiplier,
            "mixKey": f"X{Multiplier}", "quota": Quota,
        }
        for Multiplier, Quota in zip(Multipliers, _SplitByWeights(Total, [1] * len(Multipliers)))
    ]


_PM_L3_ANNUAL_MULTIPLY_POOL = _MixedMultiplyPool("PM_L3_MULTIPLY", "PM_L3_MULTIPLICATION", 100)
_PM_L4_ANNUAL_MULTIPLY_POOL = _MixedMultiplyPool("PM_L4_MULTIPLY", "PM_L4_MULTIPLICATION", 100)


# IM-1 "Abacus /Visual add less Section - Remove negative numbers in the
# start of the sum, no borrowing sums in decimal and normal number to be
# given"; IM-2 "Visual add less sums should not have negative numbers in the
# beginning & avoid borrowing concept in visuals".
def _NeverBelowZero(Entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**Entry, "annualNeverBelowZero": True} for Entry in Entries]


_IM_L1_ANNUAL_DECIMAL_ADD_LESS_POOL = _NeverBelowZero(_IM_L1_DECIMAL_ADD_LESS_POOL)
_IM_L1_ANNUAL_MIXED_ROW_ADD_LESS_POOL = _NeverBelowZero(_IM_L1_MIXED_ROW_ADD_LESS_POOL)
_IM_L2_ANNUAL_DECIMAL_ADD_LESS_VISUAL_POOL = _NeverBelowZero(_IM_L2_DECIMAL_ADD_LESS_VISUAL_POOL)

# IM-2: "4d x1d to be removed from multiplication. 3d/2d to be removed."
_IM_L2_ANNUAL_MULTIPLICATION_POOL = [Entry for Entry in _IM_L2_MULTIPLICATION_POOL if Entry["multiplicationDigits"] != (4, 1)]
_IM_L2_ANNUAL_DIVISION_POOL = [Entry for Entry in _IM_L2_DIVISION_POOL if Entry["divisionDigits"] != (3, 2)]

# IM-3: "remove 2dx2d rest are ok. Also remove squares from IM-3" -- the
# Squares section itself is gone from the level's section list below.
_IM_L3_ANNUAL_MULTIPLICATION_POOL = [Entry for Entry in _IM_L3_MULTIPLICATION_POOL if Entry["multiplicationDigits"] != (2, 2)]

# IM-4: "remove 3dx2d multiplication, decimal number multiplication. decimal
# number division. Division with estimation for patterns 3d/1d, 4d/1d,
# 3de/2d can be included".
_IM_L4_ANNUAL_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "2D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 2)},
]
_IM_L4_ANNUAL_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "IM", "title": "4D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 2)},
    {"generatorFamily": "IM", "title": "5D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (5, 2)},
    {"generatorFamily": "IM", "title": "3D / 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2)},
    {"generatorFamily": "IM", "title": "3D / 1D Division With Estimation", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 1), "isLongDivisionEstimation": True},
    {"generatorFamily": "IM", "title": "4D / 1D Division With Estimation", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 1), "isLongDivisionEstimation": True},
    {"generatorFamily": "IM", "title": "3D / 2D Division With Estimation", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (3, 2), "isLongDivisionEstimation": True},
]

# "For decimal number visual across IM3 to MM 2 keep 2 numbers after the
# decimal point". IM-3 and IM-4 already do; MM-1 and MM-2 showed one
# (272.1). addLessDecimalPlacesOverride is an opt-in key of the Master
# Module engine, default off, so 272.1 becomes 272.14 here and nowhere else.
_MM_ANNUAL_DECIMAL_ADD_LESS_POOL: list[dict[str, Any]] = [
    {**Entry, "addLessDecimalPlacesOverride": 2} for Entry in _MM_DECIMAL_ADD_LESS_POOL
]

# MM-1's own patterns (it shared MM-2's until now):
#   Multiplication  3dx2d, 2dx2d, 4dx1d decimal (24.16 x 0.04),
#                   5dx1d decimal (231.15 x 0.08)
#   Division        4d/2d, 5d/2d, decimal 4d/1d (81.37 / 8), 5d/1d (110.31 / 4)
#   Add Percentage  4d x 2d (97.03 x 29%), 3d x 2d (3.88 x 78%)
#   Less Percentage 4d x 2d (70.37 - 81%), 3d x 2d (4.47 - 39%)
_MM_L1_ANNUAL_MULTIPLICATION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "3D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (3, 2), "quota": 25},
    {"generatorFamily": "MM", "title": "2D x 2D Multiplication", "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "multiplicationDigits": (2, 2), "quota": 25},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "DECIMAL_MULTIPLICATION", "title": "Decimal Multiplication 4D x 1D", "conceptFamily": "DECIMAL_MULTIPLICATION", "decimalWholeDigits": 2, "quota": 25},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "DECIMAL_MULTIPLICATION", "title": "Decimal Multiplication 5D x 1D", "conceptFamily": "DECIMAL_MULTIPLICATION", "decimalWholeDigits": 3, "quota": 25},
]
_MM_L1_ANNUAL_DIVISION_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "MM", "title": "4D ÷ 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (4, 2), "quota": 25},
    {"generatorFamily": "MM", "title": "5D ÷ 2D Division", "conceptFamily": "WHOLE_NUMBER_DIVISION", "divisionDigits": (5, 2), "quota": 25},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "DECIMAL_DIVISION", "title": "Decimal Division 4D ÷ 1D", "conceptFamily": "DECIMAL_DIVISION", "decimalWholeDigits": 2, "quota": 25},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "DECIMAL_DIVISION", "title": "Decimal Division 5D ÷ 1D", "conceptFamily": "DECIMAL_DIVISION", "decimalWholeDigits": 3, "quota": 25},
]
_MM_L1_ANNUAL_PERCENTAGE_POOL: list[dict[str, Any]] = [
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "PERCENTAGE", "title": "Add Percentage 4D x 2D", "conceptFamily": "PERCENTAGE_ADD_LESS", "percentageMode": "ADD_PERCENTAGE", "decimalWholeDigits": 2, "quota": 13},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "PERCENTAGE", "title": "Add Percentage 3D x 2D", "conceptFamily": "PERCENTAGE_ADD_LESS", "percentageMode": "ADD_PERCENTAGE", "decimalWholeDigits": 1, "quota": 12},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "PERCENTAGE", "title": "Less Percentage 4D x 2D", "conceptFamily": "PERCENTAGE_ADD_LESS", "percentageMode": "LESS_PERCENTAGE", "decimalWholeDigits": 2, "quota": 13},
    {"generatorFamily": "ANNUAL_RULE", "annualRuleKind": "PERCENTAGE", "title": "Less Percentage 3D x 2D", "conceptFamily": "PERCENTAGE_ADD_LESS", "percentageMode": "LESS_PERCENTAGE", "decimalWholeDigits": 1, "quota": 12},
]

# MM-2: "Keep square root & cube root 25, 25 each. Same for Squares &
# Cubes". The cube-root half used to run dry at 16 (only the answers 30 to
# 45 were ever drawn), so it now draws cube roots of 5-digit and 6-digit
# numbers, answers 22 to 99 (Shailesh, 2026-10-07: default accepted). The
# engine reads the digit count from the entry's title, so the two entries
# are titled for the engine and carry "Cube Root" as the name every report
# has always shown for them.
_MM_L2_ANNUAL_SQUARES_CUBES_POOL: list[dict[str, Any]] = [
    {**_MM_SQUARES_CUBES_POOL[0], "quota": 25},
    {**_MM_SQUARES_CUBES_POOL[1], "quota": 25},
]
_MM_L2_ANNUAL_ROOTS_POOL: list[dict[str, Any]] = [
    {**_MM_ROOTS_POOL[0], "quota": 25},
    {"generatorFamily": "MM", "title": "Cube Root 5 Digit Number", "conceptTitle": "Cube Root", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9, "quota": 13},
    {"generatorFamily": "MM", "title": "Cube Root 6 Digit Number", "conceptTitle": "Cube Root", "conceptFamily": "CUBE_ROOT", "mmLessonNumber": 20, "mmStagingQuestionNumber": 9, "quota": 12},
]

# A level's section that the competition paper no longer has, kept by name
# so a result or report of an attempt taken before it was removed still
# shows it properly. IM-3's Squares section was removed on 2026-10-07.
ANNUAL_COMPETITION_RETIRED_SECTION_TITLES: dict[str, dict[int, str]] = {
    "IM-L3": {5: "Squares (Visual)"},
}


ANNUAL_COMPETITION_LEVEL_REGISTRY: dict[str, dict[str, Any]] = {
    # "Bloomers (Below 8 Years)" -- content-identical clone of YLM-L1 below,
    # see the comment above _YLM_L1_DIRECT_POOL for why.
    #
    # 2026-09-22 (Shailesh): "50 is too less and the students are easily
    # able to complete all 50 of them even before the 10 min timer gets
    # exhausted, so bumping it to 100 would make it challenging and fun."
    # questionCount 50 -> 100, timeLimitSeconds UNCHANGED at 600 (10 min) --
    # per Shailesh's own framing, the point is to make the existing 10-min
    # window actually challenging, not to also extend it. Rules, concepts
    # and the uniqueness-within-a-paper guarantee are untouched: the split
    # across _YLM_L1_DIRECT_POOL's three concepts (pure single-digit, mixed,
    # pure double-digit) simply rescales from ~17/17/16 to ~34/33/33, and
    # _CollectAnnualCompetitionQuestions's paper-wide UsedSignatures dedup
    # (annual_competition_paper_generation_service.py) already refuses to
    # ever repeat a question within one paper, hard-failing loudly instead
    # of duplicating if it ever couldn't -- confirmed empirically safe at
    # 100 questions via 30 live dry-run generations (15 per level, distinct
    # seeds each) against this exact registry before this change shipped.
    "YLM-L0": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Direct Sums (Abacus)", "mode": "ABACUS", "questionCount": 100, "timeLimitSeconds": 600, "mixMaxRun": 2, "strictQuotas": True},
        ],
        "sectionConceptPools": {"SEC1": _ANNUAL_DIRECT_SUMS_POOL},
    },
    # "Beginners (Above 8 Years)" -- publicly-displayed name only, see
    # ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS below. Code/content unchanged.
    #
    # 2026-09-22 (Shailesh): same 50 -> 100 bump as YLM-L0 above, same
    # reasoning and same verification -- see the comment there.
    "YLM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Direct Sums (Abacus)", "mode": "ABACUS", "questionCount": 100, "timeLimitSeconds": 600, "mixMaxRun": 2, "strictQuotas": True},
        ],
        "sectionConceptPools": {"SEC1": _ANNUAL_DIRECT_SUMS_POOL},
    },
    "PM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "All Concepts (Abacus)", "mode": "ABACUS", "questionCount": 100, "timeLimitSeconds": 600, "mixMaxRun": 2, "strictQuotas": True},
        ],
        "sectionConceptPools": {"SEC1": _PM_L1_ANNUAL_ABACUS_POOL},
    },
    "PM-L2": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300, "mixMaxRun": 2, "strictQuotas": True},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300, "mixMaxRun": 2, "strictQuotas": True},
        ],
        "sectionConceptPools": {"SEC1": _PM_L2_ANNUAL_ABACUS_POOL, "SEC2": _PM_L2_ANNUAL_VISUAL_POOL},
    },
    "PM-L3": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            # 2026-09-14 batch (Shailesh): renamed from "Multiplication
            # (Visual)" to "Multiplication (Abacus)" -- title AND mode both
            # changed together so the mode pill matches the title (mode is a
            # pure display badge, never a functional switch -- see
            # frontend/app/student/competition/annual/attempt/[attemptId]/
            # page.tsx's sectionMode usage). The underlying question pool
            # (_PM_L3_MULTIPLY_POOL) is untouched: "nothing else in that
            # paper changes."
            {"key": "SEC3", "number": 3, "title": "Multiplication (Abacus)", "mode": "ABACUS", "questionCount": 100, "timeLimitSeconds": 600, "mixMaxRun": 1, "strictQuotas": True},
        ],
        "sectionConceptPools": {"SEC1": _PM_L3_ABACUS_POOL, "SEC2": _PM_L3_ANNUAL_VISUAL_POOL, "SEC3": _PM_L3_ANNUAL_MULTIPLY_POOL},
    },
    "PM-L4": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300, "mixMaxRun": 1, "strictQuotas": True},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {"SEC1": _PM_L4_ABACUS_POOL, "SEC2": _PM_L4_VISUAL_POOL, "SEC3": _PM_L4_ANNUAL_MULTIPLY_POOL, "SEC4": _PM_L4_DIVIDE_POOL},
    },
    "IM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Decimal Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L1_ANNUAL_DECIMAL_ADD_LESS_POOL,
            "SEC2": _IM_L1_ANNUAL_MIXED_ROW_ADD_LESS_POOL,
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
            "SEC2": _IM_L2_ANNUAL_DECIMAL_ADD_LESS_VISUAL_POOL,
            "SEC3": _IM_L2_ANNUAL_MULTIPLICATION_POOL,
            "SEC4": _IM_L2_ANNUAL_DIVISION_POOL,
        },
    },
    "IM-L3": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Decimal Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
        ],
        # 2026-10-07 (Shailesh): "Also remove squares from IM-3". Section 5
        # and its pool entry are gone outright, exactly like IM-L4's
        # Percentage section on 2026-09-14: 300 questions / 1200s, down from
        # 350 / 1500 -- every total is summed live from this list.
        "sectionConceptPools": {
            "SEC1": _IM_L3_DECIMAL_ADD_LESS_ABACUS_POOL,
            "SEC2": _IM_L3_DECIMAL_ADD_LESS_VISUAL_POOL,
            "SEC3": _IM_L3_ANNUAL_MULTIPLICATION_POOL,
            "SEC4": _IM_L3_DIVISION_POOL,
        },
    },
    # 2026-09-14 batch (Shailesh): "for the IM-L4 paper, remove Section 6
    # Percentage entirely". Section 6 and its pool entry are gone outright
    # (not just emptied) -- total questions/time recompute live from
    # whatever sections remain (see TotalDurationSeconds/TotalQuestionCount
    # in annual_competition_paper_generation_service.py, which always sums
    # the live Sections list rather than a hardcoded total): 350 questions /
    # 1500s, down from 400/1800.
    "IM-L4": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC5", "number": 5, "title": "Squares (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _IM_L4_ADD_LESS_BORROWING_POOL,
            "SEC2": _IM_L4_DECIMAL_ADD_LESS_POOL,
            "SEC3": _IM_L4_ANNUAL_MULTIPLICATION_POOL,
            "SEC4": _IM_L4_ANNUAL_DIVISION_POOL,
            "SEC5": _IM_L4_SQUARES_POOL,
        },
    },
    # 2026-09-14 batch (Shailesh): "the section names need to be adjusted...
    # Squares (Method), Cube Roots (Method)". Section 5 is Squares-only now
    # (Cubes removed entirely, 2/3-digit bases only); Section 7 is
    # Cube-Roots-only now (Square Root removed entirely, 4/5/6-digit
    # radicands). questionCount/timeLimitSeconds are unchanged for both --
    # only the questions inside follow the new rules, per Shailesh's own
    # instruction to keep section totals as-is when a section's content
    # changes conceptually rather than by removal.
    #
    # MM-1 and MM-2 used to be a plain alias (one dict, two codes) -- as of
    # this batch they are two fully independent registry entries (Shailesh:
    # "in reality they are two distinct papers and are different from each
    # other"). MM-L2 (below) keeps the ORIGINAL content this level always
    # had -- Squares AND Cubes, Square Root AND Cube Root -- byte-for-byte
    # unchanged; only MM-L1 gets the new content here.
    "MM-L1": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300, "strictQuotas": True},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300, "strictQuotas": True},
            {"key": "SEC5", "number": 5, "title": "Squares (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC6", "number": 6, "title": "Percentage (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300, "strictQuotas": True},
            {"key": "SEC7", "number": 7, "title": "Cube Roots (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
        ],
        "sectionConceptPools": {
            "SEC1": _MM_ADD_LESS_BORROWING_POOL,
            "SEC2": _MM_ANNUAL_DECIMAL_ADD_LESS_POOL,
            "SEC3": _MM_L1_ANNUAL_MULTIPLICATION_POOL,
            "SEC4": _MM_L1_ANNUAL_DIVISION_POOL,
            "SEC5": _MM_L1_SQUARES_POOL,
            "SEC6": _MM_L1_ANNUAL_PERCENTAGE_POOL,
            "SEC7": _MM_L1_CUBE_ROOTS_POOL,
        },
    },
    "MM-L2": {
        "sections": [
            {"key": "SEC1", "number": 1, "title": "Add/Less (Abacus)", "mode": "ABACUS", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC2", "number": 2, "title": "Decimal Add/Less (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC3", "number": 3, "title": "Multiplication (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC4", "number": 4, "title": "Division (Visual)", "mode": "VISUAL", "questionCount": 100, "timeLimitSeconds": 300},
            {"key": "SEC5", "number": 5, "title": "Squares and Cubes (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300, "strictQuotas": True},
            {"key": "SEC6", "number": 6, "title": "Percentage (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300},
            {"key": "SEC7", "number": 7, "title": "Roots (Visual)", "mode": "VISUAL", "questionCount": 50, "timeLimitSeconds": 300, "strictQuotas": True},
        ],
        "sectionConceptPools": {
            "SEC1": _MM_ADD_LESS_BORROWING_POOL,
            "SEC2": _MM_ANNUAL_DECIMAL_ADD_LESS_POOL,
            "SEC3": _MM_MULTIPLICATION_POOL,
            "SEC4": _MM_DIVISION_POOL,
            "SEC5": _MM_L2_ANNUAL_SQUARES_CUBES_POOL,
            "SEC6": _MM_PERCENTAGE_POOL,
            "SEC7": _MM_L2_ANNUAL_ROOTS_POOL,
        },
    },
}


def GetAnnualCompetitionLevelConfig(LevelCode: str) -> dict[str, Any] | None:
    return ANNUAL_COMPETITION_LEVEL_REGISTRY.get(LevelCode)


# ---------------------------------------------------------------------------
# 2026-09-15 (Shailesh): "the wordings need to be updated everywhere
# relevant ... nothing should showcase the old name wherever it is being
# seen by the human eyes, underneath the system in the backend use whatever
# that is comfortable for you." Every other level code (PM-L1, IM-L2, ...)
# is still shown to admin/teacher/student exactly as-is -- only these four
# codes get a human-facing display label. Kept as a single small dict
# (rather than touching the codes themselves) so no existing
# CompetitionEventLevelPaper/CompetitionEventAttempt/CompetitionEventResult
# row, generated question, or test needs to change -- this is purely a
# label swapped in wherever a level code is rendered for a person to read.
# The frontend keeps its own copy of this exact mapping (lib/api/admin.ts's
# FormatCompetitionLevelLabel) for the same reason -- see that function's
# comment. Keep both in sync if this ever changes.
# ---------------------------------------------------------------------------
# 2026-09-15 (Shailesh): "lets rename MM-L1 to MM-1 because that is the
# paper and wherever relevant we need to show MM-2 and not MM-L2." Same
# mechanism as YLM-L0/YLM-L1 above -- MM-L1/MM-L2 stay the internal codes
# everywhere (curriculum Level row, CompetitionEventLevelPaper rows,
# _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES's MM-L2->MM-L1 fallback, tests),
# only the human-facing label changes. Deliberately does NOT touch the
# "Current Level" column anywhere (still shows the real curriculum code
# "MM-L1", confirmed: "the current level should remain as is because the
# actual level is MM-L1, MM-1 and MM-2 shown in the competition eligibility
# is the segregation between students, students btw lessons 1 to 15 sit for
# IM-L4, students between lesson 16-30 sit for MM-1 and students that have
# completed the course and are alumnis sit for MM-2") -- this dict is only
# ever consulted for a competition-facing level display (eligible/assigned
# level, dropdowns, notifications, results), never for a curriculum-position
# field, so "MM-L1" as a real Level name elsewhere in the app (Level Mastery
# badges, Competition Mock Studio) is completely unaffected.
ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS: dict[str, str] = {
    "YLM-L0": "Bloomers (Below 8 Years)",
    "YLM-L1": "Beginners (Above 8 Years)",
    "MM-L1": "MM-1",
    "MM-L2": "MM-2",
}


def FormatCompetitionLevelLabel(LevelCode: str | None) -> str:
    """Human-facing label for a competition level code. Every code besides
    YLM-L0/YLM-L1/MM-L1/MM-L2 renders as itself (e.g. "PM-L1" stays
    "PM-L1")."""
    if not LevelCode:
        return ""
    return ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS.get(LevelCode, LevelCode)
