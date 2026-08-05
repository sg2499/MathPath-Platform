from __future__ import annotations

import random

from app.question_engine.pm.config import PMConfig
from app.question_engine.pm.validators import (
    DIRECT_ADD_ALLOWED,
    DIRECT_SUB_ALLOWED,
    MOVEMENT_DIRECT,
    MOVEMENT_ZERO,
    validate_question,
    movement_profile,
    _digits as _pm_place_digits,
)

TEMPLATE_DIRECT = "DIRECT"
TEMPLATE_COMP5_ADD = "COMP5_ADD"
TEMPLATE_COMP5_SUB = "COMP5_SUB"
TEMPLATE_COMP10_ADD = "COMP10_ADD"
TEMPLATE_COMP10_SUB = "COMP10_SUB"
TEMPLATE_REVISION = "REVISION"

# Bridge Module Lesson 2's own digit patterns -- genuine multi-digit direct
# addition/subtraction, not just a multi-digit *starting* value with
# single-digit adds (see _wide_direct_stems() below for why that distinction
# matters and what changed).
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


def _targets(config: PMConfig, fallback: list[int]) -> list[int]:
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


def _direct_bases(config: PMConfig) -> list[int]:
    """PM-owned base pool per digit_pattern. Bridge Module's curriculum needs
    a wider range than a beginner module ever does -- Lesson 2 moves straight
    to arbitrary two- and three-digit direct addition/subtraction, not just
    round multiples of ten -- so 2D_FULL / 3D_HUNDREDS / 3D_FULL exist here
    from the start as first-class PM digit patterns, not a bolt-on.
    """
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
    """Values usable for row 0 (the starting display value -- no bead
    movement of its own, so no DIRECT_ADD_ALLOWED/DIRECT_SUB_ALLOWED
    constraint applies) at exactly `width` digits."""
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
    """Legal DIRECT delta magnitudes at a single digit place, for the given
    sign (+1 add, -1 subtract) -- 0 always included (that place doesn't move
    for this operand)."""
    allowed = DIRECT_ADD_ALLOWED.get(digit, set()) if sign > 0 else DIRECT_SUB_ALLOWED.get(digit, set())
    return [0] + sorted(allowed)


def _build_direct_operand(current_value: int, width: int, sign: int, rng: random.Random) -> int | None:
    """A `width`-digit-place delta against current_value that is a pure
    DIRECT bead movement at every one of those places independently -- each
    place's delta is drawn straight from that place's own
    DIRECT_ADD_ALLOWED/DIRECT_SUB_ALLOWED options (0 permitted, meaning that
    place doesn't move for this operand), so the result is direct-only by
    construction rather than by rejection sampling. The top place is forced
    nonzero so the operand actually displays at `width` digits (never
    silently collapses to a shorter number). Returns None if this
    current_value's own top-place digit is 4 or 9 (DIRECT_ADD_ALLOWED has no
    entries at all for those, so no nonzero top-place delta is possible from
    here) -- the caller should just try a different current_value.
    """
    base_digits = _pm_place_digits(current_value, width)
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
    """True only if every row-to-row transition is a plain DIRECT bead move
    (or no movement at all) -- validate_question() alone is not enough here
    since it's the generic checker every PM template shares (COMP5/COMP10
    movements are 'valid' questions too, just not DIRECT ones), and a
    'Direct Addition/Subtraction' sheet must never silently include a
    complement-technique step.
    """
    valid, profile = movement_profile(operands)
    if not valid:
        return False
    return all(
        movement_type in (MOVEMENT_DIRECT, MOVEMENT_ZERO)
        for step_types in profile
        for movement_type in step_types
    )


