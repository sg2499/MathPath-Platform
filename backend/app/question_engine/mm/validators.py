from decimal import Decimal
import re

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "×%", "% of", "%"}
PACKAGE_4_FINANCIAL_CONCEPTS = {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}
PACKAGE_5_SPECIAL_CONCEPTS = {"SKILL_STACKER", "CONCEPT_DRILL", "ANSWER_POSITION", "SOLVE_EQUATION"}
PACKAGE_3_COMPACT_CONCEPTS = {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}
DECIMAL_MULTIPLICATION_PATTERNS = {(1, 1), (2, 1), (3, 1), (4, 1), (2, 2), (3, 2), (4, 2), (3, 3)}
DECIMAL_DIVISION_PATTERNS = {(2, 1), (3, 1), (4, 1), (5, 1), (3, 2), (4, 2), (5, 2), (6, 2), (4, 3), (5, 3), (6, 3)}



def _SquareRootTitleText(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle or ''} {Config.LessonTitle or ''} "
        .lower()
        .replace("-", " ")
        .replace("_", " ")
        .replace("&", " and ")
        .split()
    )


def _SquareRootRadicandDigitTargets(Config: MMConfig) -> list[int] | None:
    Text = _SquareRootTitleText(Config)
    if "square root" not in Text:
        return None

    RangeMatch = re.search(r"\b([3-6])\s*(?:and|to|/)\s*([3-6])\s*digit", Text)
    if RangeMatch:
        Start = int(RangeMatch.group(1))
        End = int(RangeMatch.group(2))
        Lower, Upper = sorted((Start, End))
        return list(range(Lower, Upper + 1))

    DigitMatches = []
    for Match in re.finditer(r"\b([3-6])\s*digit", Text):
        DigitValue = int(Match.group(1))
        if DigitValue not in DigitMatches:
            DigitMatches.append(DigitValue)
    if len(DigitMatches) >= 2:
        return DigitMatches

    SingleMatch = re.search(r"\b([3-6])\s*digit", Text)
    if SingleMatch:
        return [int(SingleMatch.group(1))]

    return None


def _CubeRootRadicandDigitTargets(Config: MMConfig) -> list[int] | None:
    Text = _SquareRootTitleText(Config)
    if "cube root" not in Text:
        return None
    if "mixed" in Text:
        return None

    RangeMatch = re.search(r"\b([3-6])\s*(?:and|to|/)\s*([3-6])\s*digit", Text)
    if RangeMatch:
        Start = int(RangeMatch.group(1))
        End = int(RangeMatch.group(2))
        Lower, Upper = sorted((Start, End))
        return list(range(Lower, Upper + 1))

    DigitMatches = []
    for Match in re.finditer(r"\b([3-6])\s*digit", Text):
        DigitValue = int(Match.group(1))
        if DigitValue not in DigitMatches:
            DigitMatches.append(DigitValue)
    if DigitMatches:
        return DigitMatches

    return None

def _IsNumeric(Value: object) -> bool:
    try:
        Decimal(str(Value))
        return True
    except Exception:
        return False


def _DecimalValue(Value: object) -> Decimal:
    return Decimal(str(Value))


def _IsWholeNumber(Value: object) -> bool:
    try:
        DecimalValue = _DecimalValue(Value)
        return DecimalValue == DecimalValue.to_integral_value()
    except Exception:
        return False


def _HasDecimalOperand(Operands: list[int | float | str]) -> bool:
    return any(_IsNumeric(Value) and not _IsWholeNumber(Value) for Value in Operands)


def _HasVisibleDecimalOperand(Operands: list[int | float | str]) -> bool:
    return any(_IsNumeric(Value) and "." in str(Value) for Value in Operands)


def _DigitCount(Value: object) -> int | None:
    if not _IsNumeric(Value) or not _IsWholeNumber(Value):
        return None
    IntegerValue = abs(int(_DecimalValue(Value)))
    return len(str(IntegerValue)) if IntegerValue != 0 else 1


def _NumericDigitCount(Value: object) -> int:
    if not _IsNumeric(Value):
        return 0
    return len("".join(Character for Character in format(_DecimalValue(Value), "f") if Character.isdigit()))


