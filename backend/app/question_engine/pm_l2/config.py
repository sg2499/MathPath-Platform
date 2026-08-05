from dataclasses import dataclass, field


@dataclass
class PML2Config:
    """Preparatory Module Level 2 generation config.

    Deliberately its own dataclass, in its own package (question_engine/pm_l2),
    fully separate from question_engine/pm (PM-L1's engine) and never imported
    by it or importing from it -- per Shailesh's explicit instruction
    (2026-08-05) that every level gets a dedicated engine so a change to one
    level's generation logic can never silently affect another. Where PM-L2's
    underlying abacus technique is genuinely identical to PM-L1's (DIRECT,
    COMPLEMENT_OF_5, COMPLEMENT_OF_10 bead movement rules -- the physics of
    the abacus itself doesn't change between levels), the *logic* is copied
    into this package's own validators.py/operands.py rather than imported,
    so PM-L1 and PM-L2 can each evolve independently with zero coupling.

    Adds two things PM-L1's PMConfig never needed:
    - practice_mode: "ABACUS" | "VISUAL" -- PM-L2's workbook explicitly tags
      most DPS sheets as one or the other (student does the sheet mentally/by
      visualization vs. with a physical abacus); untagged sheets default to
      ABACUS per Shailesh's 2026-08-05 instruction. Purely descriptive/display
      metadata -- does not change how questions are generated or scored.
    - concept-drill fields (drill_format/drill_add_range/etc.) -- PM-L2
      introduces a "CONCEPT DRILL (ABACUS)" question format in most lessons
      that is NOT a variant of the vertical 3-row add/less stack: it's one of
      three distinct formats (multiply-as-repeated-addition, divide-as-
      repeated-subtraction, range-sum), each with its own answer formula. See
      concept_drill.py for the actual generation logic.
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
    seed: str = "PM-L2-SEED"
    lesson_title: str | None = None
    dps_title: str | None = None
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = field(default_factory=tuple)
    practice_mode: str | None = None  # "ABACUS" | "VISUAL" | None (unspecified)
    # Second-half digit pattern override, for the rare DPS whose own 20
    # questions escalate mid-sheet (e.g. PM-L2 Lesson 11 DPS3: A1-A10 are
    # 2-digit, A11-A20 are 3-digit, both under the same DPS number, confirmed
    # against the source image). None means "uniform digit_pattern
    # throughout" (true for the vast majority of PM-L2 DPS).
    digit_pattern_second_half: str | None = None


# Concept-drill format constants -- see concept_drill.py.
DRILL_MULTIPLY = "CONCEPT_DRILL_MULTIPLY"   # answer = ADD * TIMES
DRILL_DIVIDE = "CONCEPT_DRILL_DIVIDE"       # answer = FROM repeatedly less LESS, until doing so again would go < 0 (i.e. FROM mod LESS)
DRILL_RANGE_SUM = "CONCEPT_DRILL_RANGE_SUM"  # answer = sum of an arithmetic sequence from FROM to TO


@dataclass
class PML2ConceptDrillConfig:
    """One concept-drill question's generation config -- deliberately
    separate from PML2Config since this format shares none of the vertical
    3-row add/less machinery (no rows, no digit_pattern, no complement
    technique). lesson_number/dps_number/seed drive determinism the same way
    PML2Config's do.
    """
    module_code: str
    level_code: str
    lesson_number: int
    dps_number: int
    drill_format: str  # DRILL_MULTIPLY | DRILL_DIVIDE | DRILL_RANGE_SUM
    seed: str = "PM-L2-DRILL-SEED"
    # MULTIPLY: add_min/add_max bound the randomly generated ADD value; times is fixed (workbook uses 12 everywhere observed).
    add_min: int = 1
    add_max: int = 200
    times_value: int = 12
    # DIVIDE: from_min/from_max bound FROM; less_min/less_max bound LESS. Generator rejects any pair where FROM % LESS == 0 (guessable, per Shailesh 2026-08-05).
    from_min: int = 1
    from_max: int = 999
    less_min: int = 2
    less_max: int = 99
    # RANGE_SUM: explicit sequence spec -- step defaults to FROM's own value (matches the workbook's own SUMPRODUCT(ROW(INDIRECT("1:n"))*step) formula) unless a named sequence type overrides it.
    range_from: int = 1
    range_to: int = 20
    range_step: int | None = None  # None => step defaults to range_from
    sequence_label: str | None = None  # e.g. "ODD", "CONSECUTIVE" -- display only, doesn't change the math once range_step is resolved
