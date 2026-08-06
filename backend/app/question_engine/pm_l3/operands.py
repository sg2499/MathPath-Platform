from __future__ import annotations

import dataclasses
import random

from app.question_engine.pm_l3.config import PML3Config
from app.question_engine.pm_l3.validators import (
    DIRECT_ADD_ALLOWED,
    DIRECT_SUB_ALLOWED,
    validate_question,
)

TEMPLATE_DIRECT = "DIRECT"
TEMPLATE_COMP5_ADD = "COMP5_ADD"
TEMPLATE_COMP5_SUB = "COMP5_SUB"
TEMPLATE_COMP10_ADD = "COMP10_ADD"
TEMPLATE_COMP10_SUB = "COMP10_SUB"
TEMPLATE_REVISION = "REVISION"

# PM-L3's workbook uses genuine multi-digit direct addition/subtraction
# throughout (Lessons 1-4, 6-12), up to 3-digit -- see _wide_row0_choices.
WIDE_DIRECT_PATTERNS = {"2D_FULL", "3D_HUNDREDS", "3D_FULL"}

DIFFICULTY_STAGES: tuple[str, ...] = (
    "EASY", "EASY", "EASY_MEDIUM", "EASY_MEDIUM", "MEDIUM",
    "MEDIUM", "MEDIUM_HARD", "MEDIUM_HARD", "CHALLENGE", "CHALLENGE",
)


def question_difficulty_stage(question_index: int) -> str:
    if question_index < 0:
        return "EASY"
    if question_index < len(DIFFICULTY_STAGES):
        return DIFFICULTY_STAGES[question_index]
    return "CHALLENGE"


def _digit_width(value: int) -> int:
    return len(str(abs(int(value)))) if value != 0 else 1


def _targets(config: PML3Config, fallback: list[int]) -> list[int]:
    values = [abs(int(value)) for value in (config.target_numbers or []) if int(value) != 0]
    return values or fallback


def _direct_add_options(current: int) -> list[int]:
    return sorted(DIRECT_ADD_ALLOWED.get(current % 10, set()))


def _direct_sub_options(current: int) -> list[int]:
    return sorted(value for value in DIRECT_SUB_ALLOWED.get(current % 10, set()) if current - value >= 0)


def _direct_operands_for_focus(current: int, operation_focus: str) -> list[int]:
    operation_focus = (operation_focus or "ADD_LESS").upper()
    candidates: list[int] = []
    if operation_focus in {"ADD_LESS", "ADDITION"}:
        candidates.extend(_direct_add_options(current))
    if operation_focus in {"ADD_LESS", "SUBTRACTION"}:
        candidates.extend([-value for value in _direct_sub_options(current)])
    return [value for value in candidates if value != 0]


def _row_sign(operation_focus: str | None, rng: random.Random) -> int:
    focus = (operation_focus or "ADD_LESS").upper()
    if focus == "ADDITION":
        return 1
    if focus == "SUBTRACTION":
        return -1
    return rng.choice((1, -1))


