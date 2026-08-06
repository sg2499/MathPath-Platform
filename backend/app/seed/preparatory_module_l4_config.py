"""Curriculum config for Preparatory Module (PM) Level 4, Lessons 1-12 --
the final level of the Preparatory Module.

Source of truth: "PL4.xlsx" (12 authoritative per-lesson sheets, 1:1 with
the 12 image folders supplied alongside it: Lesson - 1..Lesson - 12, 5 DPS
images each). Every DPS below reproduces that lesson's taught concept,
technique, digit width, and operand ranges -- not the exact literal numbers
from the spreadsheet, the same convention PM-L1/L2/L3 already established
(see PM_L4_Findings_Report.md, compiled 2026-08-06 and approved by
Shailesh). PM-L4 has its own fully independent question_engine package
(question_engine/pm_l4/), zero imports from question_engine/pm, pm_l2,
pm_l3, or any other module's engine.

Digit-width note: the findings-report audit captured an explicit digit
width/row-count label for most, but not every single, Add/Less block cell
(e.g. Lesson 1 DPS1's "Add/Less (Abacus)" carries no explicit width in the
source title, unlike Lesson 2 DPS5's "(4D,4R)"). Where a DPS's own title
gives an explicit width, that width is reproduced exactly (including
Lesson 2 DPS5's confirmed literal 3-row data overriding its "4R" title
typo -- see the findings report §7). Where no explicit width was captured,
this config follows the level's own visible progression (2D early in the
level, escalating to 3D by the lesson-4/5 mark, 4D appearing from Lesson 6
onward once the workbook itself starts using it), the same kind of
reasonable interpolation PM-L1/L2/L3's own configs already use between
explicitly-labeled DPS.

Concept families in PM-L4 (confirmed via the findings report, cross-checked
against every lesson sheet and DPS image):

1. ADD_LESS -- same abacus technique as PM-L1/L2/L3, now reaching 4-digit
   width (new vs PM-L3's 3-digit cap) via question_engine/pm_l4/operands.py's
   widened WIDE_DIRECT_PATTERNS.
2. MULTIPLY -- "2D X 1D (ABACUS/VISUAL)", same shape as PM-L3's dominant
   skill, no new width introduced here.
3. DIVIDE -- exact division, now TWO widths: "2D ÷ 1D" (new, easier variant,
   Lessons 5/6/7/9) alongside "3D ÷ 1D" (the familiar PM-L3 width).
4. DIVIDE_REMAINDER -- "3D ÷ 1D WITH REMAINDER(S)", genuinely new concept
   with no PM-L1/L2/L3 precedent, appearing only in Lessons 9-12 (the back
   third of the level). correct_answer is a "Q, R" text pair, handled by a
   dedicated free-text answer-matching path (app/services/answer_matching.py)
   confirmed with Shailesh, 2026-08-06.
5. BODMAS -- free-form typed expressions in the workbook (not PM-L3's three
   fixed shapes); PM-L4 derives its own three representative shapes (see
   question_engine/pm_l4/bodmas.py), assigned round-robin across this
   level's 7 BODMAS-bearing DPS.
6. CONCEPT_DRILL_MULTIPLY / CONCEPT_DRILL_DIVIDE -- PM-L2/L3's exact
   teaser sub-block. TIMES is randomized 5-10 for EVERY question in this
   level (DPS, assessment, AND mock alike) per Shailesh's explicit
   2026-08-06 instruction -- a deliberate deviation from PM-L3's precedent
   of keeping DPS-level TIMES literal, made specifically because PM-L4's
   own workbook pins TIMES to a single constant (5) everywhere, which would
   otherwise make the Concept Drill Multiply row guessable after one
   question.

DPS/lesson title formatting: every division block uses the proper "÷"
symbol, never "/", matching the platform-wide convention. Titles combining
more than one concept in a single DPS join with a comma, never "+".
"""
from dataclasses import dataclass, field

from app.question_engine.pm_l4.config import (
    BODMAS_L4_BRACKET_PRODUCT,
    BODMAS_L4_PLAIN_PRODUCT,
    BODMAS_L4_BRACKET_SUM,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
)

ADD_LESS = "ADD_LESS"
MULTIPLY = "MULTIPLY"
DIVIDE = "DIVIDE"
DIVIDE_REMAINDER = "DIVIDE_REMAINDER"
BODMAS = "BODMAS"
CONCEPT_DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"
CONCEPT_DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"

