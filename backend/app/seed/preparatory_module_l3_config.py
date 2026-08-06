"""Curriculum config for Preparatory Module (PM) Level 3, Lessons 1-12.

Source of truth: "PL3.xlsx" (12 authoritative per-lesson sheets, 1:1 with the
12 image folders supplied alongside it: Lesson - 1..Lesson - 12, 5 DPS images
each, "Assessment Sheets" folder excluded per Shailesh's explicit
instruction). Every DPS below reproduces that lesson's taught concept,
technique, digit width, and operand ranges -- not the exact literal numbers
from the spreadsheet, matching the exact convention PM-L1/PM-L2 already
established (see preparatory_module_l2_config.py's own docstring, and
Shailesh's explicit 2026-08-06 confirmation: "everything across the 3 flows
should be generated fulfilling all the rules and regulations for that
particular level... n number of sheets for one dps with n number of
questions").

PM-L3 has its own fully independent question_engine package
(question_engine/pm_l3/), zero imports from question_engine/pm,
question_engine/pm_l2, or any other module's engine.

Five distinct question-block kinds appear across PM-L3's 60 DPS (confirmed
via direct openpyxl audit against every lesson sheet, cross-checked with the
DPS images, 2026-08-06):

1. ADD_LESS -- the familiar vertical-stack family, same abacus technique as
   PM-L1/PM-L2, but with real row-count variety DPS to DPS (3R/4R/5R, and
   mixed digit-pattern column splits within one DPS -- e.g. Lesson 11 DPS1's
   "(3D,2R) & (2D,2R)" is TWO column groups of different digit width in one
   sheet, reproduced via digit_pattern_second_half/rows_second_half).
2. MULTIPLY -- "2D X 1D (ABACUS/VISUAL)", the level's dominant new skill, a
   full standalone DPS. Multiplier range escalates lesson to lesson (pinned
   to 1 in Lesson 1's first block, then 1-4, then full 1-9 by Lesson 7+).
3. DIVIDE -- "3D / 1D (ABACUS)", appears once (Lesson 10 DPS3 only).
4. BODMAS -- "BODMAS (ABACUS)" / "Brackets First - Maths Rule (ABACUS)",
   three distinct term-shapes across the level (see question_engine/pm_l3/
   bodmas.py for the full derivation): SIMPLE_BRACKET (Lessons 2-4),
   COMPOUND (Lesson 5, 7), CHAINED (Lessons 6, 12). Lesson 11 DPS2 uses
   SIMPLE_BRACKET-family ranges (workbook shows shorter, earlier-style
   expressions there despite the later lesson number -- a revision callback,
   not a new template).
5. CONCEPT_DRILL_MULTIPLY / CONCEPT_DRILL_DIVIDE -- PM-L2's exact "ADD x
   TIMES" / "FROM/LESS" teaser sub-block, embedded (1 row each) inside a
   larger DPS. Present in Lessons 1, 6, 7, 8, 9, 10, 11, 12; absent in
   Lessons 2, 3, 4, 5. Lesson 8/9/10/11/12 use only ONE of the two formats
   per instance rather than the paired multiply+divide Lesson 1/6/7 use
   (confirmed directly against each lesson's own header cells).
"""
from dataclasses import dataclass, field

from app.question_engine.pm_l3.config import (
    BODMAS_SIMPLE_BRACKET,
    BODMAS_COMPOUND,
    BODMAS_CHAINED,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
)

ADD_LESS = "ADD_LESS"
MULTIPLY = "MULTIPLY"
DIVIDE = "DIVIDE"
BODMAS = "BODMAS"
CONCEPT_DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"
CONCEPT_DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"


@dataclass(frozen=True)
class PmL3DpsBlock:
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
    # DIVIDE
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999
    # BODMAS
    bodmas_template: str = BODMAS_SIMPLE_BRACKET
    # CONCEPT_DRILL_MULTIPLY / CONCEPT_DRILL_DIVIDE
    add_min: int = 100
    add_max: int = 500
    times_value: int = 12
    from_min: int = 500
    from_max: int = 3999
    less_min: int = 50
    less_max: int = 299


