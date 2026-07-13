from dataclasses import dataclass, field
from typing import Any


@dataclass
class IMConfig:
    """Configuration for one Intermediate Module DPS/section question-generation call.

    Deliberately independent of app.question_engine.mm.config.MMConfig. Intermediate
    Module is its own module with its own identity in the MathPath curriculum
    hierarchy (Young Learners -> Preparatory -> Bridge -> Intermediate -> Master) --
    it is not a subset or variant of Master Module, so this engine does not import
    from, extend, or otherwise depend on the Master Module engine. A future change
    to Master Module's ranges/formulas/behavior must never be able to change how
    Intermediate Module generates questions, and vice versa.
    """

    ModuleCode: str
    LevelCode: str
    LessonNumber: int
    DpsNumber: int
    DpsTitle: str
    LessonTitle: str
    QuestionCount: int = 10
    Seed: str = "IM-SEED"
    ConceptFamily: str = "IM_UNSUPPORTED"
    OperationFocus: str = "MIXED"
    DigitPattern: str = "INTERMEDIATE_MODULE"
    Difficulty: str = "INTERMEDIATE"
    GeneratorConfig: dict[str, Any] = field(default_factory=dict)


# Every concept family that appears anywhere in the IM Level 4 workbook
# (LEVEL 8.xlsx, 12 lessons x 5 DPS, verified against every embedded answer-key
# formula and cross-checked against all 60 student-facing worksheet images).
SUPPORTED_IM_CONCEPTS = {
    "ADD_LESS",
    "DECIMAL_ADD_LESS",
    "WHOLE_NUMBER_MULTIPLICATION",
    "WHOLE_NUMBER_DIVISION",
    "SQUARES",
    "SKILL_STACKER",
    "CONCEPT_DRILL",
    "BODMAS",
    "SOLVE_EQUATION",
    "ANSWER_POSITION",
}


def OperationFocusForConcept(ConceptFamily: str) -> str:
    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS"}:
        return "ADD_LESS"
    if ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return "MULTIPLICATION"
    if ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return "DIVISION"
    if ConceptFamily == "SQUARES":
        return "POWERS"
    if ConceptFamily == "SKILL_STACKER":
        return "REPEATED_DOUBLING"
    if ConceptFamily == "CONCEPT_DRILL":
        return "REPEATED_SUBTRACTION"
    if ConceptFamily == "BODMAS":
        return "BODMAS"
    if ConceptFamily == "SOLVE_EQUATION":
        return "EQUATION"
    if ConceptFamily == "ANSWER_POSITION":
        return "ANSWER_POSITION"
    return "MIXED"


def IsImConceptSupported(ConceptFamily: str) -> bool:
    return ConceptFamily in SUPPORTED_IM_CONCEPTS
