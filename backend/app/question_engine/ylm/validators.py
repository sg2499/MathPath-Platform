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



MOVEMENT_SORT_ORDER = {
    MOVEMENT_DIRECT: 10,
    MOVEMENT_COMP5_ADD: 20,
    MOVEMENT_COMP5_SUB: 30,
    MOVEMENT_COMP10_ADD: 40,
    MOVEMENT_COMP10_SUB: 50,
    MOVEMENT_ZERO: 90,
    MOVEMENT_INVALID: 999,
}

MOVEMENT_LABELS = {
    MOVEMENT_DIRECT: "Direct Add-Less",
    MOVEMENT_COMP5_ADD: "Complement of 5 Addition",
    MOVEMENT_COMP5_SUB: "Complement of 5 Subtraction",
    MOVEMENT_COMP10_ADD: "Complement of 10 Addition",
    MOVEMENT_COMP10_SUB: "Complement of 10 Subtraction",
    MOVEMENT_ZERO: "No Movement",
    MOVEMENT_INVALID: "Invalid Movement",
}

CORE_MOVEMENT_TAGS = {
    MOVEMENT_DIRECT,
    MOVEMENT_COMP5_ADD,
    MOVEMENT_COMP5_SUB,
    MOVEMENT_COMP10_ADD,
    MOVEMENT_COMP10_SUB,
}


def ordered_movement_tags(movement_types: set[str]) -> list[str]:
    return sorted(
        [movement_type for movement_type in movement_types if movement_type != MOVEMENT_ZERO],
        key=lambda movement_type: MOVEMENT_SORT_ORDER.get(movement_type, 500),
    )


def primary_movement_tag(config: YLMConfig, observed: set[str]) -> str:
    config = enrich_config_with_lesson_rule(config)
    required = set(config.required_movement_types or ())
    required_observed = required.intersection(observed)
    if required_observed:
        return ordered_movement_tags(required_observed)[0]

    non_direct = observed.difference({MOVEMENT_DIRECT, MOVEMENT_ZERO})
    if non_direct:
        return ordered_movement_tags(non_direct)[0]

    if MOVEMENT_DIRECT in observed:
        return MOVEMENT_DIRECT
    return MOVEMENT_ZERO


def question_concept_trace(config: YLMConfig, operands: list[int]) -> dict:
    """Return the auditable Golden Step concept tags for a generated YLM question.

    This metadata is intentionally internal. It gives the platform a reliable way to
    prove that each generated question belongs to the allowed concept families for
    the selected YLM lesson/DPS without exposing implementation details to students.
    """
    config = enrich_config_with_lesson_rule(config)
    valid, profile = movement_profile(operands)
    current = operands[0] if operands else 0
    observed: set[str] = set()
    steps: list[dict] = []

    for index, operand in enumerate(operands[1:], start=2):
        movement_types = profile[index - 2] if index - 2 < len(profile) else {MOVEMENT_INVALID}
        observed.update(movement_types)
        next_value = current + operand
        tags = ordered_movement_tags(set(movement_types)) or [MOVEMENT_ZERO]
        steps.append({
            "row_number": index,
            "before": current,
            "operand": operand,
            "after": next_value,
            "concept_tags": tags,
            "concept_labels": [MOVEMENT_LABELS.get(tag, tag) for tag in tags],
        })
        current = next_value

    observed.discard(MOVEMENT_ZERO)
    concept_tags = ordered_movement_tags(observed)
    primary_tag = primary_movement_tag(config, observed)
    allowed = set(config.allowed_movement_types or ())
    required = set(config.required_movement_types or ())

    return {
        "golden_step_validated": bool(valid and validate_question(config, operands, set())),
        "primary_concept_tag": primary_tag,
        "primary_concept_label": MOVEMENT_LABELS.get(primary_tag, primary_tag),
        "concept_tags": concept_tags,
        "concept_labels": [MOVEMENT_LABELS.get(tag, tag) for tag in concept_tags],
        "allowed_concept_tags": ordered_movement_tags(allowed),
        "required_concept_tags": ordered_movement_tags(required),
        "forbidden_concept_tags_present": ordered_movement_tags(observed.difference(allowed)) if allowed else [],
        "step_trace": steps,
    }


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