@dataclass(frozen=True)
class PmL3DpsRule:
    dps_title: str
    blocks: tuple[PmL3DpsBlock, ...]


def _addless(title, digit_pattern="2D_FULL", rows=4, template="DIRECT", revision=(), targets=(), mode="ABACUS",
             dp2=None, rows2=None, count=10):
    return PmL3DpsBlock(
        kind=ADD_LESS, title=title, question_count=count, digit_pattern=digit_pattern, rows=rows,
        generation_template=template, revision_templates=revision, target_numbers=targets, practice_mode=mode,
        digit_pattern_second_half=dp2, rows_second_half=rows2,
    )


def _mult(title, nmin=11, nmax=99, mmin=1, mmax=9, count=10, mode="ABACUS"):
    return PmL3DpsBlock(kind=MULTIPLY, title=title, question_count=count, number_min=nmin, number_max=nmax,
                         multiplier_min=mmin, multiplier_max=mmax, practice_mode=mode)


def _div(title, dmin=2, dmax=9, vmin=100, vmax=999, count=10):
    return PmL3DpsBlock(kind=DIVIDE, title=title, question_count=count, divisor_min=dmin, divisor_max=dmax,
                         dividend_min=vmin, dividend_max=vmax)


def _bodmas(title, template, count=5):
    return PmL3DpsBlock(kind=BODMAS, title=title, question_count=count, bodmas_template=template)


def _drill_mult(title, amin=100, amax=500, times=5, count=1):
    return PmL3DpsBlock(kind=CONCEPT_DRILL_MULTIPLY, title=title, question_count=count, add_min=amin, add_max=amax,
                         times_value=times)


def _drill_div(title, fmin=500, fmax=3999, lmin=50, lmax=299, count=1):
    return PmL3DpsBlock(kind=CONCEPT_DRILL_DIVIDE, title=title, question_count=count, from_min=fmin, from_max=fmax,
                         less_min=lmin, less_max=lmax)