def _DecimalRemovalIntegerAndPlaces(Value: object) -> tuple[int, int] | None:
    if not _IsNumeric(Value):
        return None
    Text = str(Value).strip()
    if Text.startswith("+"):
        Text = Text[1:]
    Negative = Text.startswith("-")
    if Negative:
        Text = Text[1:]
    if "E" in Text.upper():
        Text = format(Decimal(str(Value)), "f")
        if Text.startswith("-"):
            Negative = True
            Text = Text[1:]
    DecimalPlaces = len(Text.split(".", 1)[1]) if "." in Text else 0
    DigitsOnly = Text.replace(".", "").lstrip("0") or "0"
    IntegerValue = int(DigitsOnly)
    if Negative:
        IntegerValue = -IntegerValue
    return IntegerValue, DecimalPlaces


def _DigitCountAfterDecimalRemoval(Value: object) -> int | None:
    Parsed = _DecimalRemovalIntegerAndPlaces(Value)
    if Parsed is None:
        return None
    IntegerValue, _Places = Parsed
    return len(str(abs(IntegerValue))) if IntegerValue != 0 else 1


def _CanonicalMultiplicationPattern(LeftDigits: int | None, RightDigits: int | None) -> tuple[int, int] | None:
    if LeftDigits is None or RightDigits is None:
        return None
    return (max(LeftDigits, RightDigits), min(LeftDigits, RightDigits))


def _NormalisedPatternTitle(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle} {Config.LessonTitle} "
        .upper()
        .replace("×", " X ")
        .replace("*", " X ")
        .replace("÷", " DIVISION ")
        .replace("/", " DIVISION ")
        .replace(":", " DIVISION ")
        .replace("-", " ")
        .split()
    )


def _ExtractMultiplicationDigits(Config: MMConfig) -> tuple[int, int] | None:
    Title = _NormalisedPatternTitle(Config)
    for Pattern in [r"([1-6])D\s*X\s*([1-6])D", r"([1-6])D\s*MULTIPLICATION\s*(?:BY\s*)?([1-6])D"]:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    return None


def _ExtractDivisionDigits(Config: MMConfig) -> tuple[int, int] | None:
    Title = _NormalisedPatternTitle(Config)
    for Pattern in [
        r"([1-6])D\s*DIVISION\s*([1-6])D",
        r"([1-6])D\s*DIVIDE\s*([1-6])D",
        r"([1-6])D\s*DIVIDED\s*BY\s*([1-6])D",
    ]:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    if "DIVISION BY 6D" in Title:
        return 6, 3
    if "DIVISION BY 3D" in Title:
        return 4, 3
    return None


def _ValidateWholeMultiplicationPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str]) -> bool:
    if len(Operands) != 2 or Operators != ["", "×"]:
        return False
    if _HasDecimalOperand(Operands):
        return False
    ExpectedDigits = _ExtractMultiplicationDigits(Config)
    if ExpectedDigits is None:
        return True
    return (_DigitCount(Operands[0]), _DigitCount(Operands[1])) == ExpectedDigits


def _ValidateWholeDivisionPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str]) -> bool:
    if len(Operands) != 2 or Operators != ["", "÷"]:
        return False
    if _HasDecimalOperand(Operands):
        return False
    ExpectedDigits = _ExtractDivisionDigits(Config)
    if ExpectedDigits is None:
        return True
    return (_DigitCount(Operands[0]), _DigitCount(Operands[1])) == ExpectedDigits


def _ValidateDecimalOperation(Operands: list[int | float | str], Operators: list[str], ExpectedOperator: str) -> bool:
    if len(Operands) != 2 or Operators != ["", ExpectedOperator]:
        return False
    return _HasDecimalOperand(Operands)


def _ValidateDecimalMultiplicationPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["", "×"]:
        return False
    if not _HasVisibleDecimalOperand(Operands):
        return False

    LeftParsed = _DecimalRemovalIntegerAndPlaces(Operands[0])
    RightParsed = _DecimalRemovalIntegerAndPlaces(Operands[1])
    if LeftParsed is None or RightParsed is None:
        return False

    LeftWhole, LeftPlaces = LeftParsed
    RightWhole, RightPlaces = RightParsed
    if LeftWhole <= 0 or RightWhole <= 0:
        return False

    Pattern = _CanonicalMultiplicationPattern(
        _DigitCountAfterDecimalRemoval(Operands[0]),
        _DigitCountAfterDecimalRemoval(Operands[1]),
    )
    if Pattern not in DECIMAL_MULTIPLICATION_PATTERNS:
        return False

    ExpectedDigits = _ExtractMultiplicationDigits(Config)
    if ExpectedDigits is not None:
        ExpectedPattern = _CanonicalMultiplicationPattern(*ExpectedDigits)
        if ExpectedPattern in DECIMAL_MULTIPLICATION_PATTERNS and Pattern != ExpectedPattern:
            return False

    WholeProduct = LeftWhole * RightWhole
    if WholeProduct >= 1000000:
        return False

    TotalDecimalPlaces = LeftPlaces + RightPlaces
    ExpectedAnswer = Decimal(WholeProduct) / (Decimal(10) ** TotalDecimalPlaces)
    QuantizeUnit = Decimal("1") if TotalDecimalPlaces <= 0 else Decimal("1").scaleb(-TotalDecimalPlaces)
    return CorrectAnswer.quantize(QuantizeUnit) == ExpectedAnswer.quantize(QuantizeUnit)


def _ValidateDecimalDivisionPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["", "÷"]:
        return False
    if not _HasVisibleDecimalOperand(Operands):
        return False

    DividendParsed = _DecimalRemovalIntegerAndPlaces(Operands[0])
    DivisorParsed = _DecimalRemovalIntegerAndPlaces(Operands[1])
    if DividendParsed is None or DivisorParsed is None:
        return False

    DividendWhole, DividendPlaces = DividendParsed
    DivisorWhole, DivisorPlaces = DivisorParsed
    if DividendWhole <= 0 or DivisorWhole <= 0:
        return False

    Pattern = (
        _DigitCountAfterDecimalRemoval(Operands[0]),
        _DigitCountAfterDecimalRemoval(Operands[1]),
    )
    if Pattern not in DECIMAL_DIVISION_PATTERNS:
        return False

    ExpectedDigits = _ExtractDivisionDigits(Config)
    if ExpectedDigits is not None and ExpectedDigits in DECIMAL_DIVISION_PATTERNS and Pattern != ExpectedDigits:
        return False

    ExpectedAnswer = (
        Decimal(DividendWhole)
        * (Decimal(10) ** DivisorPlaces)
        / (Decimal(DivisorWhole) * (Decimal(10) ** DividendPlaces))
    )
    AnswerPlaces = max(0, DividendPlaces - DivisorPlaces)
    QuantizeUnit = Decimal("1") if AnswerPlaces <= 0 else Decimal("1").scaleb(-AnswerPlaces)
    return CorrectAnswer.quantize(QuantizeUnit) == ExpectedAnswer.quantize(QuantizeUnit)


def _ValidatePercentageAddLess(Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators[0] != "":
        return False
    if Operators[1] not in {"×%", "-%"}:
        return False
    try:
        Base = Decimal(str(Operands[0]))
        Percent = Decimal(str(Operands[1]))
    except Exception:
        return False
    if Base < 0 or Percent < 0:
        return False
    if Operators[1] == "×%" and _NumericDigitCount(Base) > 6:
        return False
    if Operators[1] == "-%" and (Base != Base.to_integral_value() or Percent != Percent.to_integral_value()):
        return False
    PercentValue = Base * Percent / Decimal(100)
    ExpectedAnswer = PercentValue if Operators[1] == "×%" else Base - PercentValue
    ExpectedAnswer = ExpectedAnswer.quantize(Decimal("0.01"))
    return Decimal(0) <= CorrectAnswer <= Decimal("100000") and CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer


def _BorrowingAnswerMode(Config: MMConfig) -> str:
    Title = " ".join(
        f" {Config.DpsTitle} {Config.LessonTitle} "
        .upper()
        .replace(",", " ")
        .replace("-", " ")
        .split()
    )
    if "BORROWING" not in Title:
        return "STANDARD"
    HasPositive = "POSITIVE" in Title
    HasNegative = "NEGATIVE" in Title
    if HasPositive and HasNegative:
        return "MIXED_POSITIVE_NEGATIVE"
    if HasNegative:
        return "NEGATIVE_ONLY"
    return "BORROWING_STANDARD"




def _AddLessTitleText(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle} "
        .lower()
        .replace("-", " ")
        .replace("_", " ")
        .split()
    )


