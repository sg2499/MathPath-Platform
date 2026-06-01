from __future__ import annotations

import random

from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule
from app.question_engine.ylm.validators import (
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

# Phase B: revision worksheets must be concept-aware, not generic arithmetic.
# Each revision lesson uses a deterministic template rotation so every generated
# preview covers the intended taught families instead of accidentally clustering
# around one movement type.
REVISION_TEMPLATE_SCHEDULES: dict[int, tuple[str, ...]] = {
    # Direct + complement-of-5 addition revision.
    7: (
        TEMPLATE_DIRECT,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_DIRECT,
        TEMPLATE_COMP5_ADD,
    ),
    # Addition-focused complement-of-5 revision; direct rows only support fluency.
    12: (
        TEMPLATE_COMP5_ADD,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_DIRECT,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_COMP5_ADD,
    ),
    # Subtraction-focused complement-of-5 revision; direct rows only support fluency.
    13: (
        TEMPLATE_COMP5_SUB,
        TEMPLATE_COMP5_SUB,
        TEMPLATE_DIRECT,
        TEMPLATE_COMP5_SUB,
        TEMPLATE_COMP5_SUB,
    ),
    # Final YLM revision: all previously taught Golden Step families are represented.
    32: (
        TEMPLATE_DIRECT,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_COMP5_SUB,
        TEMPLATE_COMP10_ADD,
        TEMPLATE_COMP10_SUB,
        TEMPLATE_COMP10_SUB,
        TEMPLATE_COMP10_ADD,
        TEMPLATE_COMP5_SUB,
        TEMPLATE_COMP5_ADD,
        TEMPLATE_DIRECT,
    ),
}


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
    # Golden Step alignment rule:
    # - addition concept sheets receive only direct addition support rows
    # - subtraction concept sheets receive only direct subtraction support rows
    # - direct/revision direct templates may mix direct add-less rows
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
    # Example: -3 => 12 - 3, 22 - 3, 32 - 3. Not random two-digit subtraction.
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
        configured = tuple(value.upper() for value in (config.revision_templates or (TEMPLATE_DIRECT,)))
        schedule = REVISION_TEMPLATE_SCHEDULES.get(config.lesson_number)
        if schedule:
            # Keep the schedule strictly inside the lesson's configured taught families.
            allowed = set(configured)
            return tuple(value for value in schedule if value in allowed) or configured
        return configured
    return (template,)


def _template_for_question(config: YLMConfig, question_index: int) -> str | None:
    template = (config.generation_template or TEMPLATE_DIRECT).upper()
    if template != TEMPLATE_REVISION:
        return None
    templates = _lesson_templates(config)
    if not templates:
        return TEMPLATE_DIRECT
    return templates[question_index % len(templates)]


def _candidate_pool_for_templates(config: YLMConfig, templates: tuple[str, ...]) -> list[list[int]]:
    pool: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()
    for template in templates:
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


def build_candidate_pool(config: YLMConfig) -> list[list[int]]:
    config = enrich_config_with_lesson_rule(config)
    return _candidate_pool_for_templates(config, _lesson_templates(config))


def generate_unique_operands(config: YLMConfig, rng: random.Random, seen: set[tuple[int, ...]]) -> list[int]:
    config = enrich_config_with_lesson_rule(config)
    question_index = len(seen)
    preferred_template = _template_for_question(config, question_index)

    if preferred_template:
        preferred_pool = _candidate_pool_for_templates(config, (preferred_template,))
        available = [operands for operands in preferred_pool if tuple(operands) not in seen]
        if available:
            return list(rng.choice(available))
        if preferred_pool:
            # If a narrow revision family runs out of unique combinations, reuse that
            # same valid family before moving to broader revision. Never use generic fallback.
            return list(rng.choice(preferred_pool))

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
