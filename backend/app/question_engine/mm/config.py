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


SUPPORTED_MM_PACKAGE_1_CONCEPTS = {
    "DECIMAL_ADD_LESS",
    "DECIMAL_MULTIPLICATION",
    "DECIMAL_DIVISION",
    "WHOLE_NUMBER_MULTIPLICATION",
    "WHOLE_NUMBER_DIVISION",
    "MULTIPLICATION_DIVISION_MIXED",
}


def NormaliseText(Value: str | None) -> str:
    return " ".join(str(Value or "").replace("×", " x ").replace("÷", " division ").replace("/", " ").replace("-", " ").lower().split())


def ClassifyMmConcept(DpsTitle: str, LessonTitle: str = "") -> str:
    TitleText = NormaliseText(DpsTitle)
    GenericTitleTokens = ("visual practice", "skill stacker", "concept drill")
    HasTitleSignal = any(Token in TitleText for Token in ("decimal", "multiplication", "division", " x ", "2d", "3d", "4d", "5d", "6d", "add less"))
    Text = NormaliseText(f"{DpsTitle} {LessonTitle}") if (not HasTitleSignal and any(Token in TitleText for Token in GenericTitleTokens)) else TitleText

    HasDecimal = "decimal" in Text
    HasAddLess = "add less" in Text or ("add" in Text and "less" in Text)
    HasMultiplication = "multiplication" in Text or " x " in f" {Text} " or "mixed pattern" in Text
    HasDivision = "division" in Text

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
    return ConceptFamily in SUPPORTED_MM_PACKAGE_1_CONCEPTS
