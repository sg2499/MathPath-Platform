from dataclasses import dataclass, field
from typing import Any


@dataclass
class MMConfig:
    ModuleCode: str
    LevelCode: str
    LessonNumber: int
    DpsNumber: int
    DpsTitle: str
    LessonTitle: str
    QuestionCount: int = 20
    Seed: str = "MM-SEED"
    ConceptFamily: str = "MM_UNSUPPORTED"
    OperationFocus: str = "MIXED"
    DigitPattern: str = "MASTER_MODULE"
    Difficulty: str = "MASTER"
    GeneratorConfig: dict[str, Any] = field(default_factory=dict)


PACKAGE_1_CONCEPTS = {
    "ADD_LESS",
    "DECIMAL_ADD_LESS",
    "DECIMAL_MULTIPLICATION",
    "DECIMAL_DIVISION",
    "WHOLE_NUMBER_MULTIPLICATION",
    "WHOLE_NUMBER_DIVISION",
    "MULTIPLICATION_DIVISION_MIXED",
}

PACKAGE_2_CONCEPTS = {
    "INTEGERS",
    "BODMAS",
    "PERCENTAGE_ADD_LESS",
    "PERCENTAGE_VALUE",
    "PERCENTAGE_INCREASE_DECREASE",
}

PACKAGE_3_CONCEPTS = {
    "SQUARES",
    "CUBES",
    "SQUARE_ROOT",
    "CUBE_ROOT",
    "MIXED_SQUARE_CUBE",
    "MIXED_ROOTS",
}

PACKAGE_4_CONCEPTS = {
    "SIMPLE_INTEREST",
    "PROFIT_LOSS",
    "FIND_SELLING_PRICE",
    "FIND_COST_PRICE",
}

PACKAGE_5_CONCEPTS = {
    "SKILL_STACKER",
    "CONCEPT_DRILL",
    "ANSWER_POSITION",
    "SOLVE_EQUATION",
}

SUPPORTED_MM_CONCEPTS = PACKAGE_1_CONCEPTS | PACKAGE_2_CONCEPTS | PACKAGE_3_CONCEPTS | PACKAGE_4_CONCEPTS | PACKAGE_5_CONCEPTS

# Backward-compatible name used by the existing generation service.
SUPPORTED_MM_PACKAGE_1_CONCEPTS = SUPPORTED_MM_CONCEPTS


def OperationFocusForConcept(ConceptFamily: str) -> str:
    if ConceptFamily in {"DECIMAL_ADD_LESS", "ADD_LESS"}:
        return "ADD_LESS"
    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "WHOLE_NUMBER_MULTIPLICATION"}:
        return "MULTIPLICATION"
    if ConceptFamily in {"DECIMAL_DIVISION", "WHOLE_NUMBER_DIVISION"}:
        return "DIVISION"
    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        return "MULTIPLICATION_DIVISION"
    if ConceptFamily == "INTEGERS":
        return "INTEGER_ADD_LESS"
    if ConceptFamily == "BODMAS":
        return "BODMAS"
    if ConceptFamily in {"PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE"}:
        return "PERCENTAGE"
    if ConceptFamily in {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}:
        return "POWERS_ROOTS"
    if ConceptFamily in {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}:
        return "FINANCIAL"
    if ConceptFamily == "SKILL_STACKER":
        return "REPEATED_ADDITION"
    if ConceptFamily == "CONCEPT_DRILL":
        return "REPEATED_SUBTRACTION"
    if ConceptFamily == "ANSWER_POSITION":
        return "ANSWER_POSITION"
    if ConceptFamily == "SOLVE_EQUATION":
        return "EQUATION"
    return "MIXED"


def IsPackage1Supported(ConceptFamily: str) -> bool:
    """Backward-compatible support check used by generation_service.

    The name remains intentionally unchanged so Package 2 can be introduced
    without touching stable routing code.
    """
    return ConceptFamily in SUPPORTED_MM_CONCEPTS


def IsMmConceptSupported(ConceptFamily: str) -> bool:
    return ConceptFamily in SUPPORTED_MM_CONCEPTS
