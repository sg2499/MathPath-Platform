from __future__ import annotations

import random
from functools import lru_cache

from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule
from app.question_engine.ylm.validators import (
    MOVEMENT_COMP10_ADD,
    MOVEMENT_COMP10_SUB,
    MOVEMENT_COMP5_ADD,
    MOVEMENT_COMP5_SUB,
    MOVEMENT_DIRECT,
    DIRECT_ADD_ALLOWED,
    DIRECT_SUB_ALLOWED,
    validate_question,
)


def _target(config: YLMConfig, rng: random.Random) -> int:
    targets = [abs(int(value)) for value in (config.target_numbers or []) if int(value) != 0]
    if targets:
        return rng.choice(targets)
    return rng.randint(1, 4)


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


def _candidate_supports(current: int, config: YLMConfig, support_focus: str = "ADD_LESS") -> list[int]:
    supports = _direct_operands_for_focus(current, support_focus)
    if supports:
        return supports
    # Deterministic safe no-op fallback is avoided in final validation because zero movement
    # is not a useful worksheet row. Generate a small direct add if possible.
    return _direct_operands_for_focus(current, "ADDITION") or _direct_operands_for_focus(current, "SUBTRACTION")


def _append_valid(candidate_pool: list[list[int]], config: YLMConfig, operands: list[int]) -> None:
    if validate_question(config, operands, set()):
        candidate_pool.append(operands)


def _comp5_add_bases(target: int, config: YLMConfig) -> list[int]:
    # For +target using complement of 5, the clean first-introduction stem is
    # (5 - target) + target. Tens variants are included only as same-concept extensions.
    ones = 5 - target
    tens_values = [0, 10, 20, 30, 40] if (config.digit_pattern or "1D").upper() != "1D" else [0, 10, 20, 30]
    return [tens + ones for tens in tens_values if tens + ones > 0]


def _comp5_sub_bases(target: int, config: YLMConfig) -> list[int]:
    ones_values = list(range(5, 5 + target))
    tens_values = [0, 10, 20, 30, 40] if (config.digit_pattern or "1D").upper() != "1D" else [0, 10, 20, 30]
    return [tens + ones for tens in tens_values for ones in ones_values]


def _comp10_add_bases(target: int, config: YLMConfig) -> list[int]:
    # For +target using complement of 10, the stem must isolate the exact unit trigger.
    # Example: +4 -> 6 + 4, 16 + 4, 26 + 4; not 38 + 4 or 59 + 4.
    ones = 10 - target
    tens_values = [0, 10, 20, 30, 40, 50, 60]
    return [tens + ones for tens in tens_values if tens + ones > 0]


def _comp10_sub_bases(target: int, config: YLMConfig) -> list[int]:
    ones_values = list(range(0, target))
    tens_values = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return [tens + ones for tens in tens_values for ones in ones_values]


def _primary_stems(config: YLMConfig) -> list[tuple[int, int]]:
    config = enrich_config_with_lesson_rule(config)
    required = set(config.required_movement_types or ())
    allowed = set(config.allowed_movement_types or ())
    operation_focus = (config.operation_focus or "ADD_LESS").upper()
    targets = [abs(int(value)) for value in (config.target_numbers or []) if int(value) != 0]

    stems: list[tuple[int, int]] = []
    if MOVEMENT_COMP5_ADD in required or (not required and MOVEMENT_COMP5_ADD in allowed and operation_focus in {"ADDITION", "ADD_LESS"}):
        for target in (targets or [1, 2, 3, 4]):
            for base in _comp5_add_bases(target, config):
                stems.append((base, target))
    if MOVEMENT_COMP5_SUB in required or (not required and MOVEMENT_COMP5_SUB in allowed and operation_focus in {"SUBTRACTION", "ADD_LESS"}):
        for target in (targets or [1, 2, 3, 4]):
            for base in _comp5_sub_bases(target, config):
                stems.append((base, -target))
    if MOVEMENT_COMP10_ADD in required or (not required and MOVEMENT_COMP10_ADD in allowed and operation_focus in {"ADDITION", "ADD_LESS"}):
        for target in (targets or [1, 2, 3, 4, 5, 6, 7, 8, 9]):
            for base in _comp10_add_bases(target, config):
                stems.append((base, target))
    if MOVEMENT_COMP10_SUB in required or (not required and MOVEMENT_COMP10_SUB in allowed and operation_focus in {"SUBTRACTION", "ADD_LESS"}):
        for target in (targets or [1, 2, 3, 4, 5, 6, 7, 8, 9]):
            for base in _comp10_sub_bases(target, config):
                stems.append((base, -target))

    if not stems or (not required and MOVEMENT_DIRECT in allowed):
        for base in _direct_bases(config):
            for operand in _direct_operands_for_focus(base, operation_focus):
                stems.append((base, operand))
    return stems


def build_candidate_pool(config: YLMConfig) -> list[list[int]]:
    config = enrich_config_with_lesson_rule(config)
    pool: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()
    for base, primary in _primary_stems(config):
        current = base + primary
        if current < 0:
            continue
        supports = _candidate_supports(current, config, "ADD_LESS")
        for support in supports:
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
        # The curriculum should always have enough valid combinations. If a preview ever
        # requests more unique questions than the configured lesson pool can support,
        # rotate a valid same-concept question with a deterministic tens extension.
        available = pool
    if not available:
        raise ValueError(f"YLM lesson {config.lesson_number} has no valid Golden Step generation pool")
    return list(rng.choice(available))


def generate_operands(config: YLMConfig, rng: random.Random) -> list[int]:
    return generate_unique_operands(config, rng, set())