def _direct_bases_for_pattern(digit_pattern: str | None) -> list[int]:
    pattern = (digit_pattern or "1D").upper()
    if pattern in {"2D", "1D_AND_2D"}:
        return list(range(1, 10)) + [10, 20, 30, 40, 50, 60, 70, 80, 90]
    if pattern == "2D_TENS":
        return [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return list(range(1, 10))


def _is_wide_direct_pattern(digit_pattern: str | None) -> bool:
    return (digit_pattern or "").upper() in WIDE_DIRECT_PATTERNS


def _wide_target_width(digit_pattern: str | None) -> int:
    return 3 if (digit_pattern or "").upper() in {"3D_HUNDREDS", "3D_FULL"} else 2


def _wide_row0_choices(width: int, digit_pattern: str | None) -> list[int]:
    if width == 3 and (digit_pattern or "").upper() == "3D_HUNDREDS":
        return [100, 200, 300, 400, 500, 600, 700, 800, 900]
    if width == 1:
        return list(range(1, 10))
    if width == 2:
        return list(range(10, 100))
    return list(range(100, 1000))


def _direct_delta_options_for_digit(digit: int, sign: int) -> list[int]:
    allowed = DIRECT_ADD_ALLOWED.get(digit, set()) if sign > 0 else DIRECT_SUB_ALLOWED.get(digit, set())
    return [0] + sorted(allowed)


def _build_direct_operand(current_value: int, width: int, sign: int, rng: random.Random) -> int | None:
    from app.question_engine.pm_l3.validators import _digits as pm_l3_place_digits
    base_digits = pm_l3_place_digits(current_value, width)
    top_options = [option for option in _direct_delta_options_for_digit(base_digits[width - 1], sign) if option != 0]
    if not top_options:
        return None
    for _attempt in range(8):
        delta_digits = [
            rng.choice(top_options) if place == width - 1
            else rng.choice(_direct_delta_options_for_digit(base_digits[place], sign))
            for place in range(width)
        ]
        value = sum(digit * (10 ** place) for place, digit in enumerate(delta_digits))
        if _digit_width(value) == width:
            return value
    return None


def _safe_supports(current: int, template: str) -> list[int]:
    if template in {TEMPLATE_COMP5_ADD, TEMPLATE_COMP10_ADD}:
        supports = _direct_operands_for_focus(current, "ADDITION")
    elif template in {TEMPLATE_COMP5_SUB, TEMPLATE_COMP10_SUB}:
        supports = _direct_operands_for_focus(current, "SUBTRACTION")
    else:
        supports = _direct_operands_for_focus(current, "ADD_LESS")
    if supports:
        return supports
    return _direct_operands_for_focus(current, "ADDITION") or _direct_operands_for_focus(current, "SUBTRACTION")


def _comp_tens_values(all_tens_values: list[int], digit_pattern: str | None) -> list[int]:
    pattern = (digit_pattern or "").upper()
    if not all_tens_values:
        return []
    narrowest = min(all_tens_values)
    if pattern == "1D":
        return [narrowest]
    if pattern == "2D":
        wide = [tens for tens in all_tens_values if tens != narrowest]
        return wide or all_tens_values
    return all_tens_values


def _comp5_add_bases(target: int, digit_pattern: str | None = None) -> list[int]:
    ones = 5 - target
    tens_values = _comp_tens_values([0, 10, 20, 30, 40, 50, 60, 70, 80, 90], digit_pattern)
    return [tens + ones for tens in tens_values if 0 < tens + ones <= 99]


def _comp5_sub_bases(target: int, digit_pattern: str | None = None) -> list[int]:
    ones_values = list(range(5, 5 + target))
    tens_values = _comp_tens_values([0, 10, 20, 30, 40, 50, 60, 70, 80, 90], digit_pattern)
    return [tens + ones for tens in tens_values for ones in ones_values if 0 < tens + ones <= 99]


def _comp10_add_bases(target: int, digit_pattern: str | None = None) -> list[int]:
    ones = 10 - target
    tens_values = _comp_tens_values([0, 10, 20, 30, 40, 50, 60], digit_pattern)
    return [tens + ones for tens in tens_values if tens + ones > 0]


def _comp10_sub_bases(target: int, digit_pattern: str | None = None) -> list[int]:
    ones_values = list(range(0, target))
    tens_values = _comp_tens_values([10, 20, 30, 40, 50, 60, 70, 80, 90], digit_pattern)
    return [tens + ones for tens in tens_values for ones in ones_values]


COMPLEMENT_BASE_BUILDERS = {
    TEMPLATE_COMP5_ADD: (_comp5_add_bases, [1, 2, 3, 4], 1),
    TEMPLATE_COMP5_SUB: (_comp5_sub_bases, [1, 2, 3, 4], -1),
    TEMPLATE_COMP10_ADD: (_comp10_add_bases, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1),
    TEMPLATE_COMP10_SUB: (_comp10_sub_bases, [1, 2, 3, 4, 5, 6, 7, 8, 9], -1),
}


def _effective_rows(config: PML3Config, question_index: int) -> int:
    if config.rows_second_half and question_index >= config.question_count // 2:
        return config.rows_second_half
    return config.rows


def _effective_digit_pattern(config: PML3Config, question_index: int) -> str:
    if config.digit_pattern_second_half and question_index >= config.question_count // 2:
        return config.digit_pattern_second_half
    return config.digit_pattern


def _build_chain(
    config: PML3Config,
    effective_rows: int,
    effective_digit_pattern: str,
    rng: random.Random,
) -> list[int] | None:
    """Build ONE candidate N-row operand chain for the given template.

    Generalizes PM-L1/PM-L2's fixed-3-row stem builders (row0 + exactly 2
    movements) into an arbitrary-length chain: row0 establishes the base,
    the technique (DIRECT/COMPLEMENT_OF_5/COMPLEMENT_OF_10) is applied on
    row 2 for complement templates, and every remaining row chains further
    safe (pure-direct) movements off the running total -- confirmed correct
    at every step by the same movement_profile/validate_question machinery
    PM-L1/PM-L2 already use, just applied N-1 times instead of a hardcoded 2.
    """
    template = (config.generation_template or TEMPLATE_DIRECT).upper()

    if template == TEMPLATE_REVISION:
        choices = tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
        chosen = rng.choice(choices)
        sub_config = dataclasses.replace(config, generation_template=chosen)
        return _build_chain(sub_config, effective_rows, effective_digit_pattern, rng)

    is_wide = _is_wide_direct_pattern(effective_digit_pattern)

    if template == TEMPLATE_DIRECT:
        target_width = _wide_target_width(effective_digit_pattern) if is_wide else 1
        if is_wide:
            row0 = rng.choice(_wide_row0_choices(target_width, effective_digit_pattern))
        else:
            row0 = rng.choice(_direct_bases_for_pattern(effective_digit_pattern))
        operands = [row0]
        current = row0
        for _ in range(effective_rows - 1):
            sign = _row_sign(config.operation_focus, rng)
            if is_wide:
                delta = _build_direct_operand(current, target_width, sign, rng)
                if delta is None:
                    return None
                value = sign * delta
            else:
                options = _direct_operands_for_focus(current, config.operation_focus)
                if not options:
                    return None
                value = rng.choice(options)
            if current + value < 0:
                return None
            if is_wide and _digit_width(current + value) > target_width:
                return None
            operands.append(value)
            current += value
        return operands

    if template in COMPLEMENT_BASE_BUILDERS:
        base_builder, default_targets, sign = COMPLEMENT_BASE_BUILDERS[template]
        target = rng.choice(_targets(config, default_targets))
        signed_target = sign * target
        bases = base_builder(target, effective_digit_pattern)
        if not bases:
            return None
        trigger_value = rng.choice(bases)
        current = trigger_value + signed_target
        if current < 0:
            return None
        operands = [trigger_value, signed_target]
        for _ in range(max(0, effective_rows - 2)):
            supports = _safe_supports(current, template)
            if not supports:
                return None
            delta = rng.choice(supports)
            if current + delta < 0:
                return None
            operands.append(delta)
            current += delta
        return operands

    return None


def generate_unique_operands(config: PML3Config, rng: random.Random, seen: set[tuple[int, ...]]) -> list[int]:
    question_index = len(seen)
    effective_rows = _effective_rows(config, question_index)
    effective_digit_pattern = _effective_digit_pattern(config, question_index)
    check_config = dataclasses.replace(config, rows=effective_rows, digit_pattern=effective_digit_pattern)

    for _attempt in range(500):
        candidate = _build_chain(config, effective_rows, effective_digit_pattern, rng)
        if candidate is None:
            continue
        if tuple(candidate) in seen:
            continue
        if not validate_question(check_config, candidate):
            continue
        return candidate

    raise ValueError(
        f"PM-L3 lesson {config.lesson_number} DPS {config.dps_number}: could not generate a valid "
        f"{effective_rows}-row Add/Less chain (template={config.generation_template}, "
        f"digit_pattern={effective_digit_pattern})"
    )