def _wide_direct_stems(config: PMConfig) -> list[tuple[int, int, int]]:
    """PM-native construction for Bridge Module Lesson 2's genuine 2/3-digit
    direct addition-subtraction stacks (2D_FULL / 3D_HUNDREDS / 3D_FULL).
    Every other DIRECT sheet's 2nd/3rd rows come from the single-digit
    DIRECT_ADD_ALLOWED/DIRECT_SUB_ALLOWED tables (one bead move), which is
    correct there but meant these particular sheets' 2nd/3rd rows never
    actually carried the lesson's own digit width -- only the starting row
    did (e.g. every generated question was base=40ish + a single-digit +/-,
    never a genuine two-digit addition).

    Requirement (2026-08-04, Shailesh): at least 2 of the stack's 3 rows
    must be exactly the lesson's target digit width (2 for 2D_FULL, 3 for
    3D_HUNDREDS/3D_FULL) -- optionally all 3 -- with any remaining row a mix
    of 1/2/3 digits, and which row is the odd one out varying question to
    question rather than being fixed to always the base or always the last
    row.

    Each operand row is built via _build_direct_operand(), which draws a
    per-digit-place delta straight from that place's own
    DIRECT_ADD_ALLOWED/DIRECT_SUB_ALLOWED options -- direct by construction,
    not by rejection sampling, so this doesn't waste attempts on doomed
    candidates the way naively guessing a random 2/3-digit number and
    checking it afterwards would. _is_pure_direct_movement() is still
    re-checked on the assembled triple as a hard gate before anything here
    is ever handed to the caller, since validate_question() alone accepts
    any movement type (it's the generic checker every PM template shares),
    not just DIRECT.
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
        # 2 wide rows + 1 mixed row most of the time, but "can be all 3
        # rows as well" per the requirement -- occasionally skip the mixed
        # row entirely and make every row the target width. The mixed row's
        # own width is capped at target_width (never above it) -- a "double
        # digit" concept must never show a triple-digit row, but a "triple
        # digit" concept may legitimately show a single, double, or triple
        # digit row (per the explicit 2026-08-04 correction: the first cut
        # of this let the mixed row roll a width of 1-3 unconditionally,
        # which silently let a 2D_FULL sheet show a 3-digit row).
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
        # Every running value the student ever sees on this sheet -- not
        # just each row's own printed number -- must stay within the
        # concept's own digit width. A "double digit" sheet must never let
        # two legitimately double-digit rows add up to a triple-digit
        # running total; that's still "not in scope of the concept" even
        # though no single row itself exceeded the width.
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
    """Digit-width gate for a complement-template base's tens component.

    Confirmed against Bridge Level.xlsx + the matching Lesson-1..15 DPS
    images (2026-08-05 audit): within every complement lesson (3-15), DPS1/
    DPS3 are single-digit-only practice of a technique and DPS2/DPS4 are a
    strict double-digit escalation of that *same* technique -- e.g. Lesson
    3 DPS1 "Addition of 1 using Complement of 5" bases are exactly {4}
    (single digit), DPS2 (identical title/technique) bases are exactly
    {14,24,...,94} (double digit only), never both in the same sheet. DPS5
    (revision, both techniques) is likewise pure double-digit, not a 1D/2D
    mix. "1D" therefore restricts to the single-digit base (tens=0) only,
    "2D" restricts to double-digit bases (tens != 0) only; any other value
    (e.g. "1D_AND_2D", used by mock/assessment concept pools that
    deliberately want both widths for broader coverage) is unrestricted,
    matching this function's pre-fix behavior.

    COMP10_SUB is a structural exception: subtracting via complement of 10
    requires an actual tens place to borrow from, so its own tens pool
    (see _comp10_sub_bases) never contains 0 in the first place -- there is
    no mathematically valid single-digit base for that one template. Rather
    than hardcode "1D means tens==0", both branches key off whichever tens
    value is *narrowest in this specific pool* (0 for every other
    complement template, 10 for COMP10_SUB): "1D" keeps only that narrowest
    tier, "2D" keeps everything else. This makes COMP10_SUB's "1D" DPS
    (e.g. Lesson 4 DPS3, Lesson 13 DPS1/DPS3) fall back to the smallest
    two-digit trigger (10-19) instead of an impossible empty set, while its
    "2D" sibling is still correctly disjoint from that tier (20-99) instead
    of accidentally re-including 10-19 by only ever checking for a literal
    zero that this pool never had.
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
    # +target using complement of 10 must start from the exact trigger unit.
    # Example: +4 => 6 + 4, 16 + 4, 26 + 4. Not 38 + 4.
    ones = 10 - target
    tens_values = _comp_tens_values([0, 10, 20, 30, 40, 50, 60], digit_pattern)
    return [tens + ones for tens in tens_values if tens + ones > 0]


def _comp10_sub_bases(target: int, digit_pattern: str | None = None) -> list[int]:
    # -target using complement of 10 must start from the exact borrow trigger range.
    # Example: -3 => 12 - 3, 22 - 3, 32 - 3. Not random two-digit subtraction.
    ones_values = list(range(0, target))
    tens_values = _comp_tens_values([10, 20, 30, 40, 50, 60, 70, 80, 90], digit_pattern)
    return [tens + ones for tens in tens_values for ones in ones_values]


def _direct_stems(config: PMConfig) -> list[tuple[int, int, str]]:
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
    """Every legal (predecessor, delta) pair that reaches `trigger_value` via
    exactly one pure DIRECT bead move at the ones place -- the "setup" half
    of the trigger-position-varies pattern confirmed against Bridge
    Level.xlsx + the Lesson-1..15 images (2026-08-05 redesign). Real example
    traced from Lesson 3 DPS1 ("Addition of 1 using Complement of 5"), where
    the technique fires at whichever row happens to land on ones-digit 4:
    column A1 is 2 -> (+2, DIRECT) -> 4 -> (+1, COMP5_ADD); column A4 is
    9 -> (-5, DIRECT) -> 4 -> (+1, COMP5_ADD) -- an addition lesson whose
    setup move is itself a subtraction, which is why both DIRECT_ADD_ALLOWED
    and DIRECT_SUB_ALLOWED are searched here regardless of the template's
    own operation_focus (only the *trigger* step's direction is locked to
    the lesson's technique, never the setup step's).

    Stays within `trigger_value`'s own tens/hundreds block by construction
    (only the ones digit changes), so this can never widen a DPS past its
    already digit-pattern-gated scope -- a 2D trigger like 24 only ever
    proposes 2D predecessors (20-29), never a 1D or 3D one.
    """
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


