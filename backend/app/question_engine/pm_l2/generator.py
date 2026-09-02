import random

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.pm_l2.config import PML2Config, PML2ConceptDrillConfig
from app.question_engine.pm_l2.operands import generate_unique_operands, question_difficulty_stage
from app.question_engine.pm_l2.validators import question_concept_trace, validate_question
from app.question_engine.pm_l2.distractors import generate_distractors
from app.question_engine.pm_l2.concept_drill import generate_concept_drill_question


def generate_pm_l2_question_set(config: PML2Config) -> list[dict]:
    """Preparatory Module Level 2's own, fully independent vertical 3-row
    add/less question generator. Does not import from question_engine/pm
    (PM-L1) or any other level/module's engine, and nothing outside this
    package imports from here -- a bug or future change in PM-L1's generator
    can never touch PM-L2's output, and vice versa, per Shailesh's explicit
    2026-08-05 "dedicated engine per level" instruction.
    """
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    for question_number in range(1, config.question_count + 1):
        q_rng = random.Random(f"{config.seed}-Q{question_number}")
        # Second-half digit-pattern escalation (e.g. PM-L2 Lesson 11 DPS3:
        # A1-A10 are 2-digit, A11-A20 are 3-digit, confirmed against the
        # source image) -- swap digit_pattern for the back half of the sheet
        # without mutating the caller's config.
        effective_config = config
        if config.digit_pattern_second_half and question_number > config.question_count // 2:
            effective_config = _with_digit_pattern(config, config.digit_pattern_second_half)
        operands = generate_unique_operands(effective_config, q_rng, seen, question_number - 1)
        if not validate_question(effective_config, operands):
            raise ValueError(f"Generated invalid PM-L2 question for lesson {config.lesson_number} DPS {config.dps_number}")
        concept_trace = question_concept_trace(effective_config, operands)
        correct_answer = sum(operands)
        distractors = generate_distractors(correct_answer, operands, q_rng, config.allow_negative_answer)
        options = build_mcq_options(correct_answer, distractors, q_rng)
        questions.append({
            "question_number": question_number,
            "display_type": "VERTICAL",
            "operands": operands,
            "operators": ["+" if n >= 0 else "-" for n in operands],
            "correct_answer": correct_answer,
            "options": options,
            "seed": f"{config.seed}-Q{question_number}",
            "metadata": {
                "concept_family": config.concept_family,
                "operation_focus": config.operation_focus,
                "abacus_rule": config.abacus_rule,
                "target_numbers": config.target_numbers,
                "digit_pattern": effective_config.digit_pattern,
                "place_value": config.place_value,
                "lesson_title": config.lesson_title,
                "dps_title": config.dps_title,
                "practice_mode": config.practice_mode,
                "generation_template": config.generation_template,
                "revision_templates": list(config.revision_templates or []),
                "primary_concept_tag": concept_trace["primary_concept_tag"],
                "primary_concept_label": concept_trace["primary_concept_label"],
                "concept_tags": concept_trace["concept_tags"],
                "concept_labels": concept_trace["concept_labels"],
                "concept_validated": concept_trace["golden_step_validated"],
                "concept_trace": concept_trace["step_trace"],
                "difficulty_stage": question_difficulty_stage(question_number - 1),
                "difficulty_progression": "EASY_TO_CHALLENGE",
            },
        })
        seen.add(tuple(operands))
    return rebalance_correct_option_distribution(questions)


def _with_digit_pattern(config: PML2Config, digit_pattern: str) -> PML2Config:
    import dataclasses
    return dataclasses.replace(config, digit_pattern=digit_pattern)


def generate_pm_l2_concept_drill_set(specs: list[tuple[PML2ConceptDrillConfig, int]]) -> list[dict]:
    """Assembles one DPS's full concept-drill question set from an ordered
    list of (config, count) specs -- e.g. [(multiply_config, 2),
    (divide_config, 2)] for a lesson whose CONCEPT DRILL block pairs 2
    multiply-format questions with 2 divide-format questions (Lessons 10-12),
    or [(range_sum_config, 2)] for Lessons 1-2's range-sum-only block.
    Question numbering continues sequentially across all specs so the block
    reads as one coherent set, matching how the workbook lays SL 1, 2, 3...
    across the combined block.
    """
    questions: list[dict] = []
    question_number = 1
    for config, count in specs:
        for i in range(count):
            q_rng = random.Random(f"{config.seed}-Q{question_number}")
            question = generate_concept_drill_question(config, q_rng)
            question["question_number"] = question_number
            question["seed"] = f"{config.seed}-Q{question_number}"
            question_number += 1
            questions.append(question)
    return questions
