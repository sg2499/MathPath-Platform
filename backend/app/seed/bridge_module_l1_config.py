"""Curriculum config for Bridge Module (BM) Level 1, Lessons 1-40 -- the
sole level of the Bridge Module, sitting between Preparatory and
Intermediate in the platform hierarchy (YLM-PM-BM-IM-MM).

Source of truth: "Bridge Level.xlsx" (41 sheets: BL-1..BL-15 = Lessons
1-15, LESSON 16..LESSON 40 = Lessons 16-40; one unrelated leftover sheet
excluded -- see docs/reference-materials/BM/). Every DPS below reproduces
that lesson's taught concept, technique, digit width, and row count -- not
the exact literal operand values from the spreadsheet, the same convention
every PM level's config already establishes. This config was built via a
data-driven classifier script (not hand-transcribed) that parsed the
workbook's own structured cell extraction (title text, addless row/width
groups, multiplication-symbol counts, BODMAS formula counts, remainder-pair
counts) for all 200 DPS sheets, so every entry traces directly back to the
literal workbook content Shailesh approved in the BM findings report
(2026-08-07). BM has its own fully independent question_engine package
(question_engine/bm/), zero imports from question_engine/pm, pm_l2, pm_l3,
pm_l4, or any other module's engine -- per Shailesh's explicit instruction:
"dedicated engine for bm, entirely independent from all the other modules
and levels."

Two structurally distinct halves:

1. Lessons 1-15 (BL-1..BL-15): the abacus-technique on-ramp, identical in
   spirit to PM-L1's own opening lessons -- bead recognition, then Direct
   Add/Less, then Complement of 5 and Complement of 10 for each target digit
   1-9 in turn, each DPS a single 3-row Add/Less block (never combined with
   Multiply/Divide/BODMAS/Concept Drill -- those don't start until Lesson
   16). generation_template on each block is DIRECT, COMP5_ADD, COMP5_SUB,
   COMP10_ADD, COMP10_SUB, or REVISION (mirroring a mix of two techniques),
   matching question_engine/bm/operands.py's TEMPLATE_* constants exactly.

2. Lessons 16-40 (LESSON 16..LESSON 40): the full 6-concept ramp Shailesh
   specified for BM-L1's assessment/mock sections -- Add/Less (Abacus),
   Add/Less (Visual), 2D X 1D Multiplication, 2D/3D ÷ 1D Division (exact),
   3D ÷ 1D Division With Remainder (Lessons 36-40 only, the back end of the
   level, mirroring PM-L4's own precedent of introducing remainder division
   late), BODMAS, and Concept Drill (Abacus) -- each DPS combining 1-3 of
   these as separate blocks that render as separate DPSSections (or, for
   Concept Drill's paired Multiply/Divide teaser rows, one merged section --
   see seed_bridge_module_l1.py's _ensure_section, ported directly from
   PM-L4's post-2026-08-07-fix grouping logic).

Mixed-width Add/Less DPS (e.g. Lesson 18 DPS1's "Add/Less 3D,2R + 2D,2R")
are built with the CORRECTED single-mixed-stack schedule
(question_engine/bm/operands.py's _row_width_schedule/total_row_count) from
day one -- never the buggy "split into two pure-width batches" design that
had to be fixed in PM-L4 on 2026-08-07 after a live-preview catch. BM's own
workbook has the identical "&"/"+" mixed-width title pattern, so this
config's dp2/rows2 fields on _addless(...) calls always describe a SECOND
group of rows appended to the SAME chain, matching the literal reading of
each title (e.g. "4D,1R & 3D,2R" = one 3-row stack: 1 row at 4-digit width,
then 2 rows at 3-digit width).

Two generation-engine gaps were found and fixed (in question_engine/bm/
operands.py only -- BM's engine is independent, so this never touches PM's
already-shipped code) while validating every block in this config end to
end against the live engine:

1. _row_width_schedule's overflow-guard ceiling was hardcoded to 1 digit
   for any non-"wide" DIRECT pattern, which is wrong for narrow-but-
   multi-digit row0 pools like "2D_TENS" (row0 always a round ten, e.g. 20)
   -- every chain failed validation on its first delta row 100% of the
   time. Fixed by deriving the ceiling from the actual widest value in
   _direct_bases_for_pattern's own pool.
2. generate_unique_operands raised instead of falling back once a DPS's
   achievable combinatorial space (e.g. a single-target Complement-of-5
   drill with digit_pattern=1D: exactly 4 possible 3-row chains) is smaller
   than the 10 questions requested. Since real foundational bead-drill
   worksheets legitimately repeat the same handful of movements for muscle
   memory, this now falls back to any other valid (possibly repeated)
   chain rather than crashing DPS generation.
"""
from dataclasses import dataclass, field

