from __future__ import annotations

from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule

# MathPath YLM direct movement rules model physical bead movement, not only arithmetic.
# Direct subtraction cannot cross the 5-bead boundary. For example, 8 - 4 is NOT
# direct because it needs Less 5 Add 1; however 8 - 3 is direct and 8 - 5 is direct.
DIRECT_ADD_ALLOWED = {
    0: {1, 2, 3, 4},
    1: {1, 2, 3},
    2: {1, 2},
    3: {1},
    4: set(),
    5: {1, 2, 3, 4},
    6: {1, 2, 3},
    7: {1, 2},
    8: {1},
    9: set(),
}

DIRECT_SUB_ALLOWED = {
    0: set(),
    1: {1},
    2: {1, 2},
    3: {1, 2, 3},
    4: {1, 2, 3, 4},
    5: {5},
    6: {1, 5},
    7: {1, 2, 5},
    8: {1, 2, 3, 5},
    9: {1, 2, 3, 4, 5},
}

MOVEMENT_DIRECT = "DIRECT"
MOVEMENT_COMP5_ADD = "COMP5_ADD"
MOVEMENT_COMP5_SUB = "COMP5_SUB"
MOVEMENT_COMP10_ADD = "COMP10_ADD"
MOVEMENT_COMP10_SUB = "COMP10_SUB"
MOVEMENT_ZERO = "ZERO"
MOVEMENT_INVALID = "INVALID"


def _digits(value: int, places: int) -> list[int]:
    return [(abs(value) // (10 ** place)) % 10 for place in range(places)]


def _place_count(*values: int) -> int:
    largest = max([abs(v) for v in values] + [9])
    return max(1, len(str(largest)) + 1)


def classify_single_digit_movement(current_digit: int, delta_digit: int, carry_in: int = 0) -> str:
    movement = delta_digit + carry_in
    if movement == 0:
        return MOVEMENT_ZERO

    if 0 <= current_digit + movement <= 9:
        amount = abs(movement)
        if movement > 0:
            if amount in DIRECT_ADD_ALLOWED.get(current_digit, set()):
                return MOVEMENT_DIRECT
            if 1 <= amount <= 4 and current_digit in range(5 - amount, 5):
                return MOVEMENT_COMP5_ADD
            return MOVEMENT_INVALID
        if movement < 0:
            if amount in DIRECT_SUB_ALLOWED.get(current_digit, set()):
                return MOVEMENT_DIRECT
            if 1 <= amount <= 4 and current_digit in range(5, 5 + amount):
                return MOVEMENT_COMP5_SUB
            return MOVEMENT_INVALID

    if movement > 0 and current_digit + movement >= 10:
        amount = movement
        if 1 <= amount <= 9 and current_digit >= 10 - amount:
            return MOVEMENT_COMP10_ADD
        return MOVEMENT_INVALID

    if movement < 0 and current_digit + movement < 0:
        amount = abs(movement)
        if 1 <= amount <= 9 and current_digit < amount:
            return MOVEMENT_COMP10_SUB
        return MOVEMENT_INVALID

    return MOVEMENT_INVALID


def classify_step(current_value: int, operand: int) -> tuple[bool, set[str]]:
    if operand == 0:
        return True, {MOVEMENT_ZERO}
    if current_value + operand < 0:
        return False, {MOVEMENT_INVALID}

    amount = abs(operand)

    if amount < 10:
        current_digit = current_value % 10
        if operand > 0:
            if current_digit + amount >= 10:
                return True, {MOVEMENT_COMP10_ADD}
            movement_type = classify_single_digit_movement(current_digit, amount)
        else:
            if current_digit < amount:
                return True, {MOVEMENT_COMP10_SUB}
            movement_type = classify_single_digit_movement(current_digit, -amount)
        if movement_type == MOVEMENT_INVALID:
            return False, {MOVEMENT_INVALID}
        return True, {movement_type}

    movement_types: set[str] = set()
    places = _place_count(current_value, current_value + operand, operand)
    before_digits = _digits(current_value, places)
    operand_digits = _digits(operand, places)
    for place in range(places):
        operand_digit = operand_digits[place]
        if operand_digit == 0:
            continue
        before_digit = before_digits[place]
        signed_digit = operand_digit if operand > 0 else -operand_digit
        movement_type = classify_single_digit_movement(before_digit, signed_digit)
        if movement_type == MOVEMENT_INVALID:
            return False, {MOVEMENT_INVALID}
        movement_types.add(movement_type)

    return True, movement_types or {MOVEMENT_ZERO}


def movement_profile(operands: list[int]) -> tuple[bool, list[set[str]]]:
    if not operands:
        return False, []
    current = operands[0]
    if current < 0:
        return False, []
    profile: list[set[str]] = []
    for operand in operands[1:]:
        valid, movement_types = classify_step(current, operand)
        if not valid:
            return False, profile + [{MOVEMENT_INVALID}]
        profile.append(movement_types)
        current += operand
        if current < 0:
            return False, profile
    return True, profile


def validate_question(config: YLMConfig, operands: list[int], seen: set[tuple[int, ...]]) -> bool:
    config = enrich_config_with_lesson_rule(config)
    if len(operands) != config.rows:
        return False
    if tuple(operands) in seen:
        return False
    answer = sum(operands)
    if not config.allow_negative_answer and answer < 0:
        return False
    if answer > 999:
        return False
    if operands[0] < 0:
        return False

    allowed = set(config.allowed_movement_types or ())
    required = set(config.required_movement_types or ())
    valid, profile = movement_profile(operands)
    if not valid:
        return False

    observed = set().union(*profile) if profile else set()
    observed.discard(MOVEMENT_ZERO)
    if allowed and not observed.issubset(allowed):
        return False
    if required and not required.issubset(observed):
        return False

    if config.target_numbers:
        abs_operands = [abs(v) for v in operands[1:]]
        target_set = {abs(int(t)) for t in config.target_numbers}
        if not any(value in target_set for value in abs_operands):
            return False

    return True