# BODMAS templates assigned round-robin across the level's 7 BODMAS DPS.
_BODMAS_CYCLE = [BODMAS_L4_BRACKET_PRODUCT, BODMAS_L4_PLAIN_PRODUCT, BODMAS_L4_BRACKET_SUM]


def _next_bodmas_template(_cache={"i": 0}) -> str:
    template = _BODMAS_CYCLE[_cache["i"] % len(_BODMAS_CYCLE)]
    _cache["i"] += 1
    return template


@dataclass(frozen=True)
class PmL4DpsBlock:
    kind: str
    title: str
    question_count: int = 10
    # ADD_LESS
    digit_pattern: str = "2D_FULL"
    rows: int = 4
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = ()
    target_numbers: tuple[int, ...] = ()
    practice_mode: str = "ABACUS"
    digit_pattern_second_half: str | None = None
    rows_second_half: int | None = None
    # MULTIPLY
    number_min: int = 11
    number_max: int = 99
    multiplier_min: int = 1
    multiplier_max: int = 9
    # DIVIDE (digit_width distinguishes 2D÷1D vs 3D÷1D)
    digit_width: int = 3
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999
    # BODMAS
    bodmas_template: str = BODMAS_L4_BRACKET_PRODUCT
    # CONCEPT_DRILL_MULTIPLY / CONCEPT_DRILL_DIVIDE
    add_min: int = 1000
    add_max: int = 4999
    times_min: int = 5
    times_max: int = 10
    from_min: int = 1000
    from_max: int = 5999
    less_min: int = 100
    less_max: int = 599


@dataclass(frozen=True)
class PmL4DpsRule:
    dps_title: str
    blocks: tuple[PmL4DpsBlock, ...]


def _addless(title, digit_pattern="2D_FULL", rows=4, template="DIRECT", revision=(), targets=(), mode="ABACUS",
             dp2=None, rows2=None, count=10):
    return PmL4DpsBlock(
        kind=ADD_LESS, title=title, question_count=count, digit_pattern=digit_pattern, rows=rows,
        generation_template=template, revision_templates=revision, target_numbers=targets, practice_mode=mode,
        digit_pattern_second_half=dp2, rows_second_half=rows2,
    )


def _mult(title, nmin=11, nmax=90, mmin=1, mmax=9, count=10, mode="ABACUS"):
    return PmL4DpsBlock(kind=MULTIPLY, title=title, question_count=count, number_min=nmin, number_max=nmax,
                         multiplier_min=mmin, multiplier_max=mmax, practice_mode=mode)