from app.question_engine.bm.config import (
    BODMAS_BM_BRACKET_PRODUCT,
    BODMAS_BM_PLAIN_PRODUCT,
    BODMAS_BM_BRACKET_SUM,
    BODMAS_BM_PRODUCT_AFTER_TAIL,
)

ADD_LESS = "ADD_LESS"
MULTIPLY = "MULTIPLY"
DIVIDE = "DIVIDE"
DIVIDE_REMAINDER = "DIVIDE_REMAINDER"
BODMAS = "BODMAS"
CONCEPT_DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"
CONCEPT_DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"


@dataclass(frozen=True)
class BmDpsBlock:
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
    bodmas_template: str = BODMAS_BM_BRACKET_PRODUCT
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
class BmDpsRule:
    dps_title: str
    blocks: tuple[BmDpsBlock, ...]


def _addless(title, digit_pattern="2D_FULL", rows=4, template="DIRECT", revision=(), targets=(), mode="ABACUS",
             dp2=None, rows2=None, count=10):
    return BmDpsBlock(
        kind=ADD_LESS, title=title, question_count=count, digit_pattern=digit_pattern, rows=rows,
        generation_template=template, revision_templates=revision, target_numbers=targets, practice_mode=mode,
        digit_pattern_second_half=dp2, rows_second_half=rows2,
    )


def _mult(title, nmin=11, nmax=99, mmin=1, mmax=9, count=10, mode="ABACUS"):
    return BmDpsBlock(kind=MULTIPLY, title=title, question_count=count, number_min=nmin, number_max=nmax,
                       multiplier_min=mmin, multiplier_max=mmax, practice_mode=mode)