def _IsMixedDigitAddLessConcept(Config: MMConfig) -> bool:
    Text = _AddLessTitleText(Config)
    return "mixed digit" in Text and "add less" in Text


def _IsFastVisualisationConcept(Config: MMConfig) -> bool:
    Text = _AddLessTitleText(Config)
    return "fast visualisation" in Text or "fast visualization" in Text


def _IsMmAddLessVisualConcept(Config: MMConfig) -> bool:
    Text = _AddLessTitleText(Config)
    return (
        "add less" in Text
        and "visual" in Text
        and "decimal" not in Text
        and "borrowing" not in Text
        and not _IsFastVisualisationConcept(Config)
    )


def _ExplicitAddLessDigitCount(Config: MMConfig) -> int | None:
    Text = _AddLessTitleText(Config)
    Match = re.search(r"\b([2-6])\s*digit(?:\s+number)?\s+add\s+less\b", Text)
    if Match:
        return int(Match.group(1))
    return None


def _ValidateMixedDigitAddLessDigits(Config: MMConfig, Operands: list[int | float | str]) -> bool:
    if not _IsMixedDigitAddLessConcept(Config):
        return True
    for Value in Operands:
        DecimalValue = abs(_DecimalValue(Value))
        if DecimalValue != DecimalValue.to_integral_value():
            return False
        if not (Decimal(10) <= DecimalValue <= Decimal(9999)):
            return False
    return True


def _ValidateExplicitAddLessDigits(Config: MMConfig, Operands: list[int | float | str]) -> bool:
    if _IsMmAddLessVisualConcept(Config):
        return True
    Digits = _ExplicitAddLessDigitCount(Config)
    if Digits is None:
        return True
    Minimum, Maximum = (10 ** (Digits - 1), (10 ** Digits) - 1)
    for Value in Operands:
        DecimalValue = abs(_DecimalValue(Value))
        if DecimalValue != DecimalValue.to_integral_value():
            return False
        if not (Decimal(Minimum) <= DecimalValue <= Decimal(Maximum)):
            return False
    return True


def _ValidateMmAddLessVisual(Config: MMConfig, Operands: list[int | float | str]) -> bool:
    if not _IsMmAddLessVisualConcept(Config):
        return True
    if len(Operands) > 5:
        return False
    for Value in Operands:
        DecimalValue = abs(_DecimalValue(Value))
        if DecimalValue != DecimalValue.to_integral_value():
            return False
        if not (Decimal(100) <= DecimalValue <= Decimal(9999)):
            return False
    return True


def _ValidateAddLessQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) < 2 or len(Operands) != len(Operators) or Operators[0] != "":
        return False
    if any(Operator not in {"", "+", "-"} for Operator in Operators):
        return False
    if any(not _IsNumeric(Value) for Value in Operands):
        return False
    if not _ValidateExplicitAddLessDigits(Config, Operands):
        return False
    if not _ValidateMixedDigitAddLessDigits(Config, Operands):
        return False
    if not _ValidateMmAddLessVisual(Config, Operands):
        return False

    ExpectedAnswer = sum(Decimal(str(Value)) for Value in Operands)
    if CorrectAnswer != ExpectedAnswer:
        return False

    Mode = _BorrowingAnswerMode(Config)
    HasPositiveRow = any(Decimal(str(Value)) > 0 for Value in Operands)
    HasNegativeRow = any(Decimal(str(Value)) < 0 for Value in Operands)

    if Mode == "NEGATIVE_ONLY":
        if not (HasPositiveRow and HasNegativeRow and CorrectAnswer < 0):
            return False
        for Value in Operands:
            Magnitude = abs(_DecimalValue(Value))
            if Magnitude != Magnitude.to_integral_value() or Magnitude < Decimal(1000) or Magnitude > Decimal(99999):
                return False
        return True

    if Mode == "MIXED_POSITIVE_NEGATIVE":
        return HasPositiveRow and HasNegativeRow

    return CorrectAnswer >= 0