def _div2d(title, dmin=2, dmax=9, vmin=10, vmax=99, count=10):
    return PmL4DpsBlock(kind=DIVIDE, title=title, question_count=count, digit_width=2,
                         divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _div3d(title, dmin=2, dmax=9, vmin=100, vmax=999, count=10):
    return PmL4DpsBlock(kind=DIVIDE, title=title, question_count=count, digit_width=3,
                         divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _div_remainder(title, dmin=2, dmax=9, vmin=100, vmax=999, count=10):
    return PmL4DpsBlock(kind=DIVIDE_REMAINDER, title=title, question_count=count,
                         divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _bodmas(title, template=None, count=5):
    return PmL4DpsBlock(kind=BODMAS, title=title, question_count=count,
                         bodmas_template=template or _next_bodmas_template())


def _drill_mult(title, amin=1000, amax=4999, count=1):
    return PmL4DpsBlock(kind=CONCEPT_DRILL_MULTIPLY, title=title, question_count=count, add_min=amin, add_max=amax)


def _drill_div(title, fmin=1000, fmax=5999, lmin=100, lmax=599, count=1):
    return PmL4DpsBlock(kind=CONCEPT_DRILL_DIVIDE, title=title, question_count=count,
                         from_min=fmin, from_max=fmax, less_min=lmin, less_max=lmax)


# ---------------------------------------------------------------------------
# PM_L4_LESSONS[lesson_number][dps_number] -> PmL4DpsRule
# Reproduces the per-lesson DPS composition confirmed in
# PM_L4_Findings_Report.md §3 -- concept blocks, question counts, and the
# progression of digit width / operand range lesson to lesson.
# ---------------------------------------------------------------------------
PM_L4_LESSONS: dict[int, dict[int, PmL4DpsRule]] = {
    1: {
        1: PmL4DpsRule("Add/Less (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="2D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=1000, amax=1500),
            _drill_div("Concept Drill (Abacus)", fmin=1000, fmax=1999, lmin=100, lmax=199),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=44, mmin=1, mmax=3, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=399, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=55, mmin=1, mmax=4, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=499, count=10),
        )),
        4: PmL4DpsRule("Add/Less 2D,3R (Visual), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=499, count=10),
        )),
        5: PmL4DpsRule("Add/Less (Abacus), 2D X 1D (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="2D_FULL", rows=4, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=65, mmin=1, mmax=4, count=10),
        )),
    },
    2: {
        1: PmL4DpsRule("Add/Less (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="2D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=1200, amax=1700),
            _drill_div("Concept Drill (Abacus)", fmin=1200, fmax=2400, lmin=110, lmax=220),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=65, mmin=1, mmax=4, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=599, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=75, mmin=1, mmax=5, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=599, count=10),
        )),
        4: PmL4DpsRule("Add/Less 3D,3R (Visual), BODMAS (Abacus)", (
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("Brackets First - Maths Rule (Abacus)", count=5),
        )),
        5: PmL4DpsRule("Add/Less 4D,3R (Abacus), 3D ÷ 1D (Abacus)", (
            # Findings report §7: title says "(4D,4R)" but the literal data
            # has only 3 rows (row0 + 2 movements) -- trusted as authoritative
            # per Shailesh's 2026-08-06 confirmed default policy.
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=699, count=10),
        )),
    },
    3: {
        1: PmL4DpsRule("Add/Less (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=1400, amax=1900),
            _drill_div("Concept Drill (Abacus)", fmin=1500, fmax=2800, lmin=120, lmax=240),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=80, mmin=1, mmax=5, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=699, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=85, mmin=1, mmax=5, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=699, count=10),
        )),
        4: PmL4DpsRule("Add/Less 3D,3R (Visual), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=699, count=10),
        )),
        5: PmL4DpsRule("Add/Less 3D,3R (Visual), BODMAS (Abacus)", (
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("Brackets First - Maths Rule (Abacus)", count=5),
        )),
    },
    4: {
        1: PmL4DpsRule("Add/Less (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=1600, amax=2100),
            _drill_div("Concept Drill (Abacus)", fmin=1800, fmax=3000, lmin=130, lmax=250),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=85, mmin=1, mmax=6, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=799, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=6, count=10),
        )),
        4: PmL4DpsRule("Add/Less (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
        )),
        5: PmL4DpsRule("Add/Less (Visual), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less (Visual)", digit_pattern="3D_FULL", rows=4, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=799, count=10),
        )),
    },
    5: {
        1: PmL4DpsRule("Add/Less 2D,5R (Visual), BODMAS (Abacus)", (
            _addless("Add/Less 2D,5R (Visual)", digit_pattern="2D_FULL", rows=5, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", count=5),
        )),
        2: PmL4DpsRule("3D ÷ 1D (Abacus), 2D X 1D (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=799, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=6, count=10),
        )),
        3: PmL4DpsRule("2D ÷ 1D (Abacus), 2D X 1D (Abacus)", (
            _div2d("2D ÷ 1D (Abacus)", vmin=10, vmax=99, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=10),
        )),
        4: PmL4DpsRule("3D ÷ 1D (Abacus), 2D X 1D (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=10),
        )),
        5: PmL4DpsRule("Add/Less (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
        )),
    },
    6: {
        1: PmL4DpsRule("Add/Less 4D,4R (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=2000, amax=2500),
            _drill_div("Concept Drill (Abacus)", fmin=2000, fmax=3500, lmin=150, lmax=280),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 2D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=10),
            _div2d("2D ÷ 1D (Abacus)", vmin=10, vmax=99, count=10),
        )),
        4: PmL4DpsRule("Add/Less 3D,3R (Visual), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        5: PmL4DpsRule("Add/Less 4D,1R & 3D,2R (Visual), BODMAS (Abacus)", (
            _addless("Add/Less 4D,1R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=2,
                      dp2="3D_FULL", rows2=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", count=5),
        )),
    },
    7: {
        1: PmL4DpsRule("2D ÷ 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _div2d("2D ÷ 1D (Abacus)", vmin=10, vmax=99, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=10),
        )),
        3: PmL4DpsRule("Add/Less 4D,4R (Abacus), BODMAS (Abacus)", (
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, count=10),
            _bodmas("BODMAS (Abacus)", count=5),
        )),
        4: PmL4DpsRule("Add/Less 4D,1R & 3D,2R (Visual), Concept Drill (Abacus)", (
            _addless("Add/Less 4D,1R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=2,
                      dp2="3D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=2500, amax=3000),
            _drill_div("Concept Drill (Abacus)", fmin=2500, fmax=3999, lmin=180, lmax=299),
        )),
        5: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
    },
    8: {
        1: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        2: PmL4DpsRule("Add/Less (Abacus), Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=2800, amax=3300),
            _drill_div("Concept Drill (Abacus)", fmin=2800, fmax=4200, lmin=200, lmax=320),
        )),
        3: PmL4DpsRule("Add/Less 3D,3R (Visual), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        4: PmL4DpsRule("3D ÷ 1D (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        5: PmL4DpsRule("Add/Less 4D,4R (Abacus), 2D X 1D (Abacus)", (
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
        )),
    },
    9: {
        1: PmL4DpsRule("Add/Less 3D,3R & 4D,1R (Abacus), 3D ÷ 1D (Abacus)", (
            _addless("Add/Less 3D,3R & 4D,1R (Abacus)", digit_pattern="3D_FULL", rows=3,
                      dp2="4D_FULL", rows2=1, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        3: PmL4DpsRule("2D ÷ 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _div2d("2D ÷ 1D (Abacus)", vmin=10, vmax=99, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        4: PmL4DpsRule("Add/Less 2D,2R & 3D,2R (Visual), Concept Drill (Abacus)", (
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=2,
                      dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=3200, amax=3700),
            _drill_div("Concept Drill (Abacus)", fmin=3200, fmax=4600, lmin=220, lmax=340),
        )),
        5: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D WITH REMAINDER (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div_remainder("3D ÷ 1D WITH REMAINDER (Abacus)", vmin=100, vmax=899, count=10),
        )),
    },
    10: {
        1: PmL4DpsRule("Add/Less 4D,3R (Abacus), 3D ÷ 1D WITH REMAINDERS (Abacus)", (
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, count=10),
            _div_remainder("3D ÷ 1D WITH REMAINDERS (Abacus)", vmin=100, vmax=899, count=10),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
        )),
        3: PmL4DpsRule("3D ÷ 1D (Abacus), 2D X 1D (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
        )),
        4: PmL4DpsRule("3D ÷ 1D (Abacus), Concept Drill (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=3600, amax=4100),
            _drill_div("Concept Drill (Abacus)", fmin=3600, fmax=5000, lmin=240, lmax=360),
        )),
        5: PmL4DpsRule("Add/Less (Abacus), BODMAS (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _bodmas("BODMAS (Abacus)", count=5),
        )),
    },
    11: {
        1: PmL4DpsRule("Add/Less (Visual)", (
            _addless("Add/Less (Visual)", digit_pattern="3D_FULL", rows=4, mode="VISUAL", count=10),
        )),
        2: PmL4DpsRule("BODMAS (Abacus)", (
            _bodmas("BODMAS (Abacus)", count=5),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        4: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D WITH REMAINDERS (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div_remainder("3D ÷ 1D WITH REMAINDERS (Abacus)", vmin=100, vmax=899, count=10),
        )),
        5: PmL4DpsRule("3D ÷ 1D (Abacus), 3D ÷ 1D WITH REMAINDERS (Abacus)", (
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
            _div_remainder("3D ÷ 1D WITH REMAINDERS (Abacus)", vmin=100, vmax=899, count=10),
        )),
    },
    12: {
        1: PmL4DpsRule("Add/Less (Abacus), BODMAS (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="4D_FULL", rows=4, count=10),
            _bodmas("BODMAS (Abacus)", count=5),
        )),
        2: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        3: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D WITH REMAINDERS (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div_remainder("3D ÷ 1D WITH REMAINDERS (Abacus)", vmin=100, vmax=899, count=10),
        )),
        4: PmL4DpsRule("2D X 1D (Abacus), 3D ÷ 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _div3d("3D ÷ 1D (Abacus)", vmin=100, vmax=899, count=10),
        )),
        5: PmL4DpsRule("Add/Less (Visual)", (
            _addless("Add/Less (Visual)", digit_pattern="3D_FULL", rows=4, mode="VISUAL", count=10),
        )),
    },
}
