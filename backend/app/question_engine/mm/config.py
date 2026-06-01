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

SUPPORTED_MM_CONCEPTS = PACKAGE_1_CONCEPTS | PACKAGE_2_CONCEPTS

# Backward-compatible name used by the existing generation service.
SUPPORTED_MM_PACKAGE_1_CONCEPTS = SUPPORTED_MM_CONCEPTS


def NormaliseText(Value: str | None) -> str:
    return " ".join(
        str(Value or "")
        .replace("×", " x ")
        .replace("÷", " division ")
        .replace("/", " ")
        .replace("-", " ")
        .lower()
        .split()
    )


def ClassifyMmConcept(DpsTitle: str, LessonTitle: str = "") -> str:
    TitleText = NormaliseText(DpsTitle)
    GenericTitleTokens = ("visual practice", "skill stacker", "concept drill")
    HasTitleSignal = any(
        Token in TitleText
        for Token in (
            "decimal",
            "multiplication",
            "division",
            " x ",
            "2d",
            "3d",
            "4d",
            "5d",
            "6d",
            "add less",
            "integers",
            "integer",
            "bodmas",
            "percentage",
            "percent",
        )
    )
    Text = (
        NormaliseText(f"{DpsTitle} {LessonTitle}")
        if (not HasTitleSignal and any(Token in TitleText for Token in GenericTitleTokens))
        else TitleText
    )

    HasDecimal = "decimal" in Text
    HasAddLess = "add less" in Text or ("add" in Text and "less" in Text)
    HasMultiplication = "multiplication" in Text or " x " in f" {Text} " or "mixed pattern" in Text
    HasDivision = "division" in Text
    HasInteger = "integer" in Text or "integers" in Text
    HasBodmas = "bodmas" in Text
    HasPercentage = "percentage" in Text or "percent" in Text
    HasIncreaseDecrease = "increase" in Text or "decrease" in Text

    # Package 2 concepts should win when the DPS title explicitly names them.
    if HasInteger:
        return "INTEGERS"
    if HasBodmas:
        return "BODMAS"
    if HasPercentage and HasAddLess:
        return "PERCENTAGE_ADD_LESS"
    if HasPercentage and HasIncreaseDecrease:
        return "PERCENTAGE_INCREASE_DECREASE"
    if HasPercentage:
        return "PERCENTAGE_VALUE"

    if HasDecimal and HasAddLess:
        return "DECIMAL_ADD_LESS"
    if HasDecimal and HasMultiplication and HasDivision:
        return "MULTIPLICATION_DIVISION_MIXED"
    if HasDecimal and HasMultiplication:
        return "DECIMAL_MULTIPLICATION"
    if HasDecimal and HasDivision:
        return "DECIMAL_DIVISION"
    if HasMultiplication and HasDivision:
        return "MULTIPLICATION_DIVISION_MIXED"
    if HasMultiplication:
        return "WHOLE_NUMBER_MULTIPLICATION"
    if HasDivision:
        return "WHOLE_NUMBER_DIVISION"
    return "MM_UNSUPPORTED"


def IsPackage1Supported(ConceptFamily: str) -> bool:
    """Backward-compatible support check used by generation_service.

    The name remains intentionally unchanged so Package 2 can be introduced
    without touching stable routing code.
    """
    return ConceptFamily in SUPPORTED_MM_CONCEPTS


def IsMmConceptSupported(ConceptFamily: str) -> bool:
    return ConceptFamily in SUPPORTED_MM_CONCEPTS
