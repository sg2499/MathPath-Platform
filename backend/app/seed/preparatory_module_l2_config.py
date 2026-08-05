"""Curriculum config for Preparatory Module (PM) Level 2, Lessons 1-12.

Source of truth: "Level 2 .xlsx" (12 authoritative per-lesson sheets, 1:1
with the 12 image folders supplied alongside it: Lesson-1..Lesson-12, 5 DPS
images each -- the remaining ~23 sheets in that workbook are superseded
drafts under an older lesson-numbering scheme, confirmed via spot-checks,
not used here). Every DPS below reproduces that lesson's taught concept,
technique, target number(s), digit width, and (new to PM-L2) practice mode
-- not the exact literal numbers from the spreadsheet, matching the exact
convention PM-L1 already established in preparatory_module_l1_config.py: the
platform generates a fresh, validated worksheet per publish/attempt from a
concept-level config, the same way every other module does.

PM-L2 has its own fully independent question_engine package
(question_engine/pm_l2/ -- config.py/operands.py/validators.py/
distractors.py/generator.py/concept_drill.py), zero imports from
question_engine/pm (PM-L1) or any other module, per Shailesh's explicit
2026-08-05 instruction that every level gets a dedicated engine so a change
to one level's generation logic can never silently affect another.

Practice mode (Shailesh, 2026-08-05): PM-L2's workbook titles explicitly tag
most DPS sheets "VISUAL" (mental/visualization, no physical abacus) or
"ABACUS" ((implicitly or explicitly) physical abacus practice). A sheet with
neither keyword in its title defaults to ABACUS. This is purely descriptive
metadata (baked into dps_title's display text, e.g. "... (Abacus)"/
"... (Visual)") -- it does not change how questions are generated or scored.

Two genuine structural findings, confirmed against the workbook and cross-
checked with the matching DPS images (not editorial choices -- see
docstrings on PM_L2_LESSONS[8] and PM_L2_LESSONS[11] below):
- Lesson 8 has 6 physical practice blocks, not the usual 5 (two blocks both
  printed under a "-4" title in the source).
- Lesson 11 DPS3 escalates mid-sheet from 2-digit (questions 1-10) to
  3-digit (questions 11-20) under a single DPS number -- see
  digit_pattern_second_half on PML2Config/PmL2DpsRule.

Lesson 12 DPS4's title reads "3 DIGIT ADDITION & SUBTRACTION - VISUAL" in
the source workbook, but its actual data is 2-digit -- confirmed a
mislabelling by Shailesh (2026-08-05); corrected to "2 Digit ..." here.

CONCEPT DRILL (ABACUS) is a wholly separate question format (not a variant
of the vertical 3-row stack) present in every lesson except Lesson 9 -- see
question_engine/pm_l2/concept_drill.py for the three distinct formats
(MULTIPLY, DIVIDE, RANGE_SUM) and PM_L2_CONCEPT_DRILLS below for the
per-lesson literal values, pinned narrowly (min==max) so DPS generation
reproduces the workbook's own numbers deterministically, exactly matching
PM-L1's "same concept/technique, generated not stored" convention applied to
a pinned-range special case.
"""
from dataclasses import dataclass, field

from app.question_engine.pm_l2.config import DRILL_MULTIPLY, DRILL_DIVIDE, DRILL_RANGE_SUM


@dataclass(frozen=True)
class PmL2DpsRule:
    dps_title: str
    concept_family: str
    operation_focus: str
    abacus_rule: str | None
    target_numbers: list[int]
    digit_pattern: str
    generation_template: str
    practice_mode: str  # "ABACUS" | "VISUAL"
    revision_templates: tuple[str, ...] = ()
    place_value: str = "ONES"
    rows: int = 3
    question_count: int = 10
    digit_pattern_second_half: str | None = None


@dataclass(frozen=True)
class PmL2ConceptDrillItem:
    drill_format: str
    # MULTIPLY
    add_value: int | None = None
    times_value: int = 12
    # DIVIDE
    from_value: int | None = None
    less_value: int | None = None
    # RANGE_SUM
    range_archetype: str | None = None
    range_step: int | None = None
    range_n_terms: int | None = None


