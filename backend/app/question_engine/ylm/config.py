from dataclasses import dataclass, field

@dataclass
class YLMConfig:
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
    seed: str = "YLM-SEED"