def _div2d(title, dmin=2, dmax=9, vmin=10, vmax=99, count=10):
    return BmDpsBlock(kind=DIVIDE, title=title, question_count=count, digit_width=2,
                       divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _div3d(title, dmin=2, dmax=9, vmin=100, vmax=999, count=10):
    return BmDpsBlock(kind=DIVIDE, title=title, question_count=count, digit_width=3,
                       divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _div_remainder(title, dmin=2, dmax=9, vmin=100, vmax=999, count=10):
    return BmDpsBlock(kind=DIVIDE_REMAINDER, title=title, question_count=count,
                       divisor_min=dmin, divisor_max=dmax, dividend_min=vmin, dividend_max=vmax)


def _bodmas(title, template=None, count=5):
    return BmDpsBlock(kind=BODMAS, title=title, question_count=count,
                       bodmas_template=template or BODMAS_BM_BRACKET_PRODUCT)


def _drill_mult(title, amin=1000, amax=4999, count=1):
    return BmDpsBlock(kind=CONCEPT_DRILL_MULTIPLY, title=title, question_count=count, add_min=amin, add_max=amax)


def _drill_div(title, fmin=1000, fmax=5999, lmin=100, lmax=599, count=1):
    return BmDpsBlock(kind=CONCEPT_DRILL_DIVIDE, title=title, question_count=count,
                       from_min=fmin, from_max=fmax, less_min=lmin, less_max=lmax)


# ---------------------------------------------------------------------------
# BM_LESSONS[lesson_number][dps_number] -> BmDpsRule
# Data-driven from the Bridge Level.xlsx structured extraction -- see module
# docstring above.
# ---------------------------------------------------------------------------
BM_LESSONS: dict[int, dict[int, BmDpsRule]] = {
    1: {
        1: BmDpsRule(dps_title="Bead Recognition & Single Digit Addition -Subtraction (1, 2, 3, 4)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", count=10),)),
        2: BmDpsRule(dps_title="Bead Recognition & Single Digit Addition -Subtraction (1, 2, 3, 4)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", count=10),)),
        3: BmDpsRule(dps_title="Bead Recognition Number '5', '6', '7', '8' & '9' & Direct Add -Less Using 5", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", count=10),)),
        4: BmDpsRule(dps_title="Bead Recognition 5 To 9 & Addition -Subtraction", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", count=10),)),
        5: BmDpsRule(dps_title="Bead Recognition & Double Digit Addition -Subtraction (Ones & Tens)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", count=10),)),
    },
    2: {
        1: BmDpsRule(dps_title="Bead Recognition & Double Digit Direct Addition -Subtraction", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", count=10),)),
        2: BmDpsRule(dps_title="Bead Recognition & Double Digit Direct Addition -Subtraction", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", count=10),)),
        3: BmDpsRule(dps_title="Bead Recognition & Double Digit Direct Addition -Subtraction", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", count=10),)),
        4: BmDpsRule(dps_title="Bead Recognition & Double Digit Direct Addition -Subtraction", blocks=(_addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_HUNDREDS", rows=3, mode="ABACUS", count=10),)),
        5: BmDpsRule(dps_title="Bead Recognition & Triple Digit Direct Addition -Subtraction", blocks=(_addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_HUNDREDS", rows=3, mode="ABACUS", count=10),)),
    },
    3: {
        1: BmDpsRule(dps_title="Addition Of 1 Using Complement Of 5 (Add 5 , Less 4)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(1,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 1 Using Complement Of 5 (Add 5 , Less 4)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(1,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 1 Using Complement Of 10 (Add 10 , Less 9)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(1,), count=10),)),
        4: BmDpsRule(dps_title="Bead Recognition & Addition Of 1 Using Complement Of 10 (Add 10 , Less 9)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(1,), count=10),)),
        5: BmDpsRule(dps_title="Bead Recognition & Double Digit Addition Of 1 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_ADD", "COMP10_ADD",), targets=(1,), count=10),)),
    },
    4: {
        1: BmDpsRule(dps_title="Subtraction Of 1 Using Complement Of 5 (Less 5 , Add 4)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(1,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 1 Using Complement Of 5 (Less 5 , Add 4)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(1,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 1 Using Complement Of 10 (Less 10 , Add 9)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(1,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 1 Using Complement Of 10 (Less 10 , Add 9)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(1,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Subtraction Of 1 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_SUB", "COMP10_SUB",), targets=(1,), count=10),)),
    },
    5: {
        1: BmDpsRule(dps_title="Addition Of 2 Using Complement Of 5 (Add 5 , Less 3)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(2,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 2 Using Complement Of 5 (Add 5 , Less 3)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(2,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 2 Using Complement Of 10 (Add 10 , Less 8)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(2,), count=10),)),
        4: BmDpsRule(dps_title="Addition Of 2 Using Complement Of 10 (Add 10 , Less 8)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(2,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Addition Of 1 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_ADD", "COMP10_ADD",), targets=(1,), count=10),)),
    },
    6: {
        1: BmDpsRule(dps_title="Subtraction Of 2 Using Complement Of 5 (Less 5 , Add 3)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(2,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 2 Using Complement Of 5 (Less 5 , Add 3)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(2,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 2 Using Complement Of 10 (Less 10 , Add 8)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(2,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 2 Using Complement Of 10 (Less 10 , Add 8)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(2,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Subtraction Of 2 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_SUB", "COMP10_SUB",), targets=(2,), count=10),)),
    },
    7: {
        1: BmDpsRule(dps_title="Addition Of 3 Using Complement Of 5 (Add 5 , Less 2)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(3,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 3 Using Complement Of 5 (Add 5 , Less 2)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(3,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 3 Using Complement Of 10 (Add 10 , Less 7)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(3,), count=10),)),
        4: BmDpsRule(dps_title="Addition Of 3 Using Complement Of 10 (Add 10 , Less 7)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(3,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Addition Of 3 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_ADD", "COMP10_ADD",), targets=(3,), count=10),)),
    },
    8: {
        1: BmDpsRule(dps_title="Subtraction Of 3 Using Complement Of 5 (Less 5 , Add 2)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(3,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 3 Using Complement Of 5 (Less 5 , Add 2)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(3,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 3 Using Complement Of 10 (Less 10 , Add 7)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(3,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 3 Using Complement Of 10 (Less 10 , Add 7)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(3,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Subtraction Of 3 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_SUB", "COMP10_SUB",), targets=(3,), count=10),)),
    },
    9: {
        1: BmDpsRule(dps_title="Addition Of 4 Using Complement Of 5 (Add 5 , Less 1)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(4,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 4 Using Complement Of 5 (Add 5 , Less 1)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_ADD", targets=(4,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 4 Using Complement Of 10 (Add 10 , Less 6)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(4,), count=10),)),
        4: BmDpsRule(dps_title="Addition Of 4 Using Complement Of 10 (Add 10 , Less 6)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(4,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Addition Of 4 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_ADD", "COMP10_ADD",), targets=(4,), count=10),)),
    },
    10: {
        1: BmDpsRule(dps_title="Subtraction Of 4 Using Complement Of 5 (Less 5 , Add 1)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(4,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 4 Using Complement Of 5 (Less 5 , Add 1)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP5_SUB", targets=(4,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 4 Using Complement Of 10 (Less 10 , Add 7)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(4,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 4 Using Complement Of 10 (Less 10 , Add 6)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(4,), count=10),)),
        5: BmDpsRule(dps_title="Double Digit Subtraction Of 4 Using Complements Of 5 & 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="REVISION", revision=("COMP5_SUB", "COMP10_SUB",), targets=(4,), count=10),)),
    },
    11: {
        1: BmDpsRule(dps_title="Addition Of 5 Using Complement Of 10 (Add 10 , Less 5)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(5,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 5 Using Complement Of 10 (Add 10 , Less 5)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(5,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 5 Using Complement Of 10 (Less 10 , Add 5)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(5,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 5 Using Complement Of 10 (Less 10 , Add 5)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(5,), count=10),)),
        5: BmDpsRule(dps_title="Addition & Subtraction Of 5 Using Complement Of 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="REVISION", revision=("COMP10_ADD", "COMP10_SUB",), targets=(5,), count=10),)),
    },
    12: {
        1: BmDpsRule(dps_title="Addition Of 6 Using Complement Of 10 (Add 10 , Less 4)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(6,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 6 Using Complement Of 10 (Add 10 , Less 4)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(6,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 7 Using Complement Of 10 (Add 10 , Less 3 )", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(7,), count=10),)),
        4: BmDpsRule(dps_title="Addition Of 7 Using Complement Of 10 (Add 10 , Less 3 )", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(7,), count=10),)),
        5: BmDpsRule(dps_title="Addition Of 6 & 7 Using Complement Of 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(6, 7,), count=10),)),
    },
    13: {
        1: BmDpsRule(dps_title="Subtraction Of 6 Using Complement Of 10 (Less 10 , Add 4)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(6,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 6 Using Complement Of 10 (Less 10 , Add 4)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(6,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 7 Using Complement Of 10 (Less 10 , Add 3 )", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(7,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 7 Using Complement Of 10 (Less 10 , Add 3 )", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(7,), count=10),)),
        5: BmDpsRule(dps_title="Subtraction Of 7 & 8 Using Complement Of 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(7, 8,), count=10),)),
    },
    14: {
        1: BmDpsRule(dps_title="Addition Of 8 Using Complement Of 10 (Add 10 , Less 2)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(8,), count=10),)),
        2: BmDpsRule(dps_title="Addition Of 8 Using Complement Of 10 (Add 10 , Less 2)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(8,), count=10),)),
        3: BmDpsRule(dps_title="Addition Of 9 Using Complement Of 10 (Add 10 , Less 1)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(9,), count=10),)),
        4: BmDpsRule(dps_title="Addition Of 9 Using Complement Of 10 (Add 10 , Less 1)", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(9,), count=10),)),
        5: BmDpsRule(dps_title="Addition Of 8 & 9 Using Complement Of 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D_TENS", rows=3, mode="ABACUS", template="COMP10_ADD", targets=(8, 9,), count=10),)),
    },
    15: {
        1: BmDpsRule(dps_title="Subtraction Of 8 Using Complement Of 10 (Less 10 , Add 2)", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(8,), count=10),)),
        2: BmDpsRule(dps_title="Subtraction Of 8 Using Complement Of 10 (Less 10 , Add 2", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(8,), count=10),)),
        3: BmDpsRule(dps_title="Subtraction Of 9 Using Complement Of 10 (Less 10 , Add 1 )", blocks=(_addless("Add/Less 1D,3R (Abacus)", digit_pattern="1D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(9,), count=10),)),
        4: BmDpsRule(dps_title="Subtraction Of 9 Using Complement Of 10 (Less 10 , Add 1 )", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(9,), count=10),)),
        5: BmDpsRule(dps_title="Subtraction Of 8 & 9 Using Complement Of 10", blocks=(_addless("Add/Less 2D,3R (Abacus)", digit_pattern="2D", rows=3, mode="ABACUS", template="COMP10_SUB", targets=(8, 9,), count=10),)),
    },
    16: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 2D,4R (Abacus)", digit_pattern="2D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 2D,5R (Abacus)", digit_pattern="2D_FULL", rows=5, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
    },
    17: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 2D,4R (Abacus)", digit_pattern="2D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_PRODUCT, count=5),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 3D,1R & 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=1, dp2="2D_FULL", rows2=2, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
    },
    18: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,2R & 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=2, dp2="2D_FULL", rows2=2, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PLAIN_PRODUCT, count=5),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 3D,1R & 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=1, dp2="2D_FULL", rows2=2, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
    },
    19: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,2R & 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=2, dp2="2D_FULL", rows2=2, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_SUM, count=5),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 3D,2R & 2D,1R (Abacus)", digit_pattern="3D_FULL", rows=2, dp2="2D_FULL", rows2=1, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
    },
    20: {
        1: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PRODUCT_AFTER_TAIL, count=5),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Abacus)", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual)", blocks=(
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=10),
        )),
    },
    21: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,2R & 3D,1R (Visual)", digit_pattern="2D_FULL", rows=2, dp2="3D_FULL", rows2=1, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_PRODUCT, count=5),
        )),
    },
    22: {
        1: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="Add/Less (Abacus), BODMAS", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PLAIN_PRODUCT, count=5),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 3D,1R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=1, dp2="2D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
    },
    23: {
        1: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        2: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_FULL", rows=3, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        3: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 3D,1R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=1, dp2="2D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus)", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
        )),
    },
    24: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
    },
    25: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_FULL", rows=3, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=20, mode="VISUAL"),
        )),
        3: BmDpsRule(dps_title="3D ÷ 1D Division, 2D X 1D Multiplication", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 2D,4R (Visual)", digit_pattern="2D_FULL", rows=4, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="BODMAS", blocks=(
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_SUM, count=5),
        )),
    },
    26: {
        1: BmDpsRule(dps_title="Add/Less (Visual)", blocks=(
            _addless("Add/Less 3D,2R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=2, dp2="2D_FULL", rows2=2, mode="VISUAL", count=10),
        )),
        2: BmDpsRule(dps_title="BODMAS", blocks=(
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PRODUCT_AFTER_TAIL, count=5),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
    },
    27: {
        1: BmDpsRule(dps_title="Add/Less (Abacus)", blocks=(
            _addless("Add/Less 3D,3R (Abacus)", digit_pattern="3D_FULL", rows=3, mode="ABACUS", count=10),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, BODMAS", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_PRODUCT, count=5),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=20, mode="ABACUS"),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication, Concept Drill", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 2D,2R (Visual)", digit_pattern="2D_FULL", rows=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
    },
    28: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,2R & 2D,2R (Abacus)", digit_pattern="3D_FULL", rows=2, dp2="2D_FULL", rows2=2, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 2D,3R (Visual)", digit_pattern="2D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 2D,5R (Abacus)", digit_pattern="2D_FULL", rows=5, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
    },
    29: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 3D,4R (Abacus)", digit_pattern="3D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PLAIN_PRODUCT, count=5),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
    },
    30: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 4D,2R & 3D,2R (Abacus)", digit_pattern="4D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_SUM, count=5),
        )),
    },
    31: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=20, mode="VISUAL"),
        )),
        4: BmDpsRule(dps_title="Add/Less (Abacus)", blocks=(
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, mode="ABACUS", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 3D,1R & 2D,2R (Visual)", digit_pattern="3D_FULL", rows=1, dp2="2D_FULL", rows2=2, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
    },
    32: {
        1: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 2D,5R (Visual)", digit_pattern="2D_FULL", rows=5, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PRODUCT_AFTER_TAIL, count=5),
        )),
        2: BmDpsRule(dps_title="3D ÷ 1D Division, 2D X 1D Multiplication", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
        3: BmDpsRule(dps_title="2D ÷ 1D Division, 2D X 1D Multiplication", blocks=(
            _div2d("2D ÷ 1D Division (Abacus)", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
        4: BmDpsRule(dps_title="3D ÷ 1D Division, 2D X 1D Multiplication", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus)", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
        )),
    },
    33: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 2D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div2d("2D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual), BODMAS", blocks=(
            _addless("Add/Less 4D,1R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=1, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_PRODUCT, count=5),
        )),
    },
    34: {
        1: BmDpsRule(dps_title="2D ÷ 1D Division, 3D ÷ 1D Division", blocks=(
            _div2d("2D ÷ 1D Division (Abacus)", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=20, mode="VISUAL"),
        )),
        3: BmDpsRule(dps_title="Add/Less (Abacus), BODMAS", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PLAIN_PRODUCT, count=5),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 4D,1R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=1, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Abacus)", count=10, mode="ABACUS"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
    },
    35: {
        1: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        2: BmDpsRule(dps_title="Add/Less (Abacus), Concept Drill", blocks=(
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, mode="ABACUS", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        3: BmDpsRule(dps_title="Add/Less (Visual), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 3D,3R (Visual)", digit_pattern="3D_FULL", rows=3, mode="VISUAL", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="3D ÷ 1D Division", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), 2D X 1D Multiplication", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
    },
    36: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), 3D ÷ 1D Division", blocks=(
            _addless("Add/Less 3D,3R & 4D,1R (Abacus)", digit_pattern="3D_FULL", rows=3, dp2="4D_FULL", rows2=1, mode="ABACUS", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D ÷ 1D Division, 3D ÷ 1D Division", blocks=(
            _div2d("2D ÷ 1D Division (Abacus)", count=10),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="Add/Less (Visual), Concept Drill", blocks=(
            _addless("Add/Less 2D,2R & 3D,2R (Visual)", digit_pattern="2D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D With Remainder", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
    },
    37: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), 3D ÷ 1D With Remainder", blocks=(
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, mode="ABACUS", count=10),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=20, mode="VISUAL"),
        )),
        3: BmDpsRule(dps_title="3D ÷ 1D Division, 2D X 1D Multiplication", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
        )),
        4: BmDpsRule(dps_title="3D ÷ 1D Division, Concept Drill", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _drill_mult("Concept Drill (Abacus)"),
            _drill_div("Concept Drill (Abacus)"),
        )),
        5: BmDpsRule(dps_title="Add/Less (Abacus), BODMAS", blocks=(
            _addless("Add/Less 4D,4R (Abacus)", digit_pattern="4D_FULL", rows=4, mode="ABACUS", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_SUM, count=5),
        )),
    },
    38: {
        1: BmDpsRule(dps_title="Add/Less (Visual)", blocks=(
            _addless("Add/Less 4D,2R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
        )),
        2: BmDpsRule(dps_title="BODMAS", blocks=(
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PRODUCT_AFTER_TAIL, count=5),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D With Remainder", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="3D ÷ 1D Division, 3D ÷ 1D With Remainder", blocks=(
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
    },
    39: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), BODMAS", blocks=(
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, mode="ABACUS", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_BRACKET_PRODUCT, count=5),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D With Remainder", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual)", blocks=(
            _addless("Add/Less 4D,2R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
        )),
    },
    40: {
        1: BmDpsRule(dps_title="Add/Less (Abacus), BODMAS", blocks=(
            _addless("Add/Less 4D,3R (Abacus)", digit_pattern="4D_FULL", rows=3, mode="ABACUS", count=10),
            _bodmas("BODMAS (Abacus)", template=BODMAS_BM_PLAIN_PRODUCT, count=5),
        )),
        2: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        3: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D With Remainder", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div_remainder("3D ÷ 1D Division With Remainder (Abacus)", count=10),
        )),
        4: BmDpsRule(dps_title="2D X 1D Multiplication, 3D ÷ 1D Division", blocks=(
            _mult("2D X 1D Multiplication (Visual)", count=10, mode="VISUAL"),
            _div3d("3D ÷ 1D Division (Abacus)", count=10),
        )),
        5: BmDpsRule(dps_title="Add/Less (Visual)", blocks=(
            _addless("Add/Less 4D,2R & 3D,2R (Visual)", digit_pattern="4D_FULL", rows=2, dp2="3D_FULL", rows2=2, mode="VISUAL", count=10),
        )),
    },
}

