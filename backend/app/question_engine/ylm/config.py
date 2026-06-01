from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class YLMLessonRule:
    lesson_number: int
    level_code: str
    lesson_title: str
    concept_family: str
    operation_focus: str
    abacus_rule: str | None
    target_numbers: list[int]
    place_value: str
    digit_pattern: str
    allowed_movement_types: tuple[str, ...]
    required_movement_types: tuple[str, ...] = ()
    rows: int = 3
    question_count: int = 10
    allow_negative_operands: bool = True
    allow_negative_answer: bool = False
    dps_titles: tuple[str, ...] = ()


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
    allowed_movement_types: tuple[str, ...] = field(default_factory=tuple)
    required_movement_types: tuple[str, ...] = field(default_factory=tuple)
    lesson_title: str | None = None


def _same_titles(title: str) -> tuple[str, str, str, str, str]:
    return (title, title, title, title, title)


YLM_LESSON_RULES: dict[int, YLMLessonRule] = {
    1: YLMLessonRule(1, "YLM-L1", "Bead Recognition & Single Digit Addition-Subtraction", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "ONES", "1D", ("DIRECT",), dps_titles=_same_titles("Bead Recognition & Single Digit Addition-Subtraction")),
    2: YLMLessonRule(2, "YLM-L1", "Bead Recognition Numbers 5 & Direct Add-Less Using 5", "DIRECT_ADD_LESS", "ADD_LESS", None, [5, 6, 7, 8, 9, 50, 60, 70, 80, 90], "MIXED", "1D_AND_2D", ("DIRECT",), dps_titles=(
        "Bead Recognition Numbers 5 & Direct Add-Less Using 5",
        "Numbers 6, 7, 8, 9 Direct Add-Less",
        "50, 60, 70, 80, 90 Direct Add-Less",
        "Single & Double Digit Direct Add-Less",
        "Number 50 Double Digit Direct Add-Less",
    )),
    3: YLMLessonRule(3, "YLM-L1", "Addition of 1 using Complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_4", [1], "ONES", "1D", ("DIRECT", "COMP5_ADD"), ("COMP5_ADD",), dps_titles=_same_titles("Addition of 1 using Complement of 5 (Add 5, Less 4)")),
    4: YLMLessonRule(4, "YLM-L1", "Addition of 2 using Complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2], "ONES", "1D", ("DIRECT", "COMP5_ADD"), ("COMP5_ADD",), dps_titles=_same_titles("Addition of 2 using Complement of 5 (Add 5, Less 3)")),
    5: YLMLessonRule(5, "YLM-L1", "Addition of 3 using Complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3], "ONES", "1D", ("DIRECT", "COMP5_ADD"), ("COMP5_ADD",), dps_titles=_same_titles("Addition of 3 using Complement of 5 (Add 5, Less 2)")),
    6: YLMLessonRule(6, "YLM-L1", "Addition of 4 using Complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4], "ONES", "1D", ("DIRECT", "COMP5_ADD"), ("COMP5_ADD",), dps_titles=_same_titles("Addition of 4 using Complement of 5 (Add 5, Less 1)")),
    7: YLMLessonRule(7, "YLM-L1", "Revision of Direct Add-Less and Addition with Complement of 5", "MIXED_REVISION", "ADD_LESS", None, [1, 2, 3, 4], "ONES", "1D", ("DIRECT", "COMP5_ADD"), dps_titles=_same_titles("Revision of Direct Add-Less and Addition with Complement of 5")),
    8: YLMLessonRule(8, "YLM-L1", "Subtraction of 1 using Complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1], "ONES", "1D", ("DIRECT", "COMP5_SUB"), ("COMP5_SUB",), dps_titles=_same_titles("Subtraction of 1 using Complement of 5 (Less 5, Add 4)")),
    9: YLMLessonRule(9, "YLM-L1", "Subtraction of 2 using Complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_3", [2], "ONES", "1D", ("DIRECT", "COMP5_SUB"), ("COMP5_SUB",), dps_titles=_same_titles("Subtraction of 2 using Complement of 5 (Less 5, Add 3)")),
    10: YLMLessonRule(10, "YLM-L1", "Subtraction of 3 using Complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_2", [3], "ONES", "1D", ("DIRECT", "COMP5_SUB"), ("COMP5_SUB",), dps_titles=_same_titles("Subtraction of 3 using Complement of 5 (Less 5, Add 2)")),
    11: YLMLessonRule(11, "YLM-L1", "Subtraction of 4 using Complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_1", [4], "ONES", "1D", ("DIRECT", "COMP5_SUB"), ("COMP5_SUB",), dps_titles=_same_titles("Subtraction of 4 using Complement of 5 (Less 5, Add 1)")),
    12: YLMLessonRule(12, "YLM-L1", "Revision Exercise of Addition using Complement of 5", "MIXED_REVISION", "ADDITION", None, [1, 2, 3, 4], "ONES", "1D", ("DIRECT", "COMP5_ADD"), dps_titles=_same_titles("Revision Exercise of Addition using Complement of 5")),
    13: YLMLessonRule(13, "YLM-L1", "Revision Exercise of Subtraction using Complement of 5", "MIXED_REVISION", "SUBTRACTION", None, [1, 2, 3, 4], "ONES", "1D", ("DIRECT", "COMP5_SUB"), dps_titles=_same_titles("Revision Exercise of Subtraction using Complement of 5")),
    14: YLMLessonRule(14, "YLM-L1", "Addition of 1 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_9", [1], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 1 using Complement of 10 (Add 10, Less 9)")),
    15: YLMLessonRule(15, "YLM-L1", "Addition of 2 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_8", [2], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 2 using Complement of 10 (Add 10, Less 8)")),
    16: YLMLessonRule(16, "YLM-L1", "Addition of 3 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_7", [3], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 3 using Complement of 10 (Add 10, Less 7)")),
    17: YLMLessonRule(17, "YLM-L2", "Addition of 4 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_6", [4], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 4 using Complement of 10 (Add 10, Less 6)")),
    18: YLMLessonRule(18, "YLM-L2", "Addition of 5 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_5", [5], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 5 using Complement of 10 (Add 10, Less 5)")),
    19: YLMLessonRule(19, "YLM-L2", "Addition of 6 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_4", [6], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 6 using Complement of 10 (Add 10, Less 4)")),
    20: YLMLessonRule(20, "YLM-L2", "Addition of 7 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_3", [7], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 7 using Complement of 10 (Add 10, Less 3)")),
    21: YLMLessonRule(21, "YLM-L2", "Addition of 8 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_2", [8], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 8 using Complement of 10 (Add 10, Less 2)")),
    22: YLMLessonRule(22, "YLM-L2", "Addition of 9 using Complement of 10", "COMPLEMENT_OF_10", "ADDITION", "ADD_10_LESS_1", [9], "ONES", "1D", ("DIRECT", "COMP10_ADD"), ("COMP10_ADD",), dps_titles=_same_titles("Addition of 9 using Complement of 10 (Add 10, Less 1)")),
    23: YLMLessonRule(23, "YLM-L2", "Subtraction of 1 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_9", [1], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 1 using Complement of 10 (Less 10, Add 9)")),
    24: YLMLessonRule(24, "YLM-L2", "Subtraction of 2 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_8", [2], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 2 using Complement of 10 (Less 10, Add 8)")),
    25: YLMLessonRule(25, "YLM-L3", "Subtraction of 3 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_7", [3], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 3 using Complement of 10 (Less 10, Add 7)")),
    26: YLMLessonRule(26, "YLM-L3", "Subtraction of 4 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_6", [4], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 4 using Complement of 10 (Less 10, Add 6)")),
    27: YLMLessonRule(27, "YLM-L3", "Subtraction of 5 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_5", [5], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 5 using Complement of 10 (Less 10, Add 5)")),
    28: YLMLessonRule(28, "YLM-L3", "Subtraction of 6 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_4", [6], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 6 using Complement of 10 (Less 10, Add 4)")),
    29: YLMLessonRule(29, "YLM-L3", "Subtraction of 7 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_3", [7], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 7 using Complement of 10 (Less 10, Add 3)")),
    30: YLMLessonRule(30, "YLM-L3", "Subtraction of 8 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_2", [8], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 8 using Complement of 10 (Less 10, Add 2)")),
    31: YLMLessonRule(31, "YLM-L3", "Subtraction of 9 using Complement of 10", "COMPLEMENT_OF_10", "SUBTRACTION", "LESS_10_ADD_1", [9], "ONES", "1D", ("DIRECT", "COMP10_SUB"), ("COMP10_SUB",), dps_titles=_same_titles("Subtraction of 9 using Complement of 10 (Less 10, Add 1)")),
    32: YLMLessonRule(32, "YLM-L3", "Revision", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D", ("DIRECT", "COMP5_ADD", "COMP5_SUB", "COMP10_ADD", "COMP10_SUB"), dps_titles=_same_titles("Revision")),
}


YLM_LEVEL_LESSON_RANGES: dict[str, range] = {
    "YLM-L1": range(1, 17),
    "YLM-L2": range(17, 25),
    "YLM-L3": range(25, 33),
}


def lesson_rule_for(lesson_number: int) -> YLMLessonRule | None:
    return YLM_LESSON_RULES.get(int(lesson_number))


def enrich_config_with_lesson_rule(config: YLMConfig) -> YLMConfig:
    """Apply the canonical YLM lesson rule as a safety net.

    The DB section remains the editable curriculum source, but the YLM module must never
    fall back to generic arithmetic if a section is missing or stale. This function keeps
    the generator aligned to the full 32-lesson Golden Step map.
    """
    if str(config.module_code or "").upper() != "YLM":
        return config
    rule = lesson_rule_for(config.lesson_number)
    if not rule:
        return config
    config.level_code = rule.level_code
    config.lesson_title = rule.lesson_title
    config.rows = rule.rows
    config.question_count = config.question_count or rule.question_count
    config.concept_family = rule.concept_family
    config.operation_focus = rule.operation_focus
    config.abacus_rule = rule.abacus_rule
    config.target_numbers = list(rule.target_numbers)
    config.place_value = rule.place_value
    config.digit_pattern = rule.digit_pattern
    config.allow_negative_operands = rule.allow_negative_operands
    config.allow_negative_answer = rule.allow_negative_answer
    config.allowed_movement_types = rule.allowed_movement_types
    config.required_movement_types = rule.required_movement_types
    return config


def rule_metadata(rule: YLMLessonRule) -> dict[str, Any]:
    return {
        "lesson_number": rule.lesson_number,
        "level_code": rule.level_code,
        "lesson_title": rule.lesson_title,
        "concept_family": rule.concept_family,
        "operation_focus": rule.operation_focus,
        "abacus_rule": rule.abacus_rule,
        "target_numbers": list(rule.target_numbers),
        "place_value": rule.place_value,
        "digit_pattern": rule.digit_pattern,
        "allowed_movement_types": list(rule.allowed_movement_types),
        "required_movement_types": list(rule.required_movement_types),
        "rows": rule.rows,
        "question_count": rule.question_count,
    }
