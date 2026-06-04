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
}

SUPPORTED_MM_CONCEPTS = PACKAGE_1_CONCEPTS | PACKAGE_2_CONCEPTS | PACKAGE_3_CONCEPTS | PACKAGE_4_CONCEPTS | PACKAGE_5_CONCEPTS

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


def ResolveMmConceptAlias(ConceptText: str | None, FallbackTitle: str = "", LessonTitle: str = "") -> str:
    """Resolve live/stale MM concept aliases without changing seed/section maps.

    This is intentionally narrow: it only maps unsupported or alternate wording
    to existing generator families so preview generation does not crash. It does
    not rename DPS records, split sections, or alter renderer behavior.
    """
    Text = NormaliseText(" ".join([str(ConceptText or ""), str(FallbackTitle or ""), str(LessonTitle or "")]))

    if not Text:
        return "MM_UNSUPPORTED"

    # Borrowing is an Add/Less vertical-stack family, including titles such as
    # "Borrowing Sums with Positive, Negative Answers" from older live data.
    if "borrowing" in Text:
        return "ADD_LESS"

    # Position/placement wording is treated as decimal multiplication answer-position
    # practice unless a more explicit concept family exists later. The frontend
    # renderer already protects these titles with ANSWER_POSITION display mode.
    if (
        "answer position" in Text
        or "answer placement" in Text
        or "find position" in Text
        or "given position" in Text
        or "number position" in Text
        or "natural number position" in Text
        or "first natural number" in Text
        or "write the number" in Text
        or "write number" in Text
    ):
        return "DECIMAL_MULTIPLICATION"

    # Equation aliases route to the existing expression-workbook family.
    if "solve equation" in Text or "equation solving" in Text or "equation practice" in Text:
        return "BODMAS"

    return ClassifyMmConcept(ConceptText or FallbackTitle, LessonTitle)


def ClassifyMmConcept(DpsTitle: str, LessonTitle: str = "") -> str:
    TitleText = NormaliseText(DpsTitle)

    # Runtime alias protection for live/stale MM titles. These aliases only
    # classify to existing generator families and do not affect seed structure.
    if "borrowing" in TitleText:
        return "ADD_LESS"
    if (
        "answer position" in TitleText
        or "answer placement" in TitleText
        or "find position" in TitleText
        or "given position" in TitleText
        or "number position" in TitleText
        or "natural number position" in TitleText
        or "first natural number" in TitleText
        or "write the number" in TitleText
        or "write number" in TitleText
    ):
        return "DECIMAL_MULTIPLICATION"
    if "solve equation" in TitleText or "equation solving" in TitleText or "equation practice" in TitleText:
        return "BODMAS"

    # Dedicated Package 5 section titles must not inherit broader lesson-title words.
    if "concept drill" in TitleText:
        return "CONCEPT_DRILL"
    if "skill stacker" in TitleText:
        return "SKILL_STACKER"

    # A plain MM "Visual Practice" sheet is an Add/Less visual stack sheet.
    # Do not inherit BODMAS/multiplication words from the lesson title for this case.
    if TitleText in {"visual practice", "add less visual", "visual add less"}:
        return "ADD_LESS"

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
            "simple interest",
            "profit",
            "loss",
            "selling price",
            "cost price",
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
    HasSquareRoot = "square root" in Text
    HasCubeRoot = "cube root" in Text
    HasSquares = "square" in Text or "squares" in Text
    HasCubes = "cube" in Text or "cubes" in Text
    HasSkillStacker = "skill stacker" in Text
    HasConceptDrill = "concept drill" in Text
    HasSimpleInterest = "simple interest" in Text
    HasProfit = "profit" in Text
    HasLoss = "loss" in Text
    HasSellingPrice = "selling price" in Text
    HasCostPrice = "cost price" in Text

    # Package 5 dedicated MM concepts should win before inherited generic lesson-title signals.
    if HasSkillStacker:
        return "SKILL_STACKER"
    if HasConceptDrill:
        return "CONCEPT_DRILL"

    # Package 4 financial concepts should win before generic percentage words.
    if HasSimpleInterest:
        return "SIMPLE_INTEREST"
    if HasSellingPrice and (HasProfit or HasLoss):
        return "FIND_SELLING_PRICE"
    if HasCostPrice and (HasProfit or HasLoss):
        return "FIND_COST_PRICE"
    if HasSellingPrice:
        return "FIND_SELLING_PRICE"
    if HasCostPrice:
        return "FIND_COST_PRICE"
    if HasProfit or HasLoss:
        return "PROFIT_LOSS"

    # Package 3 root concepts should win before generic square/cube words.
    if HasSquareRoot and HasCubeRoot:
        return "MIXED_ROOTS"
    if HasSquareRoot:
        return "SQUARE_ROOT"
    if HasCubeRoot and HasSquares:
        return "MIXED_ROOTS"
    if HasCubeRoot:
        return "CUBE_ROOT"
    if HasSquares and HasCubes:
        return "MIXED_SQUARE_CUBE"
    if HasSquares:
        return "SQUARES"
    if HasCubes:
        return "CUBES"

    # Package 2 concepts should win when the DPS title explicitly names them.
    if HasInteger:
        return "INTEGERS"
    if HasBodmas:
        return "BODMAS"
    # MathPath MM percentage convention: percentage calculation sheets such as
    # "25% of 800" are intentionally disabled until explicitly requested.
    # Any Add/Less/Percentage section must render as workbook-style
    # base + percent% or base - percent%, including single-section
    # "Add Percentage" and "Less Percentage" titles.
    if HasPercentage and (HasAddLess or "add" in Text or "less" in Text):
        return "PERCENTAGE_ADD_LESS"
    if HasPercentage and HasIncreaseDecrease:
        return "PERCENTAGE_INCREASE_DECREASE"
    if HasPercentage:
        return "PERCENTAGE_ADD_LESS"

    if HasDecimal and HasAddLess:
        return "DECIMAL_ADD_LESS"
    if HasAddLess:
        return "ADD_LESS"
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