LESSON_TITLES = {
    1: "Bead Recognition & Direct Add/Less",
    2: "Bead Recognition & Direct Add/Less",
    3: "Addition of 1 Using Complement of 10 & 5",
    4: "Subtraction of 1 Using Complement of 10 & 5",
    5: "Addition of 1 & 2 Using Complement of 10 & 5",
    6: "Subtraction of 2 Using Complement of 10 & 5",
    7: "Addition of 3 Using Complement of 10 & 5",
    8: "Subtraction of 3 Using Complement of 10 & 5",
    9: "Addition of 4 Using Complement of 10 & 5",
    10: "Subtraction of 4 Using Complement of 10 & 5",
    11: "Addition & Subtraction of 5 Using Complement of 10",
    12: "Addition of 6 & 7 Using Complement of 10",
    13: "Subtraction of 6 & 7 & 8 Using Complement of 10",
    14: "Addition of 8 & 9 Using Complement of 10",
    15: "Subtraction of 8 & 9 Using Complement of 10",
    16: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    17: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    18: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    19: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    20: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS",
    21: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    22: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    23: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    24: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    25: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    26: "2D X 1D Multiplication (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    27: "2D X 1D Multiplication (Abacus), Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    28: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    29: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    30: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    31: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    32: "2D X 1D Multiplication (Visual), 2D ÷ 1D Division, 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS",
    33: "2D X 1D Multiplication (Visual), 2D ÷ 1D Division, 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    34: "2D X 1D Multiplication (Abacus), 2D X 1D Multiplication (Visual), 2D ÷ 1D Division, 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), BODMAS, Concept Drill",
    35: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    36: "2D X 1D Multiplication (Visual), 2D ÷ 1D Division, 3D ÷ 1D Division, 3D ÷ 1D With Remainder, Add/Less (Abacus), Add/Less (Visual), Concept Drill",
    37: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, 3D ÷ 1D With Remainder, Add/Less (Abacus), BODMAS, Concept Drill",
    38: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, 3D ÷ 1D With Remainder, Add/Less (Visual), BODMAS",
    39: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, 3D ÷ 1D With Remainder, Add/Less (Abacus), Add/Less (Visual), BODMAS",
    40: "2D X 1D Multiplication (Visual), 3D ÷ 1D Division, 3D ÷ 1D With Remainder, Add/Less (Abacus), Add/Less (Visual), BODMAS",
}