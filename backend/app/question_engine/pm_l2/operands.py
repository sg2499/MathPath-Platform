from __future__ import annotations

import random

from app.question_engine.pm_l2.config import PML2Config
from app.question_engine.pm_l2.validators import (
    DIRECT_ADD_ALLOWED,
    DIRECT_SUB_ALLOWED,
    MOVEMENT_DIRECT,
    MOVEMENT_ZERO,
    validate_question,
    movement_profile,
    _digits as _pm_l2_place_digits,
)

TEMPLATE_DIRECT = "DIRECT"
TEMPLATE_COMP5_ADD = "COMP5_ADD"
TEMPLATE_COMP5_SUB = "COMP5_SUB"
TEMPLATE_COMP10_ADD = "COMP10_ADD"
TEMPLATE_COMP10_SUB = "COMP10_SUB"
TEMPLATE_REVISION = "REVISION"

# PM-L2 uses genuine multi-digit direct addition/subtraction extensively
# (Lessons 1-4, 10-12), including all the way up to 3-digit -- see
# _wide_direct_stems() below.
WIDE_DIRECT_PATTERNS = {"2D_FULL", "3D_HUNDREDS", "3D_FULL"}


DIFFICULTY_STAGES: tuple[str, ...] = (
    "EASY", "EASY", "EASY_MEDIUM", "EASY_MEDIUM", "MEDIUM",
    "MEDIUM", "MEDIUM_HARD", "MEDIUM_HARD", "CHALLENGE", "CHALLENGE",
)

DIFFICULTY_ORDER: tuple[str, ...] = ("EASY", "EASY_MEDIUM", "MEDIUM", "MEDIUM_HARD", "CHALLENGE")

TEMPLATE_DIFFICULTY_WEIGHT: dict[str, int] = {
    TEMPLATE_DIRECT: 0,
    TEMPLATE_COMP5_ADD: 10,
    TEMPLATE_COMP5_SUB: 12,
    TEMPLATE_COMP10_ADD: 18,
    TEMPLATE_COMP10_SUB: 22,
}


def question_difficulty_stage(question_index: int) -> str:
    if question_index < 0:
        return "EASY"
    if question_index < len(DIFFICULTY_STAGES):
        return DIFFICULTY_STAGES[question_index]
    return "CHALLENGE"


def _targets(config: PML2Config, fallback: list[int]) -> list[int]:
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


def _direct_bases(config: PML2Config) -> list[int]:
    """PM-L2's own base pool per digit_pattern."""
    digit_pattern = (config.digit_pattern or "1D").upper()
    place_value = (config.place_value or "ONES").upper()
    if digit_pattern == "3D_FULL":
        return list(range(100, 1000))
    if digit_pattern == "3D_HUNDREDS":
        return [100, 200, 300, 400, 500, 600, 700, 800, 900]
    if digit_pattern == "2D_FULL":
        return list(range(10, 100))
    if digit_pattern == "2D_TENS":
        return [10, 20, 30, 40, 50, 60, 70, 80, 90]
    if digit_pattern in {"2D", "1D_AND_2D"} or place_value in {"MIXED", "ONES_AND_TENS"}:
        return list(range(1, 10)) + [10, 20, 30, 40, 50, 60, 70, 80, 90]
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


def _digit_width(value: int) -> int:
    return len(str(abs(int(value)))) if value != 0 else 1


def _direct_delta_options_for_digit(digit: int, sign: int) -> list[int]:
    allowed = DIRECT_ADD_ALLOWED.get(digit, set()) if sign > 0 else DIRECT_SUB_ALLOWED.get(digit, set())
    return [0] + sorted(allowed)


def _build_direct_operand(current_value: int, width: int, sign: int, rng: random.Random) -> int | None:
    base_digits = _pm_l2_place_digits(current_value, width)
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


def _is_pure_direct_movement(operands: list[int]) -> bool:
    valid, profile = movement_profile(operands)
    if not valid:
        return False
    return all(
        movement_type in (MOVEMENT_DIRECT, MOVEMENT_ZERO)
        for step_types in profile
        for movement_type in step_types
    )


