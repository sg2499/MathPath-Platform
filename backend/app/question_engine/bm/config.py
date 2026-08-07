from dataclasses import dataclass, field


@dataclass
class BMConfig:
    """Bridge Module Level 1 vertical Add/Less generation config.

    Same shape as PM-L4's PML4Config (BM-L1 is structurally the closest
    match: 40 lessons that ramp from 1D bead recognition all the way to
    4D,4R Add/Less, 2D X 1D multiplication, 2D/3D exact division, 3D ÷ 1D
    WITH REMAINDER, BODMAS, and Concept Drill -- see
    docs/reference-materials/BM/ for the full audit). `rows` is genuinely
    load-bearing (operands.py builds a real N-row chain, not a hardcoded
    constant). digit_pattern accepts "1D", "2D_FULL", "3D_HUNDREDS",
    "3D_FULL", "4D_THOUSANDS", "4D_FULL" -- same widened set PM-L4
    introduced, since BM-L1 reaches the same 4-digit ceiling.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    question_count: int = 10
    rows: int = 3
    concept_family: str = "DIRECT_ADD_LESS"
    operation_focus: str = "ADD_LESS"
    abacus_rule: str | None = None
    target_numbers: list[int] = field(default_factory=list)
    place_value: str = "ONES"
    digit_pattern: str = "1D"
    allow_negative_operands: bool = True
    allow_negative_answer: bool = False
    seed: str = "BM-L1-SEED"
    lesson_title: str | None = None
    dps_title: str | None = None
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = field(default_factory=tuple)
    practice_mode: str | None = None  # "ABACUS" | "VISUAL" | None
    # Mixed-width single-stack Add/Less: e.g. Lesson 18 DPS1's "Add/Less
    # (Abacus), 3D,2R + 2D,2R" means every question is ONE stack of 4 rows --
    # `rows` rows at `digit_pattern` width, followed by `rows_second_half`
    # rows at `digit_pattern_second_half` width, all in the same running
    # total (see operands.py's _row_width_schedule/total_row_count -- ported
    # directly from PM-L4's 2026-08-07 fix, built correctly here from day
    # one). BM's own workbook uses BOTH "&" and "+" as the title separator
    # inconsistently -- this field is always driven by the seed config's
    # structural row/width data, never by parsing the title string.
    digit_pattern_second_half: str | None = None
    rows_second_half: int | None = None


# Concept-drill format constants -- identical formulas to PM-L2/L3/L4's
# (confirmed against BM-L1's own workbook, e.g. Lesson 16 DPS1: ADD=23,
# TIMES=5 -> 115; FROM=549, LESS=42 -> 549 mod 42 = 3). See concept_drill.py.
DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"   # answer = ADD * TIMES
DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"       # answer = FROM mod LESS (repeated subtraction), remainder-zero pairs rejected


@dataclass
class BMConceptDrillConfig:
    """One Concept Drill (Abacus) question's generation config.

    TIMES: BM-L1's own workbook shows TIMES pinned literally to 5 in the
    lessons audited (e.g. Lesson 16 DPS1, Lesson 17 DPS1) -- same pattern
    PM-L4's workbook had. Following PM-L4's precedent (Shailesh, 2026-08-06:
    "avoid a fully static/guessable Concept Drill Multiply row"), BM-L1
    randomizes TIMES 5-10 across ALL THREE flows (DPS, assessment, AND
    mock) rather than replaying the literal 5. times_min/times_max default
    to 5/10 (populated, not None); times_value is kept only as a legacy
    fallback field, unused in practice for this level.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    drill_format: str  # DRILL_MULTIPLY | DRILL_DIVIDE
    seed: str = "BM-L1-DRILL-SEED"
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
class BMMultiplyConfig:
    """"2D X 1D (ABACUS/VISUAL)" -- BM-L1's standalone Multiply DPS. Unlike
    every PM level, BM-L1's workbook genuinely varies the question count per
    DPS (10 in some DPS, 20 -- two parallel 10-question grids -- in others),
    so question_count is passed explicitly per DPS by the seed config rather
    than assumed flat.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "BM-L1-MULTIPLY-SEED"
    number_min: int = 11
    number_max: int = 99
    multiplier_min: int = 1
    multiplier_max: int = 9
    practice_mode: str | None = None  # "ABACUS" | "VISUAL"


@dataclass
class BMDivideConfig:
    """Exact division ("2D ÷ 1D" or "3D ÷ 1D") -- always zero remainder.
    Same two-width shape as PM-L4: digit_width distinguishes 2D÷1D
    (dividend 10-99) from 3D÷1D (dividend 100-999). Built the same
    guaranteed-exact way: pick divisor and quotient first, multiply to get
    the dividend.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    digit_width: int = 3  # 2 or 3 -- which exact-division variant this is
    seed: str = "BM-L1-DIVIDE-SEED"
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999


@dataclass
class BMDivideRemainderConfig:
    """"3D ÷ 1D WITH REMAINDER(S)" -- appears Lessons 36-40 (the final block
    of the level), same "Q, R" compound-answer convention as PM-L4 (verified
    against BM-L1's own workbook, e.g. Lesson 36 DPS5: 214 ÷ 7 -> "30, 4").
    Built the same guaranteed-construction way: pick divisor and quotient
    first, then ADD a nonzero remainder strictly less than the divisor.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    seed: str = "BM-L1-DIVIDE-REMAINDER-SEED"
    divisor_min: int = 2
    divisor_max: int = 9
    dividend_min: int = 100
    dividend_max: int = 999


# BODMAS template constants. BM-L1's workbook, like PM-L4's, authors these
# as free-form typed expressions rather than a small fixed set -- derived
# four representative shapes from the literal expressions read across
# Lessons 17-40 (see bodmas.py for the full derivation and literal-answer
# verification of each). One more shape than PM-L4 needed
# (BM_PRODUCT_AFTER_TAIL) because BM's workbook very frequently places the
# bracketed product AFTER a plain tail term rather than immediately after
# the base (e.g. "37 + 88 - (9 x 9) + 58"), a shape PM-L4's own workbook
# didn't use.
BODMAS_BM_BRACKET_PRODUCT = "BM_BRACKET_PRODUCT"     # base +/- (a x b) +/- c [+/- d]  e.g. "121 + (34 x 6) - 68"
BODMAS_BM_PLAIN_PRODUCT = "BM_PLAIN_PRODUCT"         # [base] +/- a x b +/- c +/- d    e.g. "205 + 52 x 8 + 85 -48"
BODMAS_BM_BRACKET_SUM = "BM_BRACKET_SUM"             # base +/- (p +/- q) +/- c +/- d x e  e.g. "77- (50 +18) + 25 + 40 x 2"
BODMAS_BM_PRODUCT_AFTER_TAIL = "BM_PRODUCT_AFTER_TAIL"  # base +/- c +/- (a x b) [+/- d]  e.g. "37 + 88 - (9 x 9) + 58"


@dataclass
class BMBodmasConfig:
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    template: str  # one of the BODMAS_BM_* constants above
    seed: str = "BM-L1-BODMAS-SEED"
    base_min: int = 20
    base_max: int = 300
    multiplier_left_min: int = 2
    multiplier_left_max: int = 9
    multiplier_right_min: int = 2
    multiplier_right_max: int = 9
    tail_min: int = 10
    tail_max: int = 100
    bracket_min: int = 10
    bracket_max: int = 100
    # BRACKET_PRODUCT only -- whether a 4th (optional) tail term is included
    include_extra_tail: bool = True
