from __future__ import annotations

import random

from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule
from app.question_engine.ylm.validators import (
    DIRECT_ADD_ALLOWED,
    DIRECT_SUB_ALLOWED,
    MOVEMENT_COMP10_ADD,
    MOVEMENT_COMP10_SUB,
    MOVEMENT_COMP5_ADD,
    MOVEMENT_COMP5_SUB,
    MOVEMENT_DIRECT,
    validate_question,
)

TEMPLATE_DIRECT = "DIRECT"
TEMPLATE_COMP5_ADD = "COMP5_ADD"
TEMPLATE_COMP5_SUB = "COMP5_SUB"
TEMPLATE_COMP10_ADD = "COMP10_ADD"
TEMPLATE_COMP10_SUB = "COMP10_SUB"
TEMPLATE_REVISION = "REVISION"


def _targets(config: YLMConfig, fallback: list[int]) -> list[int]:
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


def _direct_bases(config: YLMConfig) -> list[int]:
    digit_pattern = (config.digit_pattern or "1D").upper()
    place_value = (config.place_value or "ONES").upper()
    if digit_pattern == "2D_TENS":
        return [10, 20, 30, 40, 50, 60, 70, 80, 90]
    if digit_pattern in {"2D", "1D_AND_2D"} or place_value in {"MIXED", "ONES_AND_TENS"}:
        return list(range(1, 10)) + [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return list(range(1, 10))


def _safe_supports(current: int, template: str) -> list[int]:
    # Phase A convention: after the target Golden-Step movement, the support row must
    # stay pedagogically aligned with the lesson family. Addition lessons get direct
    # additions, subtraction lessons get direct subtractions, direct/revision may mix.
    if template in {TEMPLATE_COMP5_ADD, TEMPLATE_COMP10_ADD}:
        supports = _direct_operands_for_focus(current, "ADDITION")
    elif template in {TEMPLATE_COMP5_SUB, TEMPLATE_COMP10_SUB}:
        supports = _direct_operands_for_focus(current, "SUBTRACTION")
    else:
        supports = _direct_operands_for_focus(current, "ADD_LESS")
    if supports:
        return supports
    return _direct_operands_for_focus(current, "ADDITION") or _direct_operands_for_focus(current, "SUBTRACTION")


def _comp5_add_bases(target: int, config: YLMConfig) -> list[int]:
    ones = 5 - target
    tens_values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
    return [tens + ones for tens in tens_values if 0 < tens + ones <= 99]


def _comp5_sub_bases(target: int, config: YLMConfig) -> list[int]:
    ones_values = list(range(5, 5 + target))
    tens_values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
    return [tens + ones for tens in tens_values for ones in ones_values if 0 < tens + ones <= 99]


def _comp10_add_bases(target: int, config: YLMConfig) -> list[int]:
    # +target using complement of 10 must start from the exact trigger unit.
    # Example: +4 => 6 + 4, 16 + 4, 26 + 4. Not 38 + 4.
    ones = 10 - target
    tens_values = [0, 10, 20, 30, 40, 50, 60]
    return [tens + ones for tens in tens_values if tens + ones > 0]


def _comp10_sub_bases(target: int, config: YLMConfig) -> list[int]:
    # -target using complement of 10 must start from the exact borrow trigger range.
    ones_values = list(range(0, target))
    tens_values = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return [tens + ones for tens in tens_values for ones in ones_values]


def _direct_stems(config: YLMConfig) -> list[tuple[int, int, str]]:
    stems: list[tuple[int, int, str]] = []
    for base in _direct_bases(config):
        for operand in _direct_operands_for_focus(base, config.operation_focus):
            stems.append((base, operand, TEMPLATE_DIRECT))
    return stems


def _template_stems(config: YLMConfig, template: str) -> list[tuple[int, int, str]]:
    template = (template or TEMPLATE_DIRECT).upper()
    stems: list[tuple[int, int, str]] = []
    if template == TEMPLATE_DIRECT:
        return _direct_stems(config)
    if template == TEMPLATE_COMP5_ADD:
        for target in _targets(config, [1, 2, 3, 4]):
            for base in _comp5_add_bases(target, config):
                stems.append((base, target, template))
    elif template == TEMPLATE_COMP5_SUB:
        for target in _targets(config, [1, 2, 3, 4]):
            for base in _comp5_sub_bases(target, config):
                stems.append((base, -target, template))
    elif template == TEMPLATE_COMP10_ADD:
        for target in _targets(config, [1, 2, 3, 4, 5, 6, 7, 8, 9]):
            for base in _comp10_add_bases(target, config):
                stems.append((base, target, template))
    elif template == TEMPLATE_COMP10_SUB:
        for target in _targets(config, [1, 2, 3, 4, 5, 6, 7, 8, 9]):
            for base in _comp10_sub_bases(target, config):
                stems.append((base, -target, template))
    return stems


def _lesson_templates(config: YLMConfig) -> tuple[str, ...]:
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template == TEMPLATE_REVISION:
        return tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
    return (template,)


def build_candidate_pool(config: YLMConfig) -> list[list[int]]:
    config = enrich_config_with_lesson_rule(config)
    pool: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()
    for template in _lesson_templates(config):
        for base, primary, source_template in _template_stems(config, template):
            current = base + primary
            if current < 0:
                continue
            for support in _safe_supports(current, source_template):
                operands = [base, primary, support]
                key = tuple(operands)
                if key in seen:
                    continue
                if validate_question(config, operands, set()):
                    pool.append(operands)
                    seen.add(key)
    return pool


def generate_unique_operands(config: YLMConfig, rng: random.Random, seen: set[tuple[int, ...]]) -> list[int]:
    config = enrich_config_with_lesson_rule(config)
    pool = build_candidate_pool(config)
    available = [operands for operands in pool if tuple(operands) not in seen]
    if not available:
        # Non-negotiable platform behavior: every YLM lesson must generate valid output.
        # Reuse the same valid lesson-template pool if the unique request exceeds the
        # available pattern count; never fall back to generic arithmetic.
        available = pool
    if not available:
        raise ValueError(f"YLM lesson {config.lesson_number} has no valid Golden Step generation pool")
    return list(rng.choice(available))


def generate_operands(config: YLMConfig, rng: random.Random) -> list[int]:
    return generate_unique_operands(config, rng, set())