def _wide_direct_stems(config: PML2Config) -> list[tuple[int, int, int]]:
    """PM-L2's own construction for genuine 2/3-digit direct
    addition-subtraction stacks (2D_FULL / 3D_HUNDREDS / 3D_FULL), at least 2
    of the stack's 3 rows exactly at the lesson's target digit width
    (optionally all 3), any remaining row a mix of 1..target_width digits.
    """
    target_width = _wide_target_width(config.digit_pattern)
    focus = (config.operation_focus or "ADD_LESS").upper()
    sampler = random.Random(
        f"WIDE-DIRECT-{config.module_code}-{config.level_code}-L{config.lesson_number}-D{config.dps_number}-{config.digit_pattern}"
    )

    def _row_sign() -> int:
        if focus == "ADDITION":
            return 1
        if focus == "SUBTRACTION":
            return -1
        return sampler.choice((1, -1))

    stems: list[tuple[int, int, int]] = []
    seen: set[tuple[int, int, int]] = set()
    attempts = 0
    target_pool_size = 80
    max_attempts = 3000
    while len(stems) < target_pool_size and attempts < max_attempts:
        attempts += 1
        wide_count = sampler.choice((2, 2, 2, 3))
        mixed_slot = sampler.choice((0, 1, 2)) if wide_count == 2 else None
        mixed_width = sampler.choice(tuple(range(1, target_width + 1))) if mixed_slot is not None else target_width

        row0_width = mixed_width if mixed_slot == 0 else target_width
        row0 = sampler.choice(_wide_row0_choices(row0_width, config.digit_pattern))
        if _digit_width(row0) > target_width:
            continue

        row1_width = mixed_width if mixed_slot == 1 else target_width
        row1_sign = _row_sign()
        row1_delta = _build_direct_operand(row0, row1_width, row1_sign, sampler)
        if row1_delta is None:
            continue
        row1 = row1_sign * row1_delta
        current_after_row1 = row0 + row1
        if current_after_row1 < 0 or _digit_width(current_after_row1) > target_width:
            continue

        row2_width = mixed_width if mixed_slot == 2 else target_width
        row2_sign = _row_sign()
        row2_delta = _build_direct_operand(current_after_row1, row2_width, row2_sign, sampler)
        if row2_delta is None:
            continue
        row2 = row2_sign * row2_delta
        final_answer = current_after_row1 + row2
        if final_answer < 0 or _digit_width(final_answer) > target_width:
            continue

        key = (row0, row1, row2)
        if key in seen:
            continue
        if not _is_pure_direct_movement(list(key)):
            continue
        seen.add(key)
        stems.append(key)
    return stems


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
    """Digit-width gate for a complement-template base's tens component --
    same convention PM-L1 uses (1D => narrowest/single-digit tier only, 2D =>
    everything else, anything else unrestricted).
    """
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


def _direct_stems(config: PML2Config) -> list[tuple[int, int, str]]:
    stems: list[tuple[int, int, str]] = []
    for base in _direct_bases(config):
        for operand in _direct_operands_for_focus(base, config.operation_focus):
            stems.append((base, operand, TEMPLATE_DIRECT))
    return stems


COMPLEMENT_BASE_BUILDERS = {
    TEMPLATE_COMP5_ADD: (_comp5_add_bases, [1, 2, 3, 4], 1),
    TEMPLATE_COMP5_SUB: (_comp5_sub_bases, [1, 2, 3, 4], -1),
    TEMPLATE_COMP10_ADD: (_comp10_add_bases, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1),
    TEMPLATE_COMP10_SUB: (_comp10_sub_bases, [1, 2, 3, 4, 5, 6, 7, 8, 9], -1),
}


def _setup_reaching(trigger_value: int) -> list[tuple[int, int]]:
    ones = trigger_value % 10
    prefix = trigger_value - ones
    results: list[tuple[int, int]] = []
    for before_ones in range(10):
        if before_ones == ones:
            continue
        row0 = prefix + before_ones
        if row0 <= 0:
            continue
        delta = ones - before_ones
        if delta > 0 and delta in DIRECT_ADD_ALLOWED.get(before_ones, set()):
            results.append((row0, delta))
        elif delta < 0 and abs(delta) in DIRECT_SUB_ALLOWED.get(before_ones, set()):
            results.append((row0, delta))
    return results


