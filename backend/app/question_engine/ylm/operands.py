from __future__ import annotations

import random

from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule
from app.question_engine.ylm.validators import validate_question


def _target(config: YLMConfig, rng: random.Random) -> int:
    targets = [abs(int(value)) for value in (config.target_numbers or []) if int(value) != 0]
    if targets:
        return rng.choice(targets)
    if "COMP10" in set(config.required_movement_types or ()):  # defensive fallback
        return rng.randint(1, 9)
    return rng.randint(1, 4)


def _direct_add_options(current: int) -> list[int]:
    digit = current % 10
    if digit in (0, 5):
        return [1, 2, 3, 4]
    if digit in (1, 6):
        return [1, 2, 3]
    if digit in (2, 7):
        return [1, 2]
    if digit in (3, 8):
        return [1]
    return []


def _direct_sub_options(current: int) -> list[int]:
    digit = current % 10
    if current <= 0:
        return []
    if 1 <= digit <= 4:
        return list(range(1, digit + 1))
    if digit == 5:
        return [5]
    if 6 <= digit <= 9:
        return [value for value in range(1, 6) if current - value >= 0]
    # Borrowing is not direct for a zero ones digit.
    return []


def _support_direct_operand(current: int, rng: random.Random, operation_focus: str) -> int:
    candidates: list[int] = []
    if operation_focus in {"ADD_LESS", "ADDITION"}:
        candidates.extend(_direct_add_options(current))
    if operation_focus in {"ADD_LESS", "SUBTRACTION"}:
        candidates.extend([-value for value in _direct_sub_options(current)])
    if not candidates:
        candidates.extend(_direct_add_options(current))
    if not candidates:
        candidates.extend([-value for value in _direct_sub_options(current)])
    return rng.choice(candidates) if candidates else 0


def _base_for_direct(config: YLMConfig, rng: random.Random) -> int:
    if config.digit_pattern == "2D_TENS":
        return rng.choice([10, 20, 30, 40, 50, 60, 70, 80])
    if config.digit_pattern in {"2D", "1D_AND_2D"} or config.place_value in {"MIXED", "ONES_AND_TENS"}:
        return rng.choice([rng.randint(1, 8), rng.randint(10, 80)])
    return rng.randint(1, 8)


def _base_for_comp5_add(target: int, rng: random.Random) -> int:
    ones = rng.choice(list(range(max(0, 5 - target), 5)))
    tens = rng.choice([0, 10, 20, 30]) if rng.random() < 0.35 else 0
    return tens + ones


def _base_for_comp5_sub(target: int, rng: random.Random) -> int:
    ones = rng.choice(list(range(5, 5 + target)))
    tens = rng.choice([0, 10, 20, 30]) if rng.random() < 0.35 else 0
    return tens + ones


def _base_for_comp10_add(target: int, rng: random.Random) -> int:
    ones = rng.choice(list(range(10 - target, 10)))
    tens = rng.choice([0, 10, 20, 30, 40, 50])
    return tens + ones


def _base_for_comp10_sub(target: int, rng: random.Random) -> int:
    ones = rng.choice(list(range(0, target)))
    tens = rng.choice([10, 20, 30, 40, 50, 60, 70, 80])
    return tens + ones


def _primary_operand(config: YLMConfig, rng: random.Random) -> tuple[int, int]:
    required = set(config.required_movement_types or ())
    allowed = set(config.allowed_movement_types or ())
    operation_focus = (config.operation_focus or "ADD_LESS").upper()
    target = _target(config, rng)

    if "COMP5_ADD" in required or (not required and "COMP5_ADD" in allowed and operation_focus == "ADDITION"):
        return _base_for_comp5_add(target, rng), target
    if "COMP5_SUB" in required or (not required and "COMP5_SUB" in allowed and operation_focus == "SUBTRACTION"):
        return _base_for_comp5_sub(target, rng), -target
    if "COMP10_ADD" in required or (not required and "COMP10_ADD" in allowed and operation_focus == "ADDITION"):
        return _base_for_comp10_add(target, rng), target
    if "COMP10_SUB" in required or (not required and "COMP10_SUB" in allowed and operation_focus == "SUBTRACTION"):
        return _base_for_comp10_sub(target, rng), -target

    base = _base_for_direct(config, rng)
    primary = _support_direct_operand(base, rng, operation_focus)
    return base, primary


def generate_operands(config: YLMConfig, rng: random.Random) -> list[int]:
    config = enrich_config_with_lesson_rule(config)
    for _ in range(120):
        base, primary = _primary_operand(config, rng)
        current = base + primary
        support = _support_direct_operand(current, rng, "ADD_LESS")
        operands = [base, primary, support]
        if validate_question(config, operands, set()):
            return operands

    # Final deterministic fallback for edge cases. The outer generator still validates
    # and retries, so this should not leak invalid questions.
    target = _target(config, rng)
    if config.operation_focus == "SUBTRACTION":
        return [10 + target - 1, -target, 1]
    return [max(1, 10 - target), target, 1]
