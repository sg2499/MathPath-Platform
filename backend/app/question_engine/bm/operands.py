from __future__ import annotations

import dataclasses
import random

from app.question_engine.bm.config import BMConfig
from app.question_engine.bm.validators import (
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

# BM-L1's workbook reaches the same 4-digit ceiling PM-L4's does (Lessons
# 21-24's 4D Add/Less blocks), so the same widened pattern set applies:
# "4D_FULL" (and a round-thousands-pinned "4D_THOUSANDS" intro variant,
# mirroring PM-L3/L4's "3D_HUNDREDS"/"4D_THOUSANDS") alongside the
# standard 2D/3D wide patterns. See _wide_target_width/_wide_row0_choices.
WIDE_DIRECT_PATTERNS = {"2D_FULL", "3D_HUNDREDS", "3D_FULL", "4D_THOUSANDS", "4D_FULL"}

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


def is_trivial_scale_operand(value: int | float) -> bool:
    """Block operands that turn multiplication/division into place shifting
    (x1, x10, x100, /10, /100, ...) instead of requiring genuine computation.

    BM-L1's own copy of the platform-wide convention (IM's _IsTrivial, MM's
    _IsTrivialScaleOperand, PM-L3/L4's is_trivial_scale_operand) -- built in
    from the start for this level's Multiply/Divide generators, per
    Shailesh's 2026-08-06 instruction not to repeat the PM-L3 gap. 0, 1, and
    any value whose only nonzero digit is its leading one (10, 20, 50, 100,
    300, ...) are trivial; single digits 2-9 remain valid.
    """
    try:
        magnitude = abs(int(value))
    except Exception:
        return False
    if magnitude in (0, 1):
        return True
    text = str(magnitude)
    if len(text) <= 1:
        return False
    return text[0] != "0" and set(text[1:]) == {"0"}


def _targets(config: BMConfig, fallback: list[int]) -> list[int]:
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
    pattern = (digit_pattern or "").upper()
    if pattern in {"4D_THOUSANDS", "4D_FULL"}:
        return 4
    if pattern in {"3D_HUNDREDS", "3D_FULL"}:
        return 3
    return 2


def _wide_row0_choices(width: int, digit_pattern: str | None) -> list[int]:
    pattern = (digit_pattern or "").upper()
    if width == 4 and pattern == "4D_THOUSANDS":
        return [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]
    if width == 3 and pattern == "3D_HUNDREDS":
        return [100, 200, 300, 400, 500, 600, 700, 800, 900]
    if width == 1:
        return list(range(1, 10))
    if width == 2:
        return list(range(10, 100))
    if width == 3:
        return list(range(100, 1000))
    return list(range(1000, 10000))


def _direct_delta_options_for_digit(digit: int, sign: int) -> list[int]:
    allowed = DIRECT_ADD_ALLOWED.get(digit, set()) if sign > 0 else DIRECT_SUB_ALLOWED.get(digit, set())
    return [0] + sorted(allowed)


def _build_direct_operand(current_value: int, width: int, sign: int, rng: random.Random) -> int | None:
    from app.question_engine.bm.validators import _digits as bm_place_digits
    base_digits = bm_place_digits(current_value, width)
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


def _row_width_schedule(config: BMConfig) -> list[tuple[int, str]]:
    """Per-row (width, digit_pattern) schedule for ONE question's chain.

    A plain (non-mixed) DPS just repeats (config.digit_pattern, config.rows)
    times. A mixed DPS (e.g. Lesson 18 DPS1's "Add/Less (Abacus), 3D,2R +
    2D,2R") sets digit_pattern_second_half/rows_second_half; those describe
    a SECOND group of rows appended to the SAME chain/stack, not a
    different shape for a different half of the DPS's questions -- built
    correctly from day one here per the PM-L4 2026-08-07 fix (BM's own
    workbook has the identical "&"/"+" mixed-width title pattern that
    caused that bug, so this is ported as the corrected design, never the
    original buggy "split the 10 questions into two batches" version).
    """
    primary_width = _schedule_width_for_pattern(config.digit_pattern)
    schedule = [(primary_width, config.digit_pattern)] * max(0, config.rows)
    if config.digit_pattern_second_half and config.rows_second_half:
        secondary_width = _schedule_width_for_pattern(config.digit_pattern_second_half)
        schedule += [(secondary_width, config.digit_pattern_second_half)] * max(0, config.rows_second_half)
    return schedule


def _schedule_width_for_pattern(digit_pattern: str | None) -> int:
    """Overflow-guard ceiling width for a DIRECT-template row0 base pool.

    For WIDE patterns (2D_FULL, 3D_HUNDREDS, ...) this is just
    _wide_target_width. For NARROW-but-multi-digit patterns -- "2D_TENS"
    (row0 pool [10, 20, ... 90], all 2-digit) and "2D" (row0 pool mixes
    1-9 with 10, 20, ... 90) -- the row0 base itself can legitimately be
    2 digits wide even though subsequent deltas stay single-digit
    (DIRECT_ADD_ALLOWED/DIRECT_SUB_ALLOWED, keyed 0-9). Hardcoding this
    ceiling to 1 (as if every DIRECT-template base were single-digit) made
    every "2D_TENS" chain fail validation on its very first delta row --
    row0=20, current+delta is inescapably 2 digits wide, so a max_width=1
    ceiling rejected every candidate, 500 attempts in a row, 100% of the
    time (caught while building BM-L1's Lesson 2 DPS1-3, whose workbook
    titles are round-tens-only "BEAD RECOGNITION & DOUBLE DIGIT DIRECT
    ADDITION-SUBTRACTION" drills). Deriving the ceiling from the actual
    achievable width of _direct_bases_for_pattern's own pool fixes this
    for every non-wide pattern, not just "2D_TENS" specifically.
    """
    if _is_wide_direct_pattern(digit_pattern):
        return _wide_target_width(digit_pattern)
    bases = _direct_bases_for_pattern(digit_pattern)
    if not bases:
        return 1
    return max(_digit_width(v) for v in bases)


def total_row_count(config: BMConfig) -> int:
    """Total rows in ONE chain, including any second-half group."""
    return len(_row_width_schedule(config))


def _build_chain(config: BMConfig, rng: random.Random) -> list[int] | None:
    """Build ONE candidate operand chain for the given template.

    Generalized N-row chain builder (row0 + N-1 further movements,
    complement technique applied on row 2 for complement templates),
    covering 1D through 4-digit-wide chains via WIDE_DIRECT_PATTERNS/
    _wide_target_width above, AND genuinely mixed-width chains (see
    _row_width_schedule) for DIRECT template DPS that set
    digit_pattern_second_half/rows_second_half.
    """
    template = (config.generation_template or TEMPLATE_DIRECT).upper()

    if template == TEMPLATE_REVISION:
        choices = tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
        chosen = rng.choice(choices)
        sub_config = dataclasses.replace(config, generation_template=chosen)
        return _build_chain(sub_config, rng)

    if template == TEMPLATE_DIRECT:
        schedule = _row_width_schedule(config)
        if not schedule:
            return None
        max_width = max(width for width, _pattern in schedule)
        row0_width, row0_pattern = schedule[0]
        if _is_wide_direct_pattern(row0_pattern):
            row0 = rng.choice(_wide_row0_choices(row0_width, row0_pattern))
        else:
            row0 = rng.choice(_direct_bases_for_pattern(row0_pattern))
        operands = [row0]
        current = row0
        for width, pattern in schedule[1:]:
            sign = _row_sign(config.operation_focus, rng)
            if _is_wide_direct_pattern(pattern):
                delta = _build_direct_operand(current, width, sign, rng)
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
            if _digit_width(current + value) > max_width:
                return None
            operands.append(value)
            current += value
        return operands

    if template in COMPLEMENT_BASE_BUILDERS:
        base_builder, default_targets, sign = COMPLEMENT_BASE_BUILDERS[template]
        target = rng.choice(_targets(config, default_targets))
        signed_target = sign * target
        bases = base_builder(target, config.digit_pattern)
        if not bases:
            return None
        trigger_value = rng.choice(bases)
        current = trigger_value + signed_target
        if current < 0:
            return None
        operands = [trigger_value, signed_target]
        for _ in range(max(0, config.rows - 2)):
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


def generate_unique_operands(config: BMConfig, rng: random.Random, seen: set[tuple[int, ...]]) -> list[int]:
    total_rows = total_row_count(config) if (config.generation_template or TEMPLATE_DIRECT).upper() == TEMPLATE_DIRECT else config.rows
    check_config = dataclasses.replace(config, rows=total_rows)

    best_valid_repeat: list[int] | None = None
    for _attempt in range(500):
        candidate = _build_chain(config, rng)
        if candidate is None:
            continue
        if not validate_question(check_config, candidate):
            continue
        if tuple(candidate) not in seen:
            return candidate
        if best_valid_repeat is None:
            best_valid_repeat = candidate

    # BM-L1's early single-target Complement-of-5/Complement-of-10 drills
    # (Lessons 3-15, 3 rows, one fixed target digit) have a genuinely small
    # combinatorial space -- e.g. "Addition of 1 Using Complement of 5"
    # with digit_pattern=1D has exactly one valid (trigger, target) base
    # pair and only 4 possible closing single-digit deltas, so only 4
    # distinct 3-row chains exist in total. A 10-question DPS can't have 10
    # UNIQUE chains from a 4-chain space -- repetition here is not a
    # generation bug, it mirrors how these foundational bead-drill
    # worksheets are actually authored (the same handful of movements
    # practiced repeatedly to build muscle memory), so once the unique-chain
    # budget above is exhausted, this falls back to returning any other
    # VALID chain (even a repeat) rather than raising -- wide-pattern DPS
    # elsewhere in the level have ample variety and will essentially never
    # reach this fallback.
    if best_valid_repeat is not None:
        return best_valid_repeat

    raise ValueError(
        f"BM lesson {config.lesson_number} DPS {config.dps_number}: could not generate a valid "
        f"{total_rows}-row Add/Less chain (template={config.generation_template}, "
        f"digit_pattern={config.digit_pattern})"
    )