@dataclass(frozen=True)
class PmL2LessonRule:
    lesson_number: int
    lesson_title: str
    dps: dict[int, PmL2DpsRule]
    concept_drill: tuple[PmL2ConceptDrillItem, ...] = field(default_factory=tuple)
    # Which DPS number hosts the concept-drill block -- 5 for every lesson
    # except Lesson 8 (6 physical blocks, concept drill trails the last one).
    # If this number is NOT a key in `dps`, that DPS is concept-drill-only
    # (no normal vertical-stack section at all, e.g. Lessons 2, 3, 10, 11, 12).
    # If it IS a key, that DPS carries both a normal section and a
    # concept-drill section (Lessons 1, 4, 5, 6, 7, 8).
    concept_drill_dps_number: int = 5


PM_L2_LESSONS: dict[int, PmL2LessonRule] = {}

# ---------------------------------------------------------------------------
# Lesson 1 -- Bead Recognition & Single/Double Digit Addition-Subtraction
# ---------------------------------------------------------------------------
PM_L2_LESSONS[1] = PmL2LessonRule(
    lesson_number=1,
    lesson_title="Bead Recognition & Single/Double Digit Addition-Subtraction",
    dps={
        1: PmL2DpsRule("Single Digit (1, 2, 3, 4) Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [1, 2, 3, 4], "1D", "DIRECT", "VISUAL"),
        2: PmL2DpsRule("Two Digit Addition-Subtraction (Direct Method)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D_AND_2D", "DIRECT", "VISUAL", place_value="MIXED"),
        3: PmL2DpsRule("Abacus Add/Less Sums", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
        4: PmL2DpsRule("Two Digit Addition-Subtraction (Direct Method)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        5: PmL2DpsRule("Abacus Add/Less Sums", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_RANGE_SUM, range_archetype="MULTIPLES", range_step=1, range_n_terms=20),
        PmL2ConceptDrillItem(DRILL_RANGE_SUM, range_archetype="MULTIPLES", range_step=2, range_n_terms=20),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 2 -- Single Digit (5-9) Direct Add-Less, Tens Rod, Abacus
# ---------------------------------------------------------------------------
PM_L2_LESSONS[2] = PmL2LessonRule(
    lesson_number=2,
    lesson_title="Single Digit (5-9) Direct Add-Less & Tens Rod",
    dps={
        1: PmL2DpsRule("Single Digit (5, 6, 7, 8, 9) Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [5, 6, 7, 8, 9], "1D", "DIRECT", "VISUAL"),
        2: PmL2DpsRule("Single Digit (5, 6, 7, 8, 9) Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [5, 6, 7, 8, 9], "1D", "DIRECT", "VISUAL"),
        3: PmL2DpsRule("Direct Add-Less Double Digit Using Ones & Tens Rod", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D_AND_2D", "DIRECT", "VISUAL", place_value="MIXED"),
        4: PmL2DpsRule("Addition & Subtraction - Abacus", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
        # No normal DPS5 block in the source -- DPS5 IS the concept drill (confirmed, matches Lesson 3).
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_RANGE_SUM, range_archetype="CONSECUTIVE", range_n_terms=30),
        PmL2ConceptDrillItem(DRILL_RANGE_SUM, range_archetype="ODD", range_n_terms=15),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 3 -- Bead Recognition & Double Digit Add-Sub
# ---------------------------------------------------------------------------
PM_L2_LESSONS[3] = PmL2LessonRule(
    lesson_number=3,
    lesson_title="Bead Recognition & Double Digit Addition-Subtraction",
    dps={
        1: PmL2DpsRule("Bead Recognition & Double Digit Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D_AND_2D", "DIRECT", "VISUAL", place_value="MIXED"),
        2: PmL2DpsRule("Addition-Subtraction (Abacus)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
        3: PmL2DpsRule("Bead Recognition 5 to 9 & Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D_AND_2D", "DIRECT", "VISUAL", place_value="MIXED"),
        4: PmL2DpsRule("Bead Recognition Number 50, 60, 70, 80, 90 Double Digit Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        # No normal DPS5 block -- DPS5 IS the concept drill.
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=34, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=108, less_value=13),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 4 -- Two Digit Direct Addition / Subtraction / Add-Less
# ---------------------------------------------------------------------------
PM_L2_LESSONS[4] = PmL2LessonRule(
    lesson_number=4,
    lesson_title="Two Digit Direct Addition, Subtraction & Add-Less",
    dps={
        1: PmL2DpsRule("Two Digit Addition (Direct Method)", "DIRECT_ADD_LESS", "ADDITION", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        2: PmL2DpsRule("Two Digit Addition (Direct Method)", "DIRECT_ADD_LESS", "ADDITION", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        3: PmL2DpsRule("Two Digit Subtraction (Direct Method)", "DIRECT_ADD_LESS", "SUBTRACTION", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        4: PmL2DpsRule("Two Digit Addition-Subtraction (Direct Method)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        5: PmL2DpsRule("Add-Less Practice with Abacus", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=42, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=147, less_value=14),
    ),
)


def _comp5_lesson(lesson_number: int, target: int) -> PmL2LessonRule:
    """Lesson 5's shared shape: DPS1-4 each drill one target number (1-4)
    using Complement of 5, both directions mixed within the same DPS (unlike
    PM-L1's L3-L10, which keep add/subtract on separate DPS numbers) --
    confirmed via title text "Addition & Subtraction of N using Complement
    of 5" on every one of DPS1-4, not just the DPS5 revision. DPS5 is the
    abacus revision across all four targets together.
    """
    return PmL2LessonRule(
        lesson_number=lesson_number,
        lesson_title=f"Addition & Subtraction of {target} (Complement of 5)" if lesson_number == 5 else f"Complement of 5, Target {target}",
        dps={
            1: PmL2DpsRule(f"Addition & Subtraction of {target} using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [target], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
            2: PmL2DpsRule(f"Addition & Subtraction of {target} using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [target], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
            3: PmL2DpsRule(f"Addition & Subtraction of {target} using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [target], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
            4: PmL2DpsRule(f"Addition & Subtraction of {target} using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [target], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
            5: PmL2DpsRule("Abacus - Addition & Subtraction", "MIXED_REVISION", "ADD_LESS", None, [1, 2, 3, 4], "2D", "REVISION", "ABACUS", revision_templates=("COMP5_ADD", "COMP5_SUB")),
        },
        concept_drill=(
            PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=53, times_value=12),
            PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=179, less_value=16),
        ),
    )


# ---------------------------------------------------------------------------
# Lesson 5 -- Addition & Subtraction of 1-4 (Complement of 5)
# Note: PM-L2's own DPS1-4 titles cover targets 1,2,3,4 in sequence within
# this single lesson (unlike PM-L1, which spreads one target per lesson) --
# reproduced here as a single PmL2LessonRule whose DPS1-4 each target a
# different number via target_numbers, not four separate lessons.
# ---------------------------------------------------------------------------
PM_L2_LESSONS[5] = PmL2LessonRule(
    lesson_number=5,
    lesson_title="Addition & Subtraction of 1, 2, 3, 4 (Complement of 5)",
    dps={
        1: PmL2DpsRule("Addition & Subtraction of 1 using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [1], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
        2: PmL2DpsRule("Addition & Subtraction of 2 using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [2], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
        3: PmL2DpsRule("Addition & Subtraction of 3 using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [3], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
        4: PmL2DpsRule("Addition & Subtraction of 4 using Complement of 5", "COMPLEMENT_OF_5", "ADD_LESS", None, [4], "1D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
        5: PmL2DpsRule("Abacus - Addition & Subtraction", "MIXED_REVISION", "ADD_LESS", None, [1, 2, 3, 4], "2D", "REVISION", "ABACUS", revision_templates=("COMP5_ADD", "COMP5_SUB")),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=53, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=179, less_value=16),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 6 -- Addition of 1-4 (Complement of 10), Complement-of-5 revision
# ---------------------------------------------------------------------------
PM_L2_LESSONS[6] = PmL2LessonRule(
    lesson_number=6,
    lesson_title="Addition of 1, 2, 3, 4 (Complement of 10)",
    dps={
        1: PmL2DpsRule("Addition of 1 using Complement of 10 (Add 10, Less 9)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_9", [1], "1D", "COMP10_ADD", "VISUAL"),
        2: PmL2DpsRule("Addition of 2 using Complement of 10 (Add 10, Less 8)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_8", [2], "1D", "COMP10_ADD", "VISUAL"),
        3: PmL2DpsRule("Addition of 3 using Complement of 10 (Add 10, Less 7)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_7", [3], "1D", "COMP10_ADD", "VISUAL"),
        4: PmL2DpsRule("Addition of 4 using Complement of 10 (Add 10, Less 6)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_6", [4], "1D", "COMP10_ADD", "VISUAL"),
        5: PmL2DpsRule("Addition & Subtraction using Complement of 5 (Revision)", "MIXED_REVISION", "ADD_LESS", None, [1, 2, 3, 4], "2D", "REVISION", "VISUAL", revision_templates=("COMP5_ADD", "COMP5_SUB")),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=65, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=257, less_value=24),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 7 -- Subtraction of 1-4 (Complement of 10), then Addition of 5
# ---------------------------------------------------------------------------
PM_L2_LESSONS[7] = PmL2LessonRule(
    lesson_number=7,
    lesson_title="Subtraction of 1, 2, 3, 4 & Addition of 5 (Complement of 10)",
    dps={
        1: PmL2DpsRule("Subtraction of 1 using Complement of 10 (Less 10, Add 9)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_9", [1], "1D", "COMP10_SUB", "VISUAL"),
        2: PmL2DpsRule("Subtraction of 2 using Complement of 10 (Less 10, Add 8)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_8", [2], "1D", "COMP10_SUB", "VISUAL"),
        3: PmL2DpsRule("Subtraction of 3 using Complement of 10 (Less 10, Add 7)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_7", [3], "1D", "COMP10_SUB", "VISUAL"),
        4: PmL2DpsRule("Subtraction of 4 using Complement of 10 (Less 10, Add 6)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_6", [4], "1D", "COMP10_SUB", "VISUAL"),
        5: PmL2DpsRule("Addition of 5 using Complement of 10 (Add 10, Less 5)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_5", [5], "2D", "COMP10_ADD", "ABACUS"),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=74, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=257, less_value=24),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 8 -- Addition & Subtraction of 6, 7 (Complement of 10)
# Genuine 6-block lesson: the source workbook prints two separate blocks
# both titled "DAILY PRACTICE SHEET -4" (one "Subtraction of 7", one
# "Addition & Subtraction of 6 & 7 combined") before the DPS5 revision
# block -- confirmed directly in the raw sheet dump, not an artifact.
# Numbered here as DPS1-6 to preserve every block rather than force it into
# the usual 5-DPS shape.
# ---------------------------------------------------------------------------
PM_L2_LESSONS[8] = PmL2LessonRule(
    lesson_number=8,
    lesson_title="Addition & Subtraction of 6, 7 (Complement of 10)",
    dps={
        1: PmL2DpsRule("Addition of 6 using Complement of 10 (Add 10, Less 4)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_4", [6], "1D_AND_2D", "COMP10_ADD", "VISUAL"),
        2: PmL2DpsRule("Subtraction of 6 using Complement of 10 (Less 10, Add 4)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_4", [6], "1D", "COMP10_SUB", "VISUAL"),
        3: PmL2DpsRule("Addition of 7 using Complement of 10 (Add 10, Less 3)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_3", [7], "1D_AND_2D", "COMP10_ADD", "ABACUS"),
        4: PmL2DpsRule("Subtraction of 7 using Complement of 10 (Less 10, Add 3)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_3", [7], "1D", "COMP10_SUB", "ABACUS"),
        5: PmL2DpsRule("Addition & Subtraction of 6 & 7 using Complement of 10", "MIXED_REVISION", "ADD_LESS", None, [6, 7], "1D_AND_2D", "REVISION", "ABACUS", revision_templates=("COMP10_ADD", "COMP10_SUB")),
        6: PmL2DpsRule("Revision of Addition using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", None, [6, 7], "1D_AND_2D", "COMP10_ADD", "ABACUS"),
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=84, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=286, less_value=27),
    ),
    concept_drill_dps_number=6,
)

# ---------------------------------------------------------------------------
# Lesson 9 -- Addition & Subtraction of 8, 9 (Complement of 10)
# No concept drill in this lesson -- confirmed, DPS5 is a plain revision
# block with nothing after it (unlike every other lesson except none; this
# is the sole lesson with zero concept-drill questions).
# ---------------------------------------------------------------------------
PM_L2_LESSONS[9] = PmL2LessonRule(
    lesson_number=9,
    lesson_title="Addition & Subtraction of 8, 9 (Complement of 10)",
    dps={
        1: PmL2DpsRule("Addition of 8 using Complement of 10 (Add 10, Less 2)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_2", [8], "1D_AND_2D", "COMP10_ADD", "ABACUS"),
        2: PmL2DpsRule("Subtraction of 8 using Complement of 10 (Less 10, Add 2)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_2", [8], "1D", "COMP10_SUB", "ABACUS"),
        3: PmL2DpsRule("Addition of 9 using Complement of 10 (Add 10, Less 1)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_1", [9], "1D_AND_2D", "COMP10_ADD", "ABACUS"),
        4: PmL2DpsRule("Subtraction of 9 using Complement of 10 (Less 10, Add 1)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_1", [9], "1D", "COMP10_SUB", "ABACUS"),
        5: PmL2DpsRule("Revision of Addition using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", None, [8, 9], "2D_FULL", "COMP10_ADD", "ABACUS"),
    },
    concept_drill=(),
)

# ---------------------------------------------------------------------------
# Lesson 10 -- Visual 2-Digit 3-Row, Abacus 3-Digit 3-Row Addition-Subtraction
# ---------------------------------------------------------------------------
PM_L2_LESSONS[10] = PmL2LessonRule(
    lesson_number=10,
    lesson_title="2-Digit & 3-Digit, 3-Row Addition-Subtraction",
    dps={
        1: PmL2DpsRule("Visual 2 Digit 3 Row Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        2: PmL2DpsRule("Visual 2 Digit 3 Row Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        3: PmL2DpsRule("Visual 2 Digit 3 Row Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED"),
        4: PmL2DpsRule("Abacus 3 Digit 3 Row Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", "ABACUS", place_value="MIXED"),
        # No normal DPS5 block -- DPS5 IS the concept drill.
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=87, times_value=12),
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=98, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=358, less_value=33),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=396, less_value=38),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 11 -- Revision of All Concepts, escalating to 3-Digit
# DPS3 escalates mid-sheet from 2-digit (Q1-10) to 3-digit (Q11-20) under a
# single DPS number -- confirmed against the source image
# (PM-L2_L11-DPS-3.png): the sheet itself carries two sub-titles ("VISUAL
# ADD LESS CONCEPTS" for A1-A10, "VISUAL 3 DIGIT ADDITION & SUBTRACTION" for
# A11-A20) within the one DPS-3 block.
# ---------------------------------------------------------------------------
PM_L2_LESSONS[11] = PmL2LessonRule(
    lesson_number=11,
    lesson_title="Revision of All Concepts & 3-Digit Addition-Subtraction",
    dps={
        1: PmL2DpsRule("Revision of All Add Less Concepts", "MIXED_REVISION", "ADD_LESS", None, [], "2D", "REVISION", "ABACUS", revision_templates=("DIRECT", "COMP5_ADD", "COMP5_SUB", "COMP10_ADD", "COMP10_SUB"), question_count=20),
        2: PmL2DpsRule("Revision of All Add Less Concepts", "MIXED_REVISION", "ADD_LESS", None, [], "2D", "REVISION", "ABACUS", revision_templates=("DIRECT", "COMP5_ADD", "COMP5_SUB", "COMP10_ADD", "COMP10_SUB"), question_count=20),
        3: PmL2DpsRule("Visual Add Less Concepts / Visual 3 Digit Addition & Subtraction", "MIXED_REVISION", "ADD_LESS", None, [], "2D_FULL", "REVISION", "VISUAL", revision_templates=("DIRECT",), question_count=20, digit_pattern_second_half="3D_FULL"),
        4: PmL2DpsRule("3 Digit Addition & Subtraction - Abacus", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", "ABACUS", place_value="MIXED", question_count=20),
        # No normal DPS5 block -- DPS5 IS the concept drill.
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=104, times_value=12),
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=116, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=408, less_value=42),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=417, less_value=38),
    ),
)

# ---------------------------------------------------------------------------
# Lesson 12 -- 3-Digit Addition-Subtraction, Visual & Abacus
# DPS4's title reads "3 DIGIT ... - VISUAL" in the source but its data is
# 2-digit -- confirmed a mislabelling by Shailesh (2026-08-05); title
# corrected to "2 Digit ..." below, digit_pattern set to match the real data.
# ---------------------------------------------------------------------------
PM_L2_LESSONS[12] = PmL2LessonRule(
    lesson_number=12,
    lesson_title="3-Digit Addition-Subtraction Revision",
    dps={
        1: PmL2DpsRule("3 Digit Addition & Subtraction - Visual", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", "VISUAL", place_value="MIXED", question_count=20),
        2: PmL2DpsRule("3 Digit Addition & Subtraction - Abacus", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", "ABACUS", place_value="MIXED", question_count=20),
        3: PmL2DpsRule("3 Digit Addition & Subtraction - Abacus", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", "ABACUS", place_value="MIXED", question_count=20),
        4: PmL2DpsRule("2 Digit Addition & Subtraction - Visual", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", "VISUAL", place_value="MIXED", question_count=10),
        # No normal DPS5 block -- DPS5 IS the concept drill.
    },
    concept_drill=(
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=138, times_value=12),
        PmL2ConceptDrillItem(DRILL_MULTIPLY, add_value=155, times_value=12),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=456, less_value=45),
        PmL2ConceptDrillItem(DRILL_DIVIDE, from_value=500, less_value=49),
    ),
)