def _extend_with_support_chain(base_operands: list[int], template: str, extra_rows: int) -> list[list[int]]:
    """Chain `extra_rows` additional direct-support steps onto a complete
    complement operand sequence -- widens the candidate pool for a DPS
    configured with more than the technique's native 3 rows. 2026-09-02,
    mirrors the identical fix in question_engine/pm/operands.py (see that
    module's own docstring for the full write-up of why this was needed:
    PM-L2 Lesson 6's four single-digit DPS topped out at 6-8 unique 3-row
    combinations, below their question_count of 10). extra_rows == 0 (the
    overwhelmingly common case) returns the operand sequence unchanged.
    """
    if extra_rows <= 0:
        return [base_operands]
    current = sum(base_operands)
    if current < 0:
        return []
    results: list[list[int]] = []

    def _extend(prefix: list[int], running_value: int, remaining: int) -> None:
        if remaining == 0:
            results.append(prefix)
            return
        for support in _safe_supports(running_value, template):
            if running_value + support < 0:
                continue
            _extend(prefix + [support], running_value + support, remaining - 1)

    _extend(list(base_operands), current, extra_rows)
    return results


def _complement_operand_triples(config: PML2Config, template: str) -> list[list[int]]:
    base_builder, default_targets, sign = COMPLEMENT_BASE_BUILDERS[template]
    extra_rows = max(0, config.rows - 3)
    triples: list[list[int]] = []
    for target in _targets(config, default_targets):
        signed_target = sign * target
        for trigger_value in base_builder(target, config.digit_pattern):
            after_trigger = trigger_value + signed_target
            if after_trigger >= 0:
                for support in _safe_supports(after_trigger, template):
                    triples.extend(_extend_with_support_chain([trigger_value, signed_target, support], template, extra_rows))
            for setup_row0, setup_delta in _setup_reaching(trigger_value):
                triples.extend(_extend_with_support_chain([setup_row0, setup_delta, signed_target], template, extra_rows))
    return triples


def _lesson_templates(config: PML2Config) -> tuple[str, ...]:
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template == TEMPLATE_REVISION:
        return tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
    return (template,)


def _template_for_question(config: PML2Config, question_index: int) -> str | None:
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template != TEMPLATE_REVISION:
        return None
    templates = _lesson_templates(config)
    if not templates:
        return TEMPLATE_DIRECT
    return templates[question_index % len(templates)]


def _candidate_pool_for_templates(config: PML2Config, templates: tuple[str, ...]) -> list[list[int]]:
    pool: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()

    def _consider(operands: list[int]) -> None:
        key = tuple(operands)
        if key in seen:
            return
        if validate_question(config, operands):
            pool.append(operands)
            seen.add(key)

    for template in templates:
        if template == TEMPLATE_DIRECT and _is_wide_direct_pattern(config.digit_pattern):
            for operands in _wide_direct_stems(config):
                _consider(list(operands))
            continue
        if template in COMPLEMENT_BASE_BUILDERS:
            for operands in _complement_operand_triples(config, template):
                _consider(operands)
            continue
        for base, primary, source_template in _direct_stems(config):
            current = base + primary
            if current < 0:
                continue
            for support in _safe_supports(current, source_template):
                _consider([base, primary, support])
    return pool


def build_candidate_pool(config: PML2Config) -> list[list[int]]:
    return _candidate_pool_for_templates(config, _lesson_templates(config))


def _operand_template_tag(operands: list[int]) -> str:
    if len(operands) < 2:
        return TEMPLATE_DIRECT
    primary = operands[1]
    if primary > 0 and abs(primary) in {1, 2, 3, 4}:
        base_ones = operands[0] % 10
        if base_ones == 5 - abs(primary):
            return TEMPLATE_COMP5_ADD
    if primary < 0 and abs(primary) in {1, 2, 3, 4}:
        base_ones = operands[0] % 10
        if 5 <= base_ones <= 4 + abs(primary):
            return TEMPLATE_COMP5_SUB
    if primary > 0 and abs(primary) in {1, 2, 3, 4, 5, 6, 7, 8, 9}:
        base_ones = operands[0] % 10
        if base_ones == 10 - abs(primary):
            return TEMPLATE_COMP10_ADD
    if primary < 0 and abs(primary) in {1, 2, 3, 4, 5, 6, 7, 8, 9}:
        base_ones = operands[0] % 10
        if 0 <= base_ones < abs(primary):
            return TEMPLATE_COMP10_SUB
    return TEMPLATE_DIRECT