def _ValidatePackage3Compact(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 1 or len(Operators) != 1 or Operators[0] != "":
        return False
    Text = str(Operands[0])
    if Config.ConceptFamily == "SQUARES":
        return "²" in Text and "√" not in Text and CorrectAnswer >= 0
    if Config.ConceptFamily == "CUBES":
        return "³" in Text and "∛" not in Text and CorrectAnswer >= 0
    if Config.ConceptFamily == "SQUARE_ROOT":
        if not Text.startswith("√") or CorrectAnswer < 0:
            return False
        RadicandText = Text.replace("√", "", 1).strip()
        if not RadicandText.isdigit():
            return False
        TargetDigits = _SquareRootRadicandDigitTargets(Config)
        if TargetDigits and len(RadicandText) not in set(TargetDigits):
            return False
        return True
    if Config.ConceptFamily == "CUBE_ROOT":
        if not Text.startswith("∛") or CorrectAnswer < 0:
            return False
        RadicandText = Text.replace("∛", "", 1).strip()
        if not RadicandText.isdigit():
            return False
        TargetDigits = _CubeRootRadicandDigitTargets(Config)
        if len(RadicandText) > 6:
            return False
        if TargetDigits and len(RadicandText) not in set(Target for Target in TargetDigits if Target <= 6):
            return False
        return True
    if Config.ConceptFamily == "MIXED_SQUARE_CUBE":
        return ("²" in Text or "³" in Text) and CorrectAnswer >= 0
    if Config.ConceptFamily == "MIXED_ROOTS":
        # Some workbook sheets combine cubes, squares, and cube-root sections under
        # one compact mixed title. Accept all compact power/root forms so preview
        # generation never fails for those mapped sheets.
        if Text.startswith("∛"):
            RadicandText = Text.replace("∛", "", 1).strip()
            if not RadicandText.isdigit() or len(RadicandText) > 6:
                return False
        return (Text.startswith("√") or Text.startswith("∛") or "²" in Text or "³" in Text) and CorrectAnswer >= 0
    return False


def _ValidateFinancialQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    MoneyCap = Decimal("50000")
    if Config.ConceptFamily == "SIMPLE_INTEREST":
        if len(Operands) != 3 or Operators != ["Principal", "Term (Years)", "Rate of Interest"]:
            return False
        Principal, Term, Rate = [_DecimalValue(Value) for Value in Operands]
        if Principal <= 0 or Principal > Decimal("99999") or Term <= 0 or Term > Decimal("5") or Rate < Decimal("1") or Rate > Decimal("9"):
            return False
        if Principal != Principal.to_integral_value() or Term != Term.to_integral_value() or Rate != Rate.to_integral_value():
            return False
        ExpectedAnswer = (Principal * Term * Rate / Decimal(100)).quantize(Decimal("0.01"))
        return CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer

    if Config.ConceptFamily == "PROFIT_LOSS":
        if len(Operands) != 2 or Operators != ["Cost Price", "Selling Price"]:
            return False
        CostPrice, SellingPrice = [_DecimalValue(Value) for Value in Operands]
        if CostPrice <= 0 or SellingPrice <= 0 or CostPrice > MoneyCap or SellingPrice > MoneyCap or CostPrice == SellingPrice or CorrectAnswer < 0:
            return False
        Difference = abs(SellingPrice - CostPrice).quantize(Decimal("0.01"))
        Percentage = (Difference / CostPrice * Decimal(100)).quantize(Decimal("0.01"))
        Answer = CorrectAnswer.quantize(Decimal("0.01"))
        return Answer in {Difference, Percentage}

    if Config.ConceptFamily == "FIND_SELLING_PRICE":
        if len(Operands) != 2 or Operators[0] != "Cost Price" or Operators[1] not in {"Profit %", "Loss %"}:
            return False
        CostPrice, Percent = [_DecimalValue(Value) for Value in Operands]
        ExpectedAnswer = CostPrice + (CostPrice * Percent / Decimal(100)) if Operators[1] == "Profit %" else CostPrice - (CostPrice * Percent / Decimal(100))
        return CostPrice > 0 and CostPrice <= MoneyCap and Decimal(0) < Percent < Decimal(100) and CorrectAnswer <= MoneyCap and CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer.quantize(Decimal("0.01"))

    if Config.ConceptFamily == "FIND_COST_PRICE":
        if len(Operands) != 2 or Operators[0] != "Selling Price" or Operators[1] not in {"Profit %", "Loss %"}:
            return False
        SellingPrice, Percent = [_DecimalValue(Value) for Value in Operands]
        if SellingPrice <= 0 or SellingPrice > MoneyCap or not (Decimal(0) < Percent < Decimal(100)):
            return False
        if Operators[1] == "Profit %":
            ExpectedAnswer = SellingPrice / (Decimal(1) + (Percent / Decimal(100)))
        else:
            ExpectedAnswer = SellingPrice / (Decimal(1) - (Percent / Decimal(100)))
        return ExpectedAnswer <= MoneyCap and abs(CorrectAnswer - ExpectedAnswer) < Decimal("0.02")

    return False


def _ValidatePackage5Special(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if Config.ConceptFamily == "SKILL_STACKER":
        if len(Operands) != 2 or Operators != ["Add", "Times"]:
            return False
        AddValue, Times = [_DecimalValue(Value) for Value in Operands]
        if AddValue != AddValue.to_integral_value() or Times != Times.to_integral_value():
            return False
        if AddValue < 10 or AddValue > 50 or Times < 8 or Times > 12:
            return False
        ExpectedAnswer = AddValue * (Decimal(2) ** (int(Times) - 1))
        return CorrectAnswer == ExpectedAnswer

    if Config.ConceptFamily == "CONCEPT_DRILL":
        if len(Operands) != 2 or Operators != ["From", "Less"]:
            return False
        FromValue, LessValue = [_DecimalValue(Value) for Value in Operands]
        if FromValue != FromValue.to_integral_value() or LessValue != LessValue.to_integral_value():
            return False
        if FromValue < 1000 or FromValue > 99999 or LessValue <= 0:
            return False
        ExpectedAnswer = FromValue - (LessValue * Decimal(10))
        if ExpectedAnswer <= 0:
            return False
        return CorrectAnswer == ExpectedAnswer

    if Config.ConceptFamily == "ANSWER_POSITION":
        if len(Operands) == 1 and Operators == ["Number"]:
            try:
                NumberText = str(Operands[0]).strip().replace(",", "")
                IntegerPart, _, DecimalPart = NumberText.partition(".")
                IntegerDigits = IntegerPart.lstrip("+-") or "0"
                if any(Char != "0" for Char in IntegerDigits):
                    ExpectedAnswer = Decimal(len(IntegerDigits.lstrip("0")))
                else:
                    LeadingDecimalZeros = 0
                    ExpectedAnswer = Decimal(0)
                    for Char in DecimalPart:
                        if Char == "0":
                            LeadingDecimalZeros += 1
                            continue
                        if Char.isdigit():
                            ExpectedAnswer = Decimal(-LeadingDecimalZeros)
                            break
                return CorrectAnswer == ExpectedAnswer
            except Exception:
                return False
        if len(Operands) == 2 and Operators == ["", "×"]:
            try:
                def _Position(Value: int | float | str | Decimal) -> Decimal:
                    TextValue = str(Value).strip().replace(",", "")
                    if TextValue.startswith("+") or TextValue.startswith("-"):
                        TextValue = TextValue[1:]
                    IntegerPart, _, DecimalPart = TextValue.partition(".")
                    IntegerDigits = (IntegerPart or "0").lstrip("0")
                    if IntegerDigits:
                        return Decimal(len(IntegerDigits))
                    for Index, Character in enumerate(DecimalPart):
                        if Character.isdigit() and Character != "0":
                            return Decimal(-Index)
                    return Decimal(0)

                def _UnderlyingDigitCount(Value: int | float | str | Decimal) -> int:
                    TextValue = str(Value).strip().replace(",", "")
                    DigitsOnly = "".join(Character for Character in TextValue if Character.isdigit())
                    NormalizedDigits = DigitsOnly.lstrip("0")
                    return len(NormalizedDigits or "0")

                LeftDigits = _UnderlyingDigitCount(Operands[0])
                RightDigits = _UnderlyingDigitCount(Operands[1])
                if LeftDigits > 5 or RightDigits > 5:
                    return False

                ExpectedAnswer = _Position(Operands[0]) + _Position(Operands[1])
                return CorrectAnswer == ExpectedAnswer
            except Exception:
                return False
        if len(Operands) == 1 and Operators == [""]:
            return False
        if len(Operands) == 2 and Operators == ["Position", "Number"]:
            try:
                Position = int(_DecimalValue(Operands[0]))
                NumberValue = _DecimalValue(Operands[1])
                DigitCount = len(str(abs(int(NumberValue))))
                Exponent = Position - DigitCount
                ExpectedAnswer = NumberValue * ((Decimal(10) ** Exponent) if Exponent >= 0 else (Decimal(1) / (Decimal(10) ** abs(Exponent))))
                QuantizeUnit = Decimal("1").scaleb(-abs(Exponent)) if Exponent < 0 else Decimal("1")
                return CorrectAnswer == ExpectedAnswer.quantize(QuantizeUnit)
            except Exception:
                return False
        return False

    if Config.ConceptFamily == "SOLVE_EQUATION":
        return len(Operands) == 1 and Operators == [""]

    return False




def _ValidateIntegerQuestion(Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) < 2 or len(Operators) != len(Operands):
        return False
    if any(Operator not in {"", "+"} for Operator in Operators):
        return False
    if any(not _IsNumeric(Value) or not _IsWholeNumber(Value) for Value in Operands):
        return False

    SignedValues = [_DecimalValue(Value) for Value in Operands]
    if all(Value < 0 for Value in SignedValues):
        return False

    ExpectedAnswer = sum(SignedValues, Decimal(0))
    return CorrectAnswer == ExpectedAnswer


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False

    if len(Operators) != len(Operands):
        return False

    if Config.ConceptFamily in PACKAGE_4_FINANCIAL_CONCEPTS:
        return _ValidateFinancialQuestion(Config, Operands, Operators, CorrectAnswer)

    if Config.ConceptFamily in PACKAGE_5_SPECIAL_CONCEPTS:
        return _ValidatePackage5Special(Config, Operands, Operators, CorrectAnswer)

    if any(Operator not in ALLOWED_OPERATORS for Operator in Operators):
        return False

    if Config.ConceptFamily in PACKAGE_3_COMPACT_CONCEPTS:
        return _ValidatePackage3Compact(Config, Operands, Operators, CorrectAnswer)

    if len(Operands) < 2:
        return False

    for Index, Operator in enumerate(Operators):
        if Operator == "÷" and Decimal(str(Operands[Index])) == 0:
            return False

    if Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return _ValidateWholeMultiplicationPattern(Config, Operands, Operators) and CorrectAnswer >= 0

    if Config.ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return _ValidateWholeDivisionPattern(Config, Operands, Operators) and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_MULTIPLICATION":
        return _ValidateDecimalMultiplicationPattern(Config, Operands, Operators, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_DIVISION":
        return _ValidateDecimalDivisionPattern(Config, Operands, Operators, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "PERCENTAGE_ADD_LESS":
        return _ValidatePercentageAddLess(Operands, Operators, CorrectAnswer)

    if Config.ConceptFamily.startswith("PERCENTAGE") and any(_IsNumeric(Value) and Decimal(str(Value)) < 0 for Value in Operands):
        return False

    if Config.ConceptFamily == "INTEGERS":
        return _ValidateIntegerQuestion(Operands, Operators, CorrectAnswer)

    if Config.ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS"}:
        return _ValidateAddLessQuestion(Config, Operands, Operators, CorrectAnswer)

    if CorrectAnswer < 0:
        return False

    return True
