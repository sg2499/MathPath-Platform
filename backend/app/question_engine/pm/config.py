from dataclasses import dataclass, field


@dataclass
class PMConfig:
    """Preparatory Module generation config.

    Deliberately self-contained -- PM owns its own generator package (this
    directory) instead of falling back to another module's engine, so a
    future change to any other module's generator can never silently change
    PM's output, and vice versa. See PM_L1_LESSONS in
    app/seed/preparatory_module_l1_config.py for how these fields are
    populated per DPS from the Bridge Module replica curriculum.
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
    seed: str = "PM-SEED"
    lesson_title: str | None = None
    dps_title: str | None = None
    generation_template: str = "DIRECT"
    revision_templates: tuple[str, ...] = field(default_factory=tuple)