def _difficulty_score(operands: list[int]) -> int:
    base = abs(operands[0]) if operands else 0
    answer = abs(sum(operands))
    support_count = max(0, len(operands) - 2)
    support_load = sum(abs(value) for value in operands[2:])
    primary_load = abs(operands[1]) if len(operands) > 1 else 0
    two_digit_bonus = 16 if max(base, answer) >= 10 else 0
    high_number_bonus = max(base, answer) // 10
    template_bonus = TEMPLATE_DIFFICULTY_WEIGHT.get(_operand_template_tag(operands), 0)
    direction_changes = 0
    previous_sign = 1 if operands[1] >= 0 else -1 if len(operands) > 1 else 0
    for value in operands[2:]:
        current_sign = 1 if value >= 0 else -1
        if previous_sign and current_sign != previous_sign:
            direction_changes += 1
        previous_sign = current_sign
    return (
        template_bonus + two_digit_bonus + high_number_bonus
        + primary_load + support_load + support_count * 3 + direction_changes * 4
    )


def _max_question_value(operands: list[int]) -> int:
    running = operands[0] if operands else 0
    maximum = abs(running)
    for value in operands[1:]:
        running += value
        maximum = max(maximum, abs(running))
    return maximum


def _support_load(operands: list[int]) -> int:
    return sum(abs(value) for value in operands[2:]) if len(operands) > 2 else 0


def _support_direction_changes(operands: list[int]) -> int:
    if len(operands) < 3:
        return 0
    changes = 0
    previous = 1 if operands[1] >= 0 else -1
    for value in operands[2:]:
        current = 1 if value >= 0 else -1
        if current != previous:
            changes += 1
        previous = current
    return changes


def _absolute_stage_match(operands: list[int], target_stage: str) -> bool:
    max_value = _max_question_value(operands)
    support_load = _support_load(operands)
    changes = _support_direction_changes(operands)
    tag = _operand_template_tag(operands)

    if tag == TEMPLATE_DIRECT and max_value < 10:
        if target_stage == "EASY":
            return support_load <= 4 and changes <= 1
        if target_stage == "EASY_MEDIUM":
            return support_load <= 5
        if target_stage == "MEDIUM":
            return support_load <= 6
        if target_stage == "MEDIUM_HARD":
            return support_load >= 4
        return support_load >= 5 or changes >= 1

    if target_stage == "EASY":
        return max_value <= 250 and support_load <= 4 and changes <= 1
    if target_stage == "EASY_MEDIUM":
        return max_value <= 450 and support_load <= 5
    if target_stage == "MEDIUM":
        return 20 <= max_value <= 999
    if target_stage == "MEDIUM_HARD":
        return max_value >= 35 and support_load >= 2
    if target_stage == "CHALLENGE":
        return max_value >= 55 or support_load >= 7 or changes >= 1
    return True