# ---------------------------------------------------------------------------
# PM_L3_LESSONS[lesson_number][dps_number] -> PmL3DpsRule
# ---------------------------------------------------------------------------
PM_L3_LESSONS: dict[int, dict[int, PmL3DpsRule]] = {
    1: {
        1: PmL3DpsRule("Add/Less (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="2D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=100, amax=200, times=5),
            _drill_div("Concept Drill (Abacus)", fmin=1000, fmax=1999, lmin=100, lmax=199),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=44, mmin=1, mmax=1, count=10),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=44, mmin=1, mmax=4, count=20),
        )),
        4: PmL3DpsRule("Visual Add/Less (2D, 3R) + 2D X 1D (Abacus)", (
            _addless("Visual Add/Less (2D, 3R)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=87, mmin=1, mmax=4, count=10),
        )),
        5: PmL3DpsRule("Add/Less (Abacus) + 2D X 1D (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="2D_FULL", rows=5, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=79, mmin=1, mmax=4, count=10),
        )),
    },
    2: {
        1: PmL3DpsRule("Add/Less (Abacus), 2D, 4R", (
            _addless("Add/Less (Abacus), 2D, 4R", digit_pattern="2D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=100, amax=250, times=6),
            _drill_div("Concept Drill (Abacus)", fmin=1200, fmax=2400, lmin=110, lmax=220),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=4, count=20),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=4, count=20),
        )),
        4: PmL3DpsRule("Visual Add/Less (2D, 3R) + BODMAS (Abacus)", (
            _addless("Visual Add/Less 2D, 3R", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("Brackets First - Maths Rule (Abacus)", BODMAS_SIMPLE_BRACKET, count=5),
        )),
        5: PmL3DpsRule("Add/Less 3D,1R + 2D,2R (Abacus) + 2D X 1D (Abacus)", (
            _addless("Add/Less 3D,1R + 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=3,
                      dp2="2D_FULL", rows2=3, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=4, count=10),
        )),
    },
    3: {
        1: PmL3DpsRule("Add/Less (Abacus), 3D,2R + 2D,2R", (
            _addless("Add/Less (Abacus), 3D,2R + 2D,2R", digit_pattern="3D_FULL", rows=4,
                      dp2="2D_FULL", rows2=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=150, amax=300, times=6),
            _drill_div("Concept Drill (Abacus)", fmin=1500, fmax=2800, lmin=120, lmax=240),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=4, count=20),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=5, count=20),
        )),
        4: PmL3DpsRule("Visual Add/Less 2D,3R + BODMAS (Abacus)", (
            _addless("Visual Add/Less 2D,3R", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("Brackets First - Maths Rule (Abacus)", BODMAS_SIMPLE_BRACKET, count=5),
        )),
        5: PmL3DpsRule("Add/Less 3D,1R + 2D,2R (Abacus) + 2D X 1D (Abacus)", (
            _addless("Add/Less 3D,1R + 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=3,
                      dp2="2D_FULL", rows2=3, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=5, count=10),
        )),
    },
    4: {
        1: PmL3DpsRule("Add/Less (Abacus), 3D,2R + 2D,2R", (
            _addless("Add/Less (Abacus), 3D,2R + 2D,2R", digit_pattern="3D_FULL", rows=4,
                      dp2="2D_FULL", rows2=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=150, amax=320, times=6),
            _drill_div("Concept Drill (Abacus)", fmin=1600, fmax=3000, lmin=130, lmax=250),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=5, count=20),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=5, count=20),
        )),
        4: PmL3DpsRule("Visual Add/Less 2D,3R + BODMAS (Abacus)", (
            _addless("Visual Add/Less 2D,3R", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("Brackets First - Maths Rule (Abacus)", BODMAS_SIMPLE_BRACKET, count=5),
        )),
        5: PmL3DpsRule("Add/Less 3D,2R + 2D,1R (Abacus) + 2D X 1D (Abacus)", (
            _addless("Add/Less 3D,2R + 2D,1R (Abacus)", digit_pattern="3D_FULL", rows=3,
                      dp2="2D_FULL", rows2=3, count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=5, count=10),
        )),
    },
    5: {
        1: PmL3DpsRule("Add/Less 2D,4R (Visual) + BODMAS (Abacus)", (
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", BODMAS_COMPOUND, count=5),
        )),
        2: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=6, count=20),
        )),
        3: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=6, count=20),
        )),
        4: PmL3DpsRule("Add/Less 3D,4R (Abacus)", (
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, count=20),
        )),
        5: PmL3DpsRule("Add/Less 2D,4R (Visual)", (
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=20),
        )),
    },
    6: {
        1: PmL3DpsRule("Add/Less 3D,4R (Abacus)", (
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=200, amax=400, times=7),
            _drill_div("Concept Drill (Abacus)", fmin=2000, fmax=3500, lmin=150, lmax=280),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=6, count=20),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus/Visual)", (
            _mult("2D X 1D (Abacus/Visual)", nmin=11, nmax=90, mmin=1, mmax=7, count=20),
        )),
        4: PmL3DpsRule("Add/Less 2D,3R (Visual) + 2D X 1D (Abacus)", (
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=10),
        )),
        5: PmL3DpsRule("Add/Less 2D,2R & 3D,1R (Visual) + BODMAS (Abacus)", (
            _addless("Add/Less 2D,2R & 3D,1R (Visual)", digit_pattern="2D_FULL", rows=3,
                      dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", BODMAS_CHAINED, count=5),
        )),
    },
    7: {
        1: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=7, count=20),
        )),
        2: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=20),
        )),
        3: PmL3DpsRule("Add/Less 3D,4R (Abacus) + BODMAS (Abacus)", (
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _bodmas("BODMAS (Abacus)", BODMAS_COMPOUND, count=5),
        )),
        4: PmL3DpsRule("Add/Less 3D,1R & 2D,2R (Visual)", (
            _addless("Add/Less 3D,1R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=2,
                      dp2="2D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=250, amax=500, times=7),
            _drill_div("Concept Drill (Abacus)", fmin=2500, fmax=3999, lmin=180, lmax=299),
        )),
        5: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=20),
        )),
    },
    8: {
        1: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=8, count=20),
        )),
        2: PmL3DpsRule("Add/Less (Abacus) + Concept Drill (Abacus)", (
            _addless("Add/Less (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=250, amax=450, times=8),
        )),
        3: PmL3DpsRule("Add/Less 3D,1R & 2D,2R (Visual) + Concept Drill (Abacus)", (
            _addless("Add/Less 3D,1R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=2,
                      dp2="2D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_div("Concept Drill (Abacus)", fmin=2500, fmax=3999, lmin=180, lmax=299),
        )),
        4: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        5: PmL3DpsRule("Add/Less 3D,4R (Abacus)", (
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
        )),
    },
    9: {
        1: PmL3DpsRule("Add/Less 3D,4R (Abacus)", (
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, count=10),
            _drill_div("Concept Drill (Abacus)", fmin=2500, fmax=3999, lmin=180, lmax=299),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        3: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        4: PmL3DpsRule("Add/Less 2D,2R & 3D,2R (Visual) + Concept Drill (Abacus)", (
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=3,
                      dp2="3D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=300, amax=500, times=8),
        )),
        5: PmL3DpsRule("2D X 1D (Abacus/Visual)", (
            _mult("2D X 1D (Abacus/Visual)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
    },
    10: {
        1: PmL3DpsRule("Add/Less 3D,3R (Abacus)", (
            _addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_FULL", rows=3, count=10),
            _drill_div("Concept Drill (Abacus)", fmin=2800, fmax=3999, lmin=200, lmax=299),
        )),
        2: PmL3DpsRule("2D X 1D (Visual)", (
            _mult("2D X 1D (Visual)", nmin=11, nmax=90, mmin=1, mmax=9, count=20, mode="VISUAL"),
        )),
        3: PmL3DpsRule("3D / 1D (Abacus) + 2D X 1D (Visual)", (
            _div("3D / 1D (Abacus)", dmin=2, dmax=9, vmin=100, vmax=999, count=10),
            _mult("2D X 1D (Visual)", nmin=11, nmax=90, mmin=1, mmax=9, count=10, mode="VISUAL"),
        )),
        4: PmL3DpsRule("Add/Less 2D,4R (Visual)", (
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=300, amax=500, times=9),
        )),
        5: PmL3DpsRule("BODMAS (Abacus)", (
            _bodmas("BODMAS (Abacus)", BODMAS_CHAINED, count=5),
        )),
    },
    11: {
        1: PmL3DpsRule("Add/Less 3D,2R & 2D,2R (Visual)", (
            _addless("Add/Less 3D,2R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=2,
                      dp2="2D_FULL", rows2=2, mode="VISUAL", count=10),
        )),
        2: PmL3DpsRule("BODMAS (Abacus)", (
            _bodmas("BODMAS (Abacus)", BODMAS_SIMPLE_BRACKET, count=5),
        )),
        3: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        4: PmL3DpsRule("2D X 1D (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        5: PmL3DpsRule("Add/Less 2D,2R & 3D,2R (Visual) + Concept Drill (Abacus)", (
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=3,
                      dp2="3D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)", amin=300, amax=500, times=9),
        )),
    },
    12: {
        1: PmL3DpsRule("Add/Less 3D,3R (Abacus)", (
            _addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_FULL", rows=3, count=10),
        )),
        2: PmL3DpsRule("2D X 1D (Abacus) + BODMAS (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _bodmas("BODMAS (Abacus)", BODMAS_CHAINED, count=5),
        )),
        3: PmL3DpsRule("2D x 1D (Abacus)", (
            _mult("2D x 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=20),
        )),
        4: PmL3DpsRule("2D X 1D (Abacus) + Concept Drill (Abacus)", (
            _mult("2D X 1D (Abacus)", nmin=11, nmax=90, mmin=1, mmax=9, count=10),
            _drill_mult("Concept Drill (Abacus)", amin=300, amax=500, times=9),
        )),
        5: PmL3DpsRule("Add/Less 2D,2R & 3D,2R (Visual) + Concept Drill (Abacus)", (
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=3,
                      dp2="3D_FULL", rows2=3, mode="VISUAL", count=10),
            _drill_div("Concept Drill (Abacus)", fmin=3000, fmax=3999, lmin=220, lmax=299),
        )),
    },
}