SECTION_CONCEPT_ALIASES = {
    "ADD_LESS": "ADD_LESS",
    "DECIMAL_ADD_LESS": "DECIMAL_ADD_LESS",
    "DECIMAL MULTIPLICATION": "DECIMAL_MULTIPLICATION",
    "DECIMAL DIVISION": "DECIMAL_DIVISION",
    "WHOLE MULTIPLICATION": "WHOLE_NUMBER_MULTIPLICATION",
    "WHOLE DIVISION": "WHOLE_NUMBER_DIVISION",
    "MIXED MULTIPLICATION DIVISION": "MULTIPLICATION_DIVISION_MIXED",
    "INTEGERS": "INTEGERS",
    "BODMAS": "BODMAS",
    "PERCENTAGE_ADD_LESS": "PERCENTAGE_ADD_LESS",
    "SQUARES": "SQUARES",
    "CUBES": "CUBES",
    "SQUARE_ROOT": "SQUARE_ROOT",
    "CUBE_ROOT": "CUBE_ROOT",
    "MIXED_SQUARE_CUBE": "MIXED_SQUARE_CUBE",
    "MIXED_ROOTS": "MIXED_ROOTS",
    "SIMPLE_INTEREST": "SIMPLE_INTEREST",
    "PROFIT_LOSS": "PROFIT_LOSS",
    "FIND_SELLING_PRICE": "FIND_SELLING_PRICE",
    "FIND_COST_PRICE": "FIND_COST_PRICE",
    "SKILL_STACKER": "SKILL_STACKER",
    "CONCEPT_DRILL": "CONCEPT_DRILL",
    "BORROWING SUMS": "ADD_LESS",
    "BORROWING SUMS WITH NEGATIVE ANSWERS": "ADD_LESS",
    "BORROWING SUMS WITH POSITIVE NEGATIVE ANSWERS": "ADD_LESS",
    "BORROWING SUMS WITH POSITIVE AND NEGATIVE ANSWERS": "ADD_LESS",
    "NUMBER POSITION": "DECIMAL_MULTIPLICATION",
    "NATURAL NUMBER POSITION": "DECIMAL_MULTIPLICATION",
    "FIRST NATURAL NUMBER POSITION": "DECIMAL_MULTIPLICATION",
    "FIND POSITION": "DECIMAL_MULTIPLICATION",
    "ANSWER POSITION": "DECIMAL_MULTIPLICATION",
    "ANSWER PLACEMENT": "DECIMAL_MULTIPLICATION",
    "GIVEN POSITION": "DECIMAL_MULTIPLICATION",
    "WRITE NUMBER FROM GIVEN POSITION": "DECIMAL_MULTIPLICATION",
    "WRITE THE NUMBER FROM THE GIVEN POSITION": "DECIMAL_MULTIPLICATION",
    "SOLVE EQUATION": "BODMAS",
    "EQUATION SOLVING": "BODMAS",
    "EQUATION PRACTICE": "BODMAS",
}


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
    return "MIXED"


def IsPackage1Supported(ConceptFamily: str) -> bool:
    """Backward-compatible support check used by generation_service.

    The name remains intentionally unchanged so Package 2 can be introduced
    without touching stable routing code.
    """
    return ConceptFamily in SUPPORTED_MM_CONCEPTS


def IsMmConceptSupported(ConceptFamily: str) -> bool:
    return ConceptFamily in SUPPORTED_MM_CONCEPTS