def _near_duplicate_key(operands: list[int]) -> tuple:
    tag = _operand_template_tag(operands)
    base = operands[0] if operands else 0
    primary = operands[1] if len(operands) > 1 else 0
    support_signature = tuple((1 if value >= 0 else -1, abs(value)) for value in operands[2:])
    return (tag, primary, base // 10, support_signature)


def _near_duplicate_family(operands: list[int]) -> tuple:
    tag = _operand_template_tag(operands)
    base = operands[0] if operands else 0
    primary = operands[1] if len(operands) > 1 else 0
    return (tag, primary, base // 10)


def _without_near_duplicates(candidates: list[list[int]], seen: set[tuple[int, ...]]) -> list[list[int]]:
    if not candidates or not seen:
        return candidates
    seen_operands = [list(values) for values in seen]
    used_keys = {_near_duplicate_key(values) for values in seen_operands}
    strong = [operands for operands in candidates if _near_duplicate_key(operands) not in used_keys]
    if strong:
        return strong
    used_families = {_near_duplicate_family(values) for values in seen_operands}
    relaxed = [operands for operands in candidates if _near_duplicate_family(operands) not in used_families]
    return relaxed or candidates


def _bucketed_by_difficulty(pool: list[list[int]]) -> dict[str, list[list[int]]]:
    if not pool:
        return {stage: [] for stage in DIFFICULTY_ORDER}
    ordered = sorted(pool, key=lambda operands: (_difficulty_score(operands), tuple(operands)))
    bucketed: dict[str, list[list[int]]] = {stage: [] for stage in DIFFICULTY_ORDER}
    total = len(ordered)
    for index, operands in enumerate(ordered):
        bucket_index = min(len(DIFFICULTY_ORDER) - 1, (index * len(DIFFICULTY_ORDER)) // max(total, 1))
        bucketed[DIFFICULTY_ORDER[bucket_index]].append(operands)
    return bucketed


def _difficulty_candidates(pool: list[list[int]], target_stage: str) -> list[list[int]]:
    bucketed = _bucketed_by_difficulty(pool)
    target_stage = target_stage if target_stage in DIFFICULTY_ORDER else "MEDIUM"
    target_index = DIFFICULTY_ORDER.index(target_stage)

    stage_order = [target_stage]
    for distance in range(1, len(DIFFICULTY_ORDER)):
        lower = target_index - distance
        upper = target_index + distance
        if lower >= 0:
            stage_order.append(DIFFICULTY_ORDER[lower])
        if upper < len(DIFFICULTY_ORDER):
            stage_order.append(DIFFICULTY_ORDER[upper])

    for stage in stage_order:
        stage_pool = list(bucketed.get(stage, []))
        absolute_pool = [operands for operands in stage_pool if _absolute_stage_match(operands, target_stage)]
        if absolute_pool:
            return absolute_pool
        if stage_pool:
            return stage_pool

    absolute_all = [operands for operands in pool if _absolute_stage_match(operands, target_stage)]
    return absolute_all or list(pool)


def generate_unique_operands(config: PML2Config, rng: random.Random, seen: set[tuple[int, ...]], question_index: int | None = None) -> list[int]:
    # 2026-09-02 -- two related fixes, mirroring PM-L1's identical fix of the
    # same date (see pm/operands.py for the full write-up):
    #
    # 1. question_index now comes from the caller's real, ever-advancing
    #    question_number - 1 instead of len(seen). Stays optional (falling
    #    back to len(seen)) so any other caller keeps working unchanged.
    #
    # 2. The bigger fix: previously, once the *preferred template's own*
    #    pool ran out of unique-enough candidates at the target difficulty,
    #    this function gave up immediately and reused an already-seen
    #    combination, even when the DPS's full candidate pool (every other
    #    template) still had genuinely unique combinations left. That is
    #    what actually produced the live duplicate tail (live-confirmed:
    #    PM-L2 Lesson 6, DPS 1-4 -- questions 7, 9 and 10 identical). Now
    #    the full multi-template pool is tried for a unique candidate
    #    before ever repeating one, and reuse (biased toward the requested
    #    stage) is the last resort, only once question_count genuinely
    #    exceeds the DPS's total unique capacity.
    if question_index is None:
        question_index = len(seen)
    preferred_template = _template_for_question(config, question_index)
    target_stage = question_difficulty_stage(question_index)

    def _pick(pool: list[list[int]], stage: str) -> list[int] | None:
        candidates = _difficulty_candidates(pool, stage)
        return list(rng.choice(candidates)) if candidates else None

    preferred_pool: list[list[int]] = []
    if preferred_template:
        preferred_pool = _candidate_pool_for_templates(config, (preferred_template,))
        preferred_available = [operands for operands in preferred_pool if tuple(operands) not in seen]
        preferred_available = _without_near_duplicates(preferred_available, seen)
        result = _pick(preferred_available, target_stage)
        if result is not None:
            return result

    pool = build_candidate_pool(config)
    unique_pool = [operands for operands in pool if tuple(operands) not in seen]
    unique_pool = _without_near_duplicates(unique_pool, seen)
    result = _pick(unique_pool, target_stage)
    if result is not None:
        return result

    # Nothing unique left anywhere in the DPS's pool -- only now repeat,
    # preferring the requested template/stage so the repeat is at least
    # thematically consistent with where the sheet was heading.
    if preferred_pool:
        result = _pick(preferred_pool, target_stage)
        if result is not None:
            return result
    result = _pick(pool, target_stage)
    if result is not None:
        return result
    raise ValueError(f"PM-L2 lesson {config.lesson_number} DPS {config.dps_number} has no valid generation pool")