def _complement_operand_triples(config: PMConfig, template: str) -> list[list[int]]:
    """Every candidate 3-row question for a complement template, covering
    both positions the technique step is observed to occupy in the real
    worksheet (2026-08-05 redesign, see _setup_reaching()'s docstring):

    MODE A -- trigger first: row0 is already sitting at the technique's own
    trigger digit, row1 *is* the technique move, row2 is a trailing direct
    support step (the pre-redesign shape, unchanged).

    MODE B -- trigger second: row0 is any digit reachable one direct move
    away from the trigger digit, row1 is that direct setup move, row2 *is*
    the technique move. This is what gives single-digit DPS genuine
    question-to-question variety (e.g. Lesson 3 DPS1's base is no longer
    pinned to the single value 4 -- it can legitimately be 2, 3, 9, ... as
    long as one direct step reaches 4) instead of the same fixed trigger
    value repeated with only the trailing support varying.

    Every candidate is still filtered through the same validate_question()
    every other PM template uses -- this function only proposes richer
    shapes, it does not relax what counts as a legal one.
    """
    base_builder, default_targets, sign = COMPLEMENT_BASE_BUILDERS[template]
    triples: list[list[int]] = []
    for target in _targets(config, default_targets):
        signed_target = sign * target
        for trigger_value in base_builder(target, config.digit_pattern):
            # MODE A: trigger first, trailing support.
            after_trigger = trigger_value + signed_target
            if after_trigger >= 0:
                for support in _safe_supports(after_trigger, template):
                    triples.append([trigger_value, signed_target, support])
            # MODE B: setup first, trigger last.
            for setup_row0, setup_delta in _setup_reaching(trigger_value):
                triples.append([setup_row0, setup_delta, signed_target])
    return triples


def _lesson_templates(config: PMConfig) -> tuple[str, ...]:
    """Which template(s) a DPS draws from. REVISION rotates through exactly
    the templates the seed config configured for that DPS (revision_templates)
    -- PM has no cross-lesson-number schedule table, so there is no way for
    one PM lesson's rotation to ever be affected by another PM lesson's
    number, let alone another module's.
    """
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template == TEMPLATE_REVISION:
        return tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
    return (template,)


def _template_for_question(config: PMConfig, question_index: int) -> str | None:
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template != TEMPLATE_REVISION:
        return None
    templates = _lesson_templates(config)
    if not templates:
        return TEMPLATE_DIRECT
    return templates[question_index % len(templates)]


def _candidate_pool_for_templates(config: PMConfig, templates: tuple[str, ...]) -> list[list[int]]:
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
            # Bridge Module Lesson 2's genuine 2/3-digit direct stacks --
            # see _wide_direct_stems()'s own docstring for why this needs a
            # dedicated builder instead of the single-digit base+support
            # pipeline below.
            for operands in _wide_direct_stems(config):
                _consider(list(operands))
            continue
        if template in COMPLEMENT_BASE_BUILDERS:
            # 2026-08-05 redesign -- see _complement_operand_triples()'s own
            # docstring: these are already complete 3-row triples (MODE A
            # and MODE B both), not a base+primary stem needing a further
            # support step appended.
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


def build_candidate_pool(config: PMConfig) -> list[list[int]]:
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
        return 20 <= max_value <= 700
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


def generate_unique_operands(config: PMConfig, rng: random.Random, seen: set[tuple[int, ...]]) -> list[int]:
    question_index = len(seen)
    preferred_template = _template_for_question(config, question_index)
    target_stage = question_difficulty_stage(question_index)

    if preferred_template:
        preferred_pool = _candidate_pool_for_templates(config, (preferred_template,))
        preferred_available = [operands for operands in preferred_pool if tuple(operands) not in seen]
        preferred_available = _without_near_duplicates(preferred_available, seen)
        available = _difficulty_candidates(preferred_available, target_stage)
        if available:
            return list(rng.choice(available))
        if preferred_pool:
            return list(rng.choice(_difficulty_candidates(preferred_pool, target_stage)))

    pool = build_candidate_pool(config)
    unique_pool = [operands for operands in pool if tuple(operands) not in seen]
    unique_pool = _without_near_duplicates(unique_pool, seen)
    available = _difficulty_candidates(unique_pool, target_stage)
    if not available:
        available = _difficulty_candidates(pool, target_stage)
    if not available:
        raise ValueError(f"PM lesson {config.lesson_number} DPS {config.dps_number} has no valid generation pool")
    return list(rng.choice(available))
