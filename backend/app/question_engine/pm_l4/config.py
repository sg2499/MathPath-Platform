from dataclasses import dataclass, field


@dataclass
class PML4Config:
    """Preparatory Module Level 4 vertical Add/Less generation config.

    Same shape as PM-L3's PML3Config -- `rows` is genuinely load-bearing
    (operands.py builds a real N-row chain, not a hardcoded 3). New vs
    PM-L3: PM-L4's own workbook goes up to 4-digit operands and 5-row
    chains (Lesson 5 DPS1 "ADD/LESS (2D,5R) (VISUAL)"; Lesson 2 DPS5,
    Lesson 6 DPS1, Lesson 8 DPS5 "ADD/LESS (4D,4R) (ABACUS)"; Lesson 10
    DPS1 "(4D,3R)"), so digit_pattern now also accepts "4D_FULL" (see
    operands.py's WIDE_DIRECT_PATTERNS extension).
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
    seed: str = "PM-L4-SEED"
    lesson_title: str | None = None
    dps_title: str | None = None
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = field(default_factory=tuple)
    practice_mode: str | None = None  # "ABACUS" | "VISUAL" | None
    # Mixed-width single-stack Add/Less: e.g. Lesson 6 DPS5's "Add/Less
    # 4D,1R & 3D,2R (Visual)" means every question is ONE stack of 3 rows --
    # `rows` rows at `digit_pattern` width, followed by `rows_second_half`
    # rows at `digit_pattern_second_half` width, all in the same running
    # total (see operands.py's _row_width_schedule/total_row_count). Fixed
    # 2026-08-07: an earlier implementation misread this as "generate the
    # first half of the DPS's questions at one pure width, the second half
    # at another pure width" -- caught live by Shailesh from a Lesson 6
    # DPS5 preview screenshot showing exactly that wrong split.
    digit_pattern_second_half: str | None = None
    rows_second_half: int | None = None


# Concept-drill format constants -- identical formulas to PM-L2/PM-L3's,
# confirmed against PM-L4's own workbook (e.g. Lesson 1: ADD=1234, TIMES=5
# -> 6170; FROM/LESS pairs verified non-guessable). See concept_drill.py.
DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"   # answer = ADD * TIMES
DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"       # answer = FROM mod LESS (repeated subtraction), remainder-zero pairs rejected


@dataclass
class PML4ConceptDrillConfig:
    """One Concept Drill (Abacus) question's generation config.

    TIMES (Shailesh, 2026-08-06): PM-L4's own workbook shows TIMES pinned
    literally to 5 in every single lesson (unlike PM-L3, where it genuinely
    varied 5-9 lesson to lesson) -- but Shailesh explicitly instructed that,
    to avoid a fully static/guessable Concept Drill Multiply row, PM-L4
    should randomize TIMES in range 5-10 across ALL THREE flows (DPS,
    assessment, AND mock), a deliberate deviation from PM-L3's precedent of
    keeping DPS-level literal. times_min/times_max therefore default to
    5/10 here (populated, not None) -- every PM-L4 seed config leaves them
    at the default rather than pinning times_value, so DPS-level Learning
    Path Studio previews also draw a fresh random TIMES per question.
    times_value is kept only as a legacy fallback field, unused in practice
    for this level.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    drill_format: str  # DRILL_MULTIPLY | DRILL_DIVIDE
    seed: str = "PM-L4-DRILL-SEED"
    add_min: int = 1000
    add_max: int = 4999
    times_value: int = 5
    times_min: int | None = 5
    times_max: int | None = 10
    from_min: int = 1000
    from_max: int = 5999
    less_min: int = 100
    less_max: int = 599


@dataclass
class PML4MultiplyConfig:
    """"2D X 1D (ABACUS/VISUAL)" -- same shape as PM-L3's standalone
    Multiply DPS. PM-L4 does not introduce a wider multiplication variant
    (confirmed in the findings report), so this is the level's only
    multiply config.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "PM-L4-MULTIPLY-SEED"
    number_min: int = 11
    number_max: int = 99
    multiplier_min: int = 1
    multiplier_max: int = 9
    practice_mode: str | None = None  # "ABACUS" | "VISUAL"


@dataclass
class PML4DivideConfig:
    """Exact division ("2D ÷ 1D" or "3D ÷ 1D") -- always zero remainder.
    PM-L4 has TWO exact-division widths (new vs PM-L3, which only had
    3D ÷ 1D): a smaller/easier "2D ÷ 1D" variant introduced in Lessons 5,
    6, 7, 9, alongside the familiar "3D ÷ 1D". Both use this same config
    shape, distinguished only by dividend_min/dividend_max (10-99 vs
    100-999) and the digit_width tag used for metadata/generation_template.
    Built the same guaranteed-exact way as PM-L3: pick divisor and
    quotient first, multiply to get the dividend.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    digit_width: int = 3  # 2 or 3 -- which exact-division variant this is
    seed: str = "PM-L4-DIVIDE-SEED"
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999


@dataclass
class PML4DivideRemainderConfig:
    """"3D ÷ 1D WITH REMAINDER(S)" -- PM-L4's genuinely new concept, no
    PM-L1/L2/L3 precedent (confirmed in the findings report). Real division
    that does NOT divide evenly; correct_answer is stored as a combined
    "Q, R" text string (e.g. "73, 1"), per Shailesh's 2026-08-06 decision --
    matching the workbook's own literal answer-key cell shape ("73 ,  1").
    Built the same guaranteed-construction way as exact division (pick
    divisor and quotient first, then ADD a nonzero remainder strictly less
    than the divisor) so a genuine remainder is guaranteed by construction,
    never by filtering random dividends for luck.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "PM-L4-DIVIDE-REMAINDER-SEED"
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999


# BODMAS template constants -- PM-L4's BODMAS is authored as free-form
# typed expressions in the workbook (not PM-L3's three fixed shapes), so
# this level derives its own small set of representative shapes from the
# 55 literal expressions read across all 12 lessons (see bodmas.py for the
# full derivation and literal-answer verification of each).
BODMAS_L4_BRACKET_PRODUCT = "PM_L4_BRACKET_PRODUCT"   # base +/- (a x b) +/- c [+/- d]  e.g. "102- (21 X 4) + 60 -70"
BODMAS_L4_PLAIN_PRODUCT = "PM_L4_PLAIN_PRODUCT"       # base +/- a x b +/- c +/- d      e.g. "98 + 30 x 8 - 50 + 12"
BODMAS_L4_BRACKET_SUM = "PM_L4_BRACKET_SUM"           # base +/- (p +/- q) +/- c +/- d x e  e.g. "77- (50 +18) + 25 + 40 x 2"


@dataclass
class PML4BodmasConfig:
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    template: str  # BODMAS_L4_BRACKET_PRODUCT | BODMAS_L4_PLAIN_PRODUCT | BODMAS_L4_BRACKET_SUM
    seed: str = "PM-L4-BODMAS-SEED"
    base_min: int = 50
    base_max: int = 260
    multiplier_left_min: int = 2
    multiplier_left_max: int = 9
    multiplier_right_min: int = 2
    multiplier_right_max: int = 9
    tail_min: int = 12
    tail_max: int = 95
    bracket_min: int = 12
    bracket_max: int = 95
    # BRACKET_PRODUCT only -- whether a 4th (optional) tail term is included
    include_extra_tail: bool = True
