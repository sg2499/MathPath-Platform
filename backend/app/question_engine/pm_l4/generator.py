import dataclasses
import random

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.pm_l4.config import (
    PML4Config,
    PML4ConceptDrillConfig,
    PML4MultiplyConfig,
    PML4DivideConfig,
    PML4DivideRemainderConfig,
    PML4BodmasConfig,
)
from app.question_engine.pm_l4.operands import generate_unique_operands, question_difficulty_stage
from app.question_engine.pm_l4.validators import question_concept_trace, validate_question
from app.question_engine.pm_l4.distractors import generate_distractors
from app.question_engine.pm_l4.concept_drill import generate_concept_drill_question
from app.question_engine.pm_l4.multiply import generate_multiply_table_question
from app.question_engine.pm_l4.divide import generate_divide_table_question
from app.question_engine.pm_l4.divide_remainder import generate_divide_remainder_question
from app.question_engine.pm_l4.bodmas import generate_bodmas_question


def generate_pm_l4_question_set(config: PML4Config) -> list[dict]:
    """PM-L4's own, fully independent vertical Add/Less question generator.
    Zero imports from question_engine/pm, pm_l2, pm_l3, or any other
    module's engine -- see this package's __init__.py docstring.
    """
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    for question_number in range(1, config.question_count + 1):
        q_rng = random.Random(f"{config.seed}-Q{question_number}")
        question_index = question_number - 1
        effective_digit_pattern = (
            config.digit_pattern_second_half
            if config.digit_pattern_second_half and question_index >= config.question_count // 2
            else config.digit_pattern
        )
        effective_rows = (
            config.rows_second_half
            if config.rows_second_half and question_index >= config.question_count // 2
            else config.rows
        )
        operands = generate_unique_operands(config, q_rng, seen)
        effective_config = dataclasses.replace(config, digit_pattern=effective_digit_pattern, rows=effective_rows)
        if not validate_question(effective_config, operands):
            raise ValueError(f"Generated invalid PM-L4 question for lesson {config.lesson_number} DPS {config.dps_number}")
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
                "digit_pattern": effective_digit_pattern,
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
                "difficulty_stage": question_difficulty_stage(question_index),
                "difficulty_progression": "EASY_TO_CHALLENGE",
            },
        })
        seen.add(tuple(operands))
    return rebalance_correct_option_distribution(questions)


def generate_pm_l4_multiply_set(config: PML4MultiplyConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_multiply_table_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_pm_l4_divide_set(config: PML4DivideConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_divide_table_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_pm_l4_divide_remainder_set(config: PML4DivideRemainderConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_divide_remainder_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_pm_l4_bodmas_set(config: PML4BodmasConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_bodmas_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_pm_l4_concept_drill_set(specs: list[tuple[PML4ConceptDrillConfig, int]]) -> list[dict]:
    """Assembles one DPS's Concept Drill sub-block from an ordered list of
    (config, count) specs, e.g. [(multiply_config, 1), (divide_config, 1)]
    -- same sequential-numbering convention PM-L2/PM-L3's equivalent uses.
    """
    questions: list[dict] = []
    question_number = 1
    for config, count in specs:
        for _ in range(count):
            q_rng = random.Random(f"{config.seed}-Q{question_number}")
            question = generate_concept_drill_question(config, q_rng)
            question["question_number"] = question_number
            question["seed"] = f"{config.seed}-Q{question_number}"
            question_number += 1
            questions.append(question)
    return questions
