"""Curriculum config for Preparatory Module (PM) Level 1, Lessons 1-15.

Per product decision (2026-08-04): PM-L1's first 15 lessons must be an exact
replica of Bridge Module's first 15 lessons (BL-1..BL15), because a student
can enter the platform via three separate paths -- YLM, Bridge, or PM-L1 --
and all three must land students at the same competency level before
Intermediate/Master Module. PM-L1's own prior/legacy 26-lesson curriculum is
intentionally not used or referenced here.

Source of truth: Bridge Module Excel (Bridge Level.xlsx), first 15 sheets,
cross-checked against the matching lesson image assets (Lesson-1..Lesson-15,
5 DPS each) supplied alongside it. Every DPS below reproduces that lesson's
taught concept, complement technique, and target number(s) -- not the exact
literal numbers from the spreadsheet (those are a fixed static worksheet;
the platform generates a fresh, validated worksheet per publish/attempt the
same way every other module does), but the same Golden-Step-style concept
family, movement type, and difficulty pattern.

PM has its own fully independent question_engine package
(question_engine/pm/ -- config.py/operands.py/validators.py/distractors.py/
generator.py, zero imports from ylm/mm/im), wired in via
generation_service.generate_preview/persist_question_set routing on
module_code == "PM" straight to generate_pm_question_set(). (An earlier
version of this docstring claimed PM fell back to the YLM generator and
that two small YLM-side additions -- "2D_FULL"/"3D_HUNDREDS"/"3D_FULL" in
ylm/operands.py's _direct_bases(), and a module_code=="YLM" scope on
_lesson_templates()'s REVISION_TEMPLATE_SCHEDULES lookup -- were needed to
support it. Both of those YLM-side changes are real and still present, but
they were leftover intent from an earlier design pass, not what actually
shipped; PM-L1 DPS generation has never gone through the YLM engine.
Corrected 2026-08-05.)

Digit-width note (corrected 2026-08-05, see PM_L1_LESSONS below): within
every complement lesson (3-15), DPS1/DPS3 are single-digit-only practice of
a technique and DPS2/DPS4 are a strict double-digit escalation of that same
technique -- confirmed against both the Excel and the lesson images (e.g.
Lesson 3 DPS1 "Addition of 1 using Complement of 5" is base=4 only across
all 10 questions; DPS2, same title/technique, is a double-digit base
{14,24,...,94} across all 10). DPS5 (revision, both techniques together) is
likewise pure double-digit, not a single/double mix. digit_pattern="2D" now
exists specifically to express this for the COMP5_ADD/COMP5_SUB/
COMP10_ADD/COMP10_SUB templates in question_engine/pm/operands.py
(_comp_tens_values()) -- it was previously accepted but silently ignored by
those four functions, so every DPS in a complement lesson drew from the
exact same undifferentiated single+double-digit pool regardless of what
digit_pattern said.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class PmDpsRule:
    dps_title: str
    concept_family: str
    operation_focus: str
    abacus_rule: str | None
    target_numbers: list[int]
    digit_pattern: str
    generation_template: str
    revision_templates: tuple[str, ...] = ()
    place_value: str = "ONES"
    rows: int = 3
    question_count: int = 10


@dataclass(frozen=True)
class PmLessonRule:
    lesson_number: int
    lesson_title: str
    dps: dict[int, PmDpsRule]


PM_L1_LESSONS: dict[int, PmLessonRule] = {}

# ---------------------------------------------------------------------------
# Lesson 1 -- Bead Recognition & Single Digit Addition-Subtraction (1-4)
# Matches BL-1 exactly (this is the one Bridge lesson that is also a verified
# byte-for-byte match with PM-L1's own former Lesson 1).
# ---------------------------------------------------------------------------
PM_L1_LESSONS[1] = PmLessonRule(
    lesson_number=1,
    lesson_title="Bead Recognition & Single Digit Addition-Subtraction (1-4)",
    dps={
        1: PmDpsRule("Bead Recognition & Single Digit Addition-Subtraction (1, 2, 3, 4)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D", "DIRECT"),
        2: PmDpsRule("Bead Recognition & Single Digit Addition-Subtraction (1, 2, 3, 4)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D", "DIRECT"),
        3: PmDpsRule("Bead Recognition Number '5', '6', '7', '8' & '9' & Direct Add-Less Using 5", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D", "DIRECT"),
        4: PmDpsRule("Bead Recognition 5 to 9 & Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D", "DIRECT"),
        5: PmDpsRule("Bead Recognition & Double Digit Addition-Subtraction (Ones & Tens)", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "1D_AND_2D", "DIRECT", place_value="MIXED"),
    },
)

# ---------------------------------------------------------------------------
# Lesson 2 -- Double & Triple Digit Direct Addition-Subtraction
# Bridge introduces 3-digit direct addition/subtraction here, a full lesson
# earlier than PM-L1's own former curriculum did.
# ---------------------------------------------------------------------------
PM_L1_LESSONS[2] = PmLessonRule(
    lesson_number=2,
    lesson_title="Double & Triple Digit Direct Addition-Subtraction",
    dps={
        1: PmDpsRule("Bead Recognition & Double Digit Direct Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", place_value="MIXED"),
        2: PmDpsRule("Bead Recognition & Double Digit Direct Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", place_value="MIXED"),
        3: PmDpsRule("Bead Recognition & Double Digit Direct Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "2D_FULL", "DIRECT", place_value="MIXED"),
        4: PmDpsRule("Bead Recognition & Double Digit Direct Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_HUNDREDS", "DIRECT", place_value="MIXED"),
        5: PmDpsRule("Bead Recognition & Triple Digit Direct Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "3D_FULL", "DIRECT", place_value="MIXED"),
    },
)


def _complement_pair_lesson(lesson_number: int, lesson_title: str, target: int, operation_focus: str, abacus5: str | None, abacus10: str, dps5_title: str) -> PmLessonRule:
    """Shared shape for lessons 3-10: DPS1-2 = complement of 5 (SB; only
    exists for targets 1-4), DPS3-4 = complement of 10 (BB), DPS5 = mixed
    double-digit practice blending both techniques for the same target
    number. This is exactly where Bridge diverges from PM-L1's own former
    curriculum, which taught SB and BB for a given target several lessons
    apart with two targets grouped per lesson instead of one.
    """
    comp5_template = "COMP5_ADD" if operation_focus == "ADDITION" else "COMP5_SUB"
    comp10_template = "COMP10_ADD" if operation_focus == "ADDITION" else "COMP10_SUB"
    title5 = f"Addition of {target} using Complement of 5 (Add 5, Less {5 - target})" if operation_focus == "ADDITION" else f"Subtraction of {target} using Complement of 5 (Less 5, Add {5 - target})"
    title10 = f"Addition of {target} using Complement of 10 (Add 10, Less {10 - target})" if operation_focus == "ADDITION" else f"Subtraction of {target} using Complement of 10 (Less 10, Add {10 - target})"
    return PmLessonRule(
        lesson_number=lesson_number,
        lesson_title=lesson_title,
        dps={
            1: PmDpsRule(title5, "COMPLEMENT_OF_5", operation_focus, abacus5, [target], "1D", comp5_template),
            2: PmDpsRule(title5, "COMPLEMENT_OF_5", operation_focus, abacus5, [target], "2D", comp5_template),
            3: PmDpsRule(title10, "COMPLEMENT_OF_10", operation_focus, abacus10, [target], "1D", comp10_template),
            4: PmDpsRule(title10, "COMPLEMENT_OF_10", operation_focus, abacus10, [target], "2D", comp10_template),
            5: PmDpsRule(dps5_title, "MIXED_REVISION", operation_focus, None, [target], "2D", "REVISION", revision_templates=(comp5_template, comp10_template), place_value="MIXED"),
        },
    )


PM_L1_LESSONS[3] = _complement_pair_lesson(3, "Addition of 1 (Complement of 5 & 10)", 1, "ADDITION", "ADD_5_LESS_4", "ADD_10_LESS_9", "Bead Recognition & Double Digit Addition of 1 using Complements of 5 & 10")
PM_L1_LESSONS[4] = _complement_pair_lesson(4, "Subtraction of 1 (Complement of 5 & 10)", 1, "SUBTRACTION", "LESS_5_ADD_4", "LESS_10_ADD_9", "Double Digit Subtraction of 1 using Complements of 5 & 10")
PM_L1_LESSONS[5] = _complement_pair_lesson(5, "Addition of 2 (Complement of 5 & 10)", 2, "ADDITION", "ADD_5_LESS_3", "ADD_10_LESS_8", "Double Digit Addition of 2 using Complements of 5 & 10")
PM_L1_LESSONS[6] = _complement_pair_lesson(6, "Subtraction of 2 (Complement of 5 & 10)", 2, "SUBTRACTION", "LESS_5_ADD_3", "LESS_10_ADD_8", "Double Digit Subtraction of 2 using Complements of 5 & 10")
PM_L1_LESSONS[7] = _complement_pair_lesson(7, "Addition of 3 (Complement of 5 & 10)", 3, "ADDITION", "ADD_5_LESS_2", "ADD_10_LESS_7", "Double Digit Addition of 3 using Complements of 5 & 10")
PM_L1_LESSONS[8] = _complement_pair_lesson(8, "Subtraction of 3 (Complement of 5 & 10)", 3, "SUBTRACTION", "LESS_5_ADD_2", "LESS_10_ADD_7", "Double Digit Subtraction of 3 using Complements of 5 & 10")
PM_L1_LESSONS[9] = _complement_pair_lesson(9, "Addition of 4 (Complement of 5 & 10)", 4, "ADDITION", "ADD_5_LESS_1", "ADD_10_LESS_6", "Double Digit Addition of 4 using Complements of 5 & 10")
PM_L1_LESSONS[10] = _complement_pair_lesson(10, "Subtraction of 4 (Complement of 5 & 10)", 4, "SUBTRACTION", "LESS_5_ADD_1", "LESS_10_ADD_6", "Double Digit Subtraction of 4 using Complements of 5 & 10")

# ---------------------------------------------------------------------------
# Lesson 11 -- Addition & Subtraction of 5 (Complement of 10 only; 5 is the
# anchor number, so there is no complement-of-5 sub-technique for it).
# ---------------------------------------------------------------------------
PM_L1_LESSONS[11] = PmLessonRule(
    lesson_number=11,
    lesson_title="Addition & Subtraction of 5 (Complement of 10)",
    dps={
        1: PmDpsRule("Addition of 5 using Complement of 10 (Add 10, Less 5)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_5", [5], "1D", "COMP10_ADD"),
        2: PmDpsRule("Addition of 5 using Complement of 10 (Add 10, Less 5)", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_5", [5], "2D", "COMP10_ADD"),
        3: PmDpsRule("Subtraction of 5 using Complement of 10 (Less 10, Add 5)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_5", [5], "1D", "COMP10_SUB"),
        4: PmDpsRule("Subtraction of 5 using Complement of 10 (Less 10, Add 5)", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_5", [5], "2D", "COMP10_SUB"),
        5: PmDpsRule("Addition & Subtraction of 5 using Complement of 10", "MIXED_REVISION", "ADD_LESS", None, [5], "2D", "REVISION", revision_templates=("COMP10_ADD", "COMP10_SUB")),
    },
)


def _paired_complement10_lesson(lesson_number: int, lesson_title: str, targets: tuple[int, int], operation_focus: str) -> PmLessonRule:
    """Lessons 12-15: paired complement-of-10 numbers (6&7, then 8&9), one
    addition lesson and one subtraction lesson per pair. DPS5 covers both
    numbers of the pair in a single sheet; since both share one technique
    (COMP10_ADD or COMP10_SUB), no REVISION rotation is needed -- the
    template's own multi-target support (config.target_numbers = [a, b])
    handles it directly and was verified to draw from both targets.
    """
    template = "COMP10_ADD" if operation_focus == "ADDITION" else "COMP10_SUB"
    verb = "Addition" if operation_focus == "ADDITION" else "Subtraction"
    prep = "Add" if operation_focus == "ADDITION" else "Less"
    counter = "Less" if operation_focus == "ADDITION" else "Add"
    a, b = targets
    title_a = f"{verb} of {a} using Complement of 10 ({prep} 10, {counter} {10 - a})"
    title_b = f"{verb} of {b} using Complement of 10 ({prep} 10, {counter} {10 - b})"
    title_both = f"{verb} of {a} & {b} using Complement of 10"
    return PmLessonRule(
        lesson_number=lesson_number,
        lesson_title=lesson_title,
        dps={
            1: PmDpsRule(title_a, "COMPLEMENT_OF_10", operation_focus, f"{prep.upper()}_10_{counter.upper()}_{10 - a}", [a], "1D", template),
            2: PmDpsRule(title_a, "COMPLEMENT_OF_10", operation_focus, f"{prep.upper()}_10_{counter.upper()}_{10 - a}", [a], "2D", template),
            3: PmDpsRule(title_b, "COMPLEMENT_OF_10", operation_focus, f"{prep.upper()}_10_{counter.upper()}_{10 - b}", [b], "1D", template),
            4: PmDpsRule(title_b, "COMPLEMENT_OF_10", operation_focus, f"{prep.upper()}_10_{counter.upper()}_{10 - b}", [b], "2D", template),
            5: PmDpsRule(title_both, "COMPLEMENT_OF_10", operation_focus, None, [a, b], "2D", template),
        },
    )


PM_L1_LESSONS[12] = _paired_complement10_lesson(12, "Addition of 6 & 7 (Complement of 10)", (6, 7), "ADDITION")
PM_L1_LESSONS[13] = _paired_complement10_lesson(13, "Subtraction of 6 & 7 (Complement of 10)", (6, 7), "SUBTRACTION")
PM_L1_LESSONS[14] = _paired_complement10_lesson(14, "Addition of 8 & 9 (Complement of 10)", (8, 9), "ADDITION")
PM_L1_LESSONS[15] = _paired_complement10_lesson(15, "Subtraction of 8 & 9 (Complement of 10)", (8, 9), "SUBTRACTION")
