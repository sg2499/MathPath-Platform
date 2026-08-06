from dataclasses import dataclass, field


@dataclass
class PML3Config:
    """Preparatory Module Level 3 vertical Add/Less generation config.

    Same shape as PM-L2's PML2Config, with one real functional difference:
    `rows` is now genuinely load-bearing. PM-L1/PM-L2's operand builders
    (_wide_direct_stems/_complement_operand_triples) hardcode exactly 3 rows
    (row0 + 2 movements) -- confirmed by reading both packages directly, the
    `rows` field on their configs is asserted in validate_question but never
    actually drives variable-length construction. PM-L3's own workbook uses
    real row-count variety DPS to DPS (3R, 4R, 2R+2R mixed splits within one
    sheet -- see Level 3's Lesson 1 DPS1 "ADD/LESS (ABACUS)" 4-row grid vs
    Lesson 5 DPS4 "ADD/LESS 3D,4R" vs Lesson 11 DPS1's mixed "(3D,2R)&(2D,2R)"
    column groups), so this package's operands.py builds a genuine N-row
    chain instead.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    question_count: int = 10
    rows: int = 4
    concept_family: str = "DIRECT_ADD_LESS"
    operation_focus: str = "ADD_LESS"
    abacus_rule: str | None = None
    target_numbers: list[int] = field(default_factory=list)
    place_value: str = "ONES"
    digit_pattern: str = "1D"
    allow_negative_operands: bool = True
    allow_negative_answer: bool = False
    seed: str = "PM-L3-SEED"
    lesson_title: str | None = None
    dps_title: str | None = None
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = field(default_factory=tuple)
    practice_mode: str | None = None  # "ABACUS" | "VISUAL" | None
    # Second-half row/digit escalation within one DPS number, matching PM-L2's
    # digit_pattern_second_half convention (e.g. PM-L3 Lesson 11 DPS1: columns
    # 1-4 are "3D,2R", columns 5-10 are "2D,2R" -- both a digit_pattern AND a
    # rows change mid-sheet, so both overrides are provided here; PM-L2 only
    # ever needed the digit_pattern one).
    digit_pattern_second_half: str | None = None
    rows_second_half: int | None = None


# Concept-drill format constants -- identical formulas to PM-L2's, confirmed
# against PM-L3's own workbook (Lesson 1 DPS1: ADD=123,TIMES=5 -> 615;
# FROM=1330,LESS=123 -> 100, i.e. FROM mod LESS). See concept_drill.py.
DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"   # answer = ADD * TIMES
DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"       # answer = FROM mod LESS (repeated subtraction), remainder-zero pairs rejected


@dataclass
class PML3ConceptDrillConfig:
    """One Concept Drill (Abacus) question's generation config -- PM-L3
    lessons pair this with the wider vertical-stack Add/Less DPS, exactly
    the small "teaser" sub-block PM-L2 established (never a full 20-question
    DPS on its own).

    times_value stays a single fixed number for DPS-level seeding (Learning
    Path Studio previews) -- each DPS only ever embeds ONE Concept Drill
    Multiply row, and PM-L3's own workbook shows a specific, verified TIMES
    value per lesson (5, 6, 7, 8, 9 -- see preparatory_module_l3_config.py's
    _drill_mult calls), unlike PM-L2 whose workbook uses 12 everywhere. But
    assessments/mocks draw MANY questions from one concept-pool entry
    (Section 5 - Concept Drill), and pinning all of them to one fixed TIMES
    (previously always 12, copied from PM-L2's convention without checking
    PM-L3's own workbook) makes the whole section guessable after the first
    question -- Shailesh's 2026-08-06 catch. times_min/times_max (both set)
    override times_value with a fresh random draw per question, sourced from
    PM-L3's own observed 5-9 range; left None (the default), behavior is
    unchanged from before -- a single fixed times_value, exactly as DPS-level
    seeding still needs.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    drill_format: str  # DRILL_MULTIPLY | DRILL_DIVIDE
    seed: str = "PM-L3-DRILL-SEED"
    add_min: int = 1
    add_max: int = 500
    times_value: int = 12
    times_min: int | None = None
    times_max: int | None = None
    from_min: int = 1
    from_max: int = 3999
    less_min: int = 2
    less_max: int = 299


@dataclass
class PML3MultiplyConfig:
    """"2D X 1D (ABACUS/VISUAL)" -- PM-L3's dominant new skill, a full
    standalone DPS (10 or 20 questions), not a small teaser. Answer =
    number * multiplier, plain multiplication. Workbook progression
    confirmed lesson to lesson: Lesson 1 constrains multiplier to 1, then
    1-4; by Lesson 9-11 it's the full 1-9 range with 2-digit operands up to
    the 90s (e.g. 81x6, 67x8, 58x9), giving 3-digit products. number_min/max
    and multiplier_min/max are set per-DPS from the workbook's own observed
    range, not literal replay of its specific digits.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "PM-L3-MULTIPLY-SEED"
    number_min: int = 11
    number_max: int = 99
    multiplier_min: int = 1
    multiplier_max: int = 9
    practice_mode: str | None = None  # "ABACUS" | "VISUAL"


@dataclass
class PML3DivideConfig:
    """"3D ÷ 1D (ABACUS)" -- appears once in the workbook (Lesson 10 DPS3,
    10 literal instances, e.g. 582/6=97, 117/9=13, 680/8=85), always an exact
    division (zero remainder). Shailesh's explicit instruction (2026-08-06):
    assessments/mocks need a genuine, wide-range generator here (Section 4 -
    Division pools every division sum in the level), not replay of the 10
    workbook rows -- built by picking a divisor and quotient first and
    multiplying them to guarantee exactness, the same technique the workbook
    itself evidently used, rather than picking a random 3-digit dividend and
    hoping it happens to divide evenly.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "PM-L3-DIVIDE-SEED"
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999


# BODMAS template constants -- three distinct term-shapes confirmed across
# the workbook (see bodmas.py for the full derivation and literal-answer
# verification of each).
BODMAS_SIMPLE_BRACKET = "PM_L3_SIMPLE_BRACKET"        # (a +/- b) x c  OR  c x (a +/- b) -- Lessons 2-4
BODMAS_COMPOUND = "PM_L3_COMPOUND"                    # base +/- (a x b) +/- c  OR  base +/- a x b +/- (c -/+ d) -- Lesson 5
BODMAS_CHAINED = "PM_L3_CHAINED"                      # a x b +/- (c -/+ d) +/- e -- Lessons 6, 7, 12


@dataclass
class PML3BodmasConfig:
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    template: str  # BODMAS_SIMPLE_BRACKET | BODMAS_COMPOUND | BODMAS_CHAINED
    seed: str = "PM-L3-BODMAS-SEED"
    # SIMPLE_BRACKET: (a +/- b) x c
    simple_bracket_min: int = 4
    simple_bracket_max: int = 20
    simple_multiplier_min: int = 2
    simple_multiplier_max: int = 6
    # COMPOUND / CHAINED shared ranges
    base_min: int = 100
    base_max: int = 260
    multiplier_left_min: int = 2
    multiplier_left_max: int = 9
    multiplier_right_min: int = 4
    multiplier_right_max: int = 9
    tail_min: int = 20
    tail_max: int = 95
    bracket_min: int = 20
    bracket_max: int = 95
