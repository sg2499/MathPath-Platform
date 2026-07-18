"""Intermediate Module Level 4 question-generation formulas.

Every formula in this file was independently verified against LEVEL 8.xlsx's own
embedded answer-key formulas (not just the cached values) before being written
here:
  - Concept Drill: FROM mod LESS (workbook cell formula =MOD(...)).
  - Skill Stacker: ADD x 2^(TIMES-1) (workbook cell formula =...*POWER(2,...)).
  - Write the Number From the Given Position: digitstring_as_integer x
    10^(position - digit_count), verified against 39/40 real workbook instances.
  - Find the Position of the First Natural Number: the exact inverse of the
    above, verified against 15/15 real workbook instances.
  - Division: the workbook itself generates clean dividends via
    "pick a divisor, multiply by a small random whole factor" -- the division
    generator below reproduces that same strategy from first principles.

This module does not import anything from app.question_engine.mm. Intermediate
Module has its own identity in the curriculum hierarchy and its own tuned
ranges (drawn from the actual observed values across all 60 IM Level 4 DPS),
not Master Module's wider "MASTER" ranges.
"""

import random
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from app.question_engine.im.config import IMConfig


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

def _DigitRange(Digits: int) -> tuple[int, int]:
    Digits = max(1, Digits)
    if Digits == 1:
        return 1, 9
    return 10 ** (Digits - 1), (10 ** Digits) - 1


def _Quantize(Value: Decimal, Places: int) -> Decimal:
    if Places <= 0:
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.quantize(Decimal("1").scaleb(-Places), rounding=ROUND_HALF_UP)


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


# ---------------------------------------------------------------------------
# Add/Less, Decimal Add/Less, and Borrowing (all share one running-sum shape)
# ---------------------------------------------------------------------------

def _AddLessRowPlan(Config: IMConfig) -> tuple[int, int, int]:
    """Return (row_count, magnitude_min, magnitude_max) for this section.

    Every Add/Less-family DPS across both IM-L4 (LEVEL 8.xlsx) and IM-L3
    (IM3 Lvl 7 New.xlsx) was re-measured directly from the workbooks'
    literal cell values (row count + min/max magnitude per section,
    2026-07-17 audit) -- the result: row count and magnitude vary
    per-DPS-instance, not by a flat category rule (e.g. L4 Lesson 6 DPS-5
    is 6 rows of 2-digit numbers; L4 Lesson 9 DPS-4 is 3 rows spanning
    5-6 digit numbers; L4 Lesson 8 DPS-4 decimal rows stay under 10).
    curriculum_map.py entries therefore carry explicit `rowCount` /
    `magnitudeMin` / `magnitudeMax` overrides wherever the measured data
    diverges from the old flat defaults; those overrides are read first
    here. The category-based fallbacks below are a safety net only, for
    any section that doesn't (yet) specify explicit values.
    """
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}

    ExplicitRowCount = GeneratorConfig.get("rowCount")
    ExplicitMin = GeneratorConfig.get("magnitudeMin")
    ExplicitMax = GeneratorConfig.get("magnitudeMax")
    if ExplicitRowCount and ExplicitMin is not None and ExplicitMax is not None:
        return int(ExplicitRowCount), int(ExplicitMin), int(ExplicitMax)

    ExplicitDigits = GeneratorConfig.get("explicitDigitCount")
    if ExplicitDigits:
        Minimum, Maximum = _DigitRange(int(ExplicitDigits))
        RowCount = int(ExplicitRowCount) if ExplicitRowCount else (3 if int(ExplicitDigits) >= 6 else 4)
        return RowCount, Minimum, Maximum

    IsDecimal = bool(GeneratorConfig.get("isDecimal"))
    BorrowingMode = GeneratorConfig.get("borrowingMode")
    if BorrowingMode:
        # Workbook borrowing rows sit in the 100-999 band (3-digit) so a mix of
        # signs can plausibly cross zero either way.
        return 3, 100, 999
    if IsDecimal:
        # Workbook decimal add/less rows: 4 stacked addends, magnitude ~10-999
        # before the decimal point, 2 decimal places.
        return 4, 10, 999
    # Plain whole-number Add/Less (e.g. Lesson 6 DPS3/5, Lesson 9 DPS1): 5 rows,
    # 3-digit magnitude.
    return 5, 100, 999


def GenerateAddLess(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    IsDecimal = bool(GeneratorConfig.get("isDecimal")) or Config.ConceptFamily == "DECIMAL_ADD_LESS"
    Places = int(GeneratorConfig.get("decimalPlaces") or (2 if IsDecimal else 0))
    RowCount, Minimum, Maximum = _AddLessRowPlan(Config)
    BorrowingMode = GeneratorConfig.get("borrowingMode")

    # Sign/magnitude bias, calibrated against real workbook row values (not
    # assumed): row-by-row inspection of every Add/Less-family DPS in both
    # LEVEL 8.xlsx (L4) and IM3 Lvl 7 New.xlsx (L3) -- not just the answer-key
    # column sums -- shows negative values are common in every row, INCLUDING
    # the first row (e.g. L4 Lesson 1 DPS-1 row 1 has a negative entry; L4
    # Borrowing sections show 2-5 negative first-row entries out of 10
    # columns across every lesson that has one). Forcing the first row
    # positive (the original implementation) doesn't match either workbook.
    # Rows after the first stay on the original, separately-calibrated
    # NegativeProbability; the first row gets its own (lower, category-tuned)
    # probability instead of being hardcoded positive.
    #
    # IM-L2's Borrowing sections are the opposite lean: every real instance
    # in IM2 Lvl 6.xlsx sums to a POSITIVE total per column despite roughly
    # half the individual row entries being negative (audit 2026-07-18) --
    # the negative entries just tend to be smaller in magnitude than the
    # positive ones. L3/L4's borrowingMode=="NEGATIVE"/"POSITIVE_NEGATIVE"
    # deliberately biases negative rows LARGER (via a max-of-two draw) since
    # those levels lean toward negative/mixed totals; L2's "POSITIVE" mode
    # does the mirror image -- negative rows draw smaller (min-of-two),
    # positive rows draw larger (max-of-two), with a lower negative
    # probability -- so the validator's CorrectAnswer > 0 check (see
    # validators.py) succeeds within the generator's normal retry budget
    # instead of relying on rare rejection-sampling luck.
    IsPositiveOnlyBorrowing = BorrowingMode == "POSITIVE"
    if IsPositiveOnlyBorrowing:
        NegativeProbability = 0.35
    else:
        NegativeProbability = 0.9 if BorrowingMode else 0.22
    FirstRowNegativeProbability = GeneratorConfig.get("firstRowNegativeProbability")
    if FirstRowNegativeProbability is None:
        if IsPositiveOnlyBorrowing:
            FirstRowNegativeProbability = 0.15
        else:
            FirstRowNegativeProbability = 0.25 if BorrowingMode else (0.1 if IsDecimal else 0.05)

    Values: list[Decimal] = []
    for RowIndex in range(RowCount):
        RowNegativeProbability = FirstRowNegativeProbability if RowIndex == 0 else NegativeProbability
        Sign = -1 if Rng.random() < RowNegativeProbability else 1
        if Sign == -1 and IsPositiveOnlyBorrowing:
            Magnitude = Decimal(min(Rng.randint(Minimum, Maximum), Rng.randint(Minimum, Maximum)))
        elif Sign == 1 and IsPositiveOnlyBorrowing:
            Magnitude = Decimal(max(Rng.randint(Minimum, Maximum), Rng.randint(Minimum, Maximum)))
        elif Sign == -1 and BorrowingMode:
            Magnitude = Decimal(max(Rng.randint(Minimum, Maximum), Rng.randint(Minimum, Maximum)))
        else:
            Magnitude = Decimal(Rng.randint(Minimum, Maximum))
        if Places:
            Magnitude = Magnitude + (Decimal(Rng.randint(0, (10 ** Places) - 1)) / Decimal(10 ** Places))
        Values.append(Magnitude * Sign)

    CorrectAnswer = _Quantize(sum(Values, Decimal(0)), Places)
    Operators = ["" if Index == 0 else ("+" if Value >= 0 else "-") for Index, Value in enumerate(Values)]
    # Match the workbook's own display convention: magnitudes shown positive
    # with the sign carried by the operator -- EXCEPT the first row, which has
    # no preceding operator to carry a sign at all (Operators[0] is always
    # ""), so a negative first row must carry its own sign directly on the
    # displayed value (e.g. "-85.88"), exactly like the real worksheets show
    # a bare negative number as the first cell in the column. Rows 1+ still
    # display as a positive magnitude since their operator already encodes
    # the sign. (Fixed 2026-07-17 alongside allowing row 0 to be negative --
    # forcing abs() on every row, including row 0, silently discarded any
    # negative first-row sign the moment it was generated.)
    DisplayOperands: list[int | float | str]
    if Places:
        DisplayOperands = [
            f"{Value:.{Places}f}" if Index == 0 else f"{abs(Value):.{Places}f}"
            for Index, Value in enumerate(Values)
        ]
    else:
        DisplayOperands = [
            _Display(Value) if Index == 0 else _Display(abs(Value))
            for Index, Value in enumerate(Values)
        ]

    return DisplayOperands, Operators, CorrectAnswer, {
        "question_text": "Add/Less",
        "decimal_places": Places,
        "row_count": RowCount,
    }


# ---------------------------------------------------------------------------
# Multiplication / Division (whole numbers only anywhere in IM Level 4)
# ---------------------------------------------------------------------------

def _IsTrivial(Value: int) -> bool:
    # Avoid operands that are suspiciously round (all-zero tail) too often --
    # a light quality guard, not a workbook rule.
    return Value % 100 == 0 and Value >= 100


def GenerateWholeNumberMultiplication(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    LeftDigits, RightDigits = GeneratorConfig.get("multiplicationDigits") or (2, 2)
    LeftMin, LeftMax = _DigitRange(int(LeftDigits))
    RightMin, RightMax = _DigitRange(int(RightDigits))

    Left = Right = 0
    for _Attempt in range(60):
        Left = Rng.randint(LeftMin, LeftMax)
        Right = Rng.randint(RightMin, RightMax)
        if not (_IsTrivial(Left) and _IsTrivial(Right)):
            break

    CorrectAnswer = Decimal(Left * Right)
    # No question_text here on purpose: the frontend's EXPRESSION_WORKSHEET renderer
    # (MathQuestionDisplay.tsx) prefers questionText over building the expression from
    # operands/operators when questionText is present. A generic label like
    # "Multiplication" here would silently replace the actual "3242 × 7 = ?" expression
    # with just the word "Multiplication" -- exactly the bug this fixes. Leaving
    # question_text unset lets the frontend build the real expression from operands.
    return [Left, Right], ["", "×"], CorrectAnswer, {
        "left_digits": int(LeftDigits),
        "right_digits": int(RightDigits),
    }


def TruncateThenRoundQuotient(ExactQuotient: Decimal) -> Decimal:
    """The "Long Division & Estimation" rounding rule (Shailesh's spec,
    2026-07-15): a student works the division out by hand to 3 decimal places
    -- truncated, not rounded, since that's the literal next digit long
    division produces -- then rounds that 3-decimal figure to 2 decimal places
    using the standard rule on the 3rd decimal digit (< 5 rounds down, >= 5
    rounds up). Worked example: 415 / 7 = 59.285714... -> truncate to 59.285
    -> 3rd decimal is 5 -> rounds up to 59.29. Exported (no leading
    underscore) because im/validators.py needs the exact same rounding to
    check a submitted answer.
    """
    ThreeDecimalPlaces = ExactQuotient.quantize(Decimal("0.001"), rounding=ROUND_DOWN)
    return ThreeDecimalPlaces.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _GenerateLongDivisionEstimationPair(
    Rng: random.Random, DividendMin: int, DividendMax: int, DivisorMin: int, DivisorMax: int,
) -> tuple[int, int]:
    """Long Division & Estimation is a distinct concept from plain division:
    the whole point is practicing long division out to a remainder and
    rounding the result (see TruncateThenRoundQuotient), so -- unlike plain
    division -- the dividend must NOT divide evenly. Digit-pattern-agnostic on
    purpose (works for 3D/1D, 4D/1D today, and any future digit pattern or
    level whose curriculum map sets isLongDivisionEstimation=True) -- callers
    control the exact digit ranges, this only enforces "has a remainder."
    """
    Divisor = max(DivisorMin, 2)
    Dividend = min(DividendMax, max(DividendMin, Divisor + 1))
    if Dividend % Divisor == 0:
        Dividend = min(DividendMax, Dividend + 1)

    for _Attempt in range(120):
        CandidateDivisor = Rng.randint(DivisorMin, DivisorMax)
        if CandidateDivisor <= 1:
            continue
        CandidateDividend = Rng.randint(DividendMin, DividendMax)
        if CandidateDividend % CandidateDivisor == 0:
            continue  # exact division defeats the purpose of this concept
        if _IsTrivial(CandidateDividend):
            continue
        Divisor, Dividend = CandidateDivisor, CandidateDividend
        break

    return Dividend, Divisor


def GenerateWholeNumberDivision(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    """Plain division reproduces the workbook's own dividend-generation
    strategy from first principles: pick a divisor within its digit range,
    then pick a quotient that keeps the dividend inside its own digit range,
    and multiply -- guaranteeing a clean, remainder-free division every time,
    exactly the way LEVEL 8.xlsx's own RANDBETWEEN-driven cells do it.

    Long Division & Estimation (isLongDivisionEstimation=True, currently the
    3D/1D and 4D/1D sections per curriculum_map.py's _DIV() calls) is
    deliberately different: the dividend must NOT divide evenly, and the
    answer is the quotient rounded per TruncateThenRoundQuotient rather than
    a whole number. See that function's docstring for the exact rule and
    worked example (Shailesh, 2026-07-15).
    """
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    DividendDigits, DivisorDigits = GeneratorConfig.get("divisionDigits") or (4, 2)
    DivisorMin, DivisorMax = _DigitRange(int(DivisorDigits))
    DividendMin, DividendMax = _DigitRange(int(DividendDigits))
    IsLongDivisionEstimation = bool(GeneratorConfig.get("isLongDivisionEstimation"))

    if IsLongDivisionEstimation:
        Dividend, Divisor = _GenerateLongDivisionEstimationPair(
            Rng, DividendMin, DividendMax, DivisorMin, DivisorMax
        )
        CorrectAnswer = TruncateThenRoundQuotient(Decimal(Dividend) / Decimal(Divisor))
    else:
        Divisor = max(DivisorMin, 2)
        Quotient = max(DividendMin // Divisor, 2)
        Dividend = Divisor * Quotient

        for _Attempt in range(120):
            Divisor = Rng.randint(DivisorMin, DivisorMax)
            if Divisor <= 1:
                continue
            MinQuotient = max(2, -(-DividendMin // Divisor))
            MaxQuotient = DividendMax // Divisor
            if MinQuotient > MaxQuotient:
                continue
            Quotient = Rng.randint(MinQuotient, MaxQuotient)
            Dividend = Divisor * Quotient
            if DividendMin <= Dividend <= DividendMax and not _IsTrivial(Dividend):
                break

        CorrectAnswer = Decimal(Quotient)

    # See the comment in GenerateWholeNumberMultiplication: no question_text on
    # purpose, so the frontend builds "2236 ÷ 52 = ?" from operands instead of
    # displaying a bare "Division" label.
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, {
        "dividend_digits": int(DividendDigits),
        "divisor_digits": int(DivisorDigits),
        "is_long_division_estimation": IsLongDivisionEstimation,
    }


# ---------------------------------------------------------------------------
# Squares
# ---------------------------------------------------------------------------

def GenerateSquares(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Base = Rng.randint(11, 99)
    CorrectAnswer = Decimal(Base * Base)
    # No question_text here either -- same bug class as multiplication/division.
    # The single preformatted operand "(45)²" is exactly what COMPACT_EXPRESSION's
    # BuildExpression() fallback needs; a "Square" label would hide it.
    return [f"({Base})²"], [""], CorrectAnswer, {"base": Base}


# ---------------------------------------------------------------------------
# Skill Stacker: ADD x 2^(TIMES-1)
# ---------------------------------------------------------------------------

def GenerateSkillStacker(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    FixedTimes = GeneratorConfig.get("fixedTimes")
    if FixedTimes:
        # IM-L3's workbook literally never varies TIMES -- every Skill Stacker
        # instance across all 12 lessons uses TIMES=10 (IM3 Lvl 7 New.xlsx
        # audit, 2026-07-17). curriculum_map.py sets fixedTimes=10 for L3.
        # IM-L2's own workbook (IM2 Lvl 6.xlsx, audit 2026-07-18) uses a
        # different fixed value that steps once mid-level: TIMES=5 for
        # Lessons 1-8, TIMES=6 for Lessons 9-10 -- curriculum_map.py sets
        # fixed_times=5/6 per lesson accordingly.
        Times = int(FixedTimes)
    else:
        # L4's own workbook uses TIMES up to 15 (Lesson 12: POWER(2,15-1)),
        # not 12 -- the old [8..12] choice list came up two steps short of
        # the real ceiling (LEVEL 8.xlsx audit, 2026-07-17).
        Times = Rng.choice([8, 9, 10, 11, 12, 15])

    # IM-L2's own workbook formula is a plain product, ADD x TIMES -- verified
    # against multiple real answer-key values (154387x5=771935, 538192x6=
    # 3229152, IM2 Lvl 6.xlsx audit 2026-07-18), NOT the ADD x 2^(TIMES-1)
    # doubling formula every L3/L4 instance uses. curriculum_map.py sets
    # linear=True only for L2's Skill Stacker sections; L3/L4 are untouched.
    LinearFormula = bool(GeneratorConfig.get("skillStackerLinear"))

    AddRange = GeneratorConfig.get("addRange")
    if AddRange:
        AddValue = Decimal(Rng.randint(int(AddRange[0]), int(AddRange[1])))
    elif Rng.random() < 0.4:
        AddValue = Decimal(Rng.randint(400, 8000)) / Decimal(100)  # e.g. 4.00-80.00
        AddValue = AddValue.quantize(Decimal("0.01"))
    else:
        AddValue = Decimal(Rng.randint(4, 80))

    if LinearFormula:
        CorrectAnswer = AddValue * Decimal(Times)
    else:
        CorrectAnswer = AddValue * (Decimal(2) ** (Times - 1))
    return [_Display(AddValue), Times], ["Add", "Times"], CorrectAnswer, {
        "question_text": "Skill Stacker",
    }


# ---------------------------------------------------------------------------
# Concept Drill: FROM mod LESS
# ---------------------------------------------------------------------------

def GenerateConceptDrill(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    UseDecimalFrom = bool(GeneratorConfig.get("allowDecimalFrom")) and QuestionNumber % 2 == 0

    # Config-driven ranges, read first, falling back to the historical L4
    # defaults when a level/section doesn't override them. Needed because
    # the two workbooks use materially different Concept Drill bands: L4's
    # decimal LESS reaches 588.59 (Lesson 4 audit, 2026-07-17) -- past the
    # old flat 95.00 cap -- while L3's whole/decimal Concept Drill values
    # sit in a visibly narrower band throughout (IM3 Lvl 7 New.xlsx audit,
    # same date; FROM ~2385-6739 whole, ~100-280 decimal, LESS ~127-489
    # whole, ~6-11 decimal).
    DecimalFromRange = GeneratorConfig.get("decimalFromRange")  # (min, max) as decimal values
    DecimalLessRange = GeneratorConfig.get("decimalLessRange")
    WholeFromRange = GeneratorConfig.get("wholeFromRange")
    WholeLessRange = GeneratorConfig.get("wholeLessRange")

    if UseDecimalFrom:
        if DecimalFromRange:
            FromMinCents, FromMaxCents = int(float(DecimalFromRange[0]) * 100), int(float(DecimalFromRange[1]) * 100)
        else:
            FromMinCents, FromMaxCents = 10000, 999999  # 100.00-9999.99 (L4 default)
        FromValue = (Decimal(Rng.randint(FromMinCents, FromMaxCents)) / Decimal(100)).quantize(Decimal("0.01"))

        if DecimalLessRange:
            LessMinCents, LessMaxCents = int(float(DecimalLessRange[0]) * 100), int(float(DecimalLessRange[1]) * 100)
        else:
            LessMinCents, LessMaxCents = 2000, 58900  # 20.00-589.00 (widened past L4's real 588.59 ceiling)
        LessValue = (Decimal(Rng.randint(LessMinCents, LessMaxCents)) / Decimal(100)).quantize(Decimal("0.01"))

        if LessValue <= 0:
            LessValue = Decimal("1.00")
        StepsHigh = int(FromValue // LessValue)
        if StepsHigh < 1:
            LessValue = (FromValue / Decimal(12)).quantize(Decimal("0.01"))
        CorrectAnswer = FromValue - (LessValue * int(FromValue // LessValue))
        FromDisplay: int | float | str = f"{FromValue:.2f}"
        LessDisplay: int | float | str = f"{LessValue:.2f}"
    else:
        if WholeFromRange:
            FromValue = Rng.randint(int(WholeFromRange[0]), int(WholeFromRange[1]))
        else:
            FromValue = Rng.randint(1000, 99999)
        if WholeLessRange:
            LessValue = Rng.randint(int(WholeLessRange[0]), int(WholeLessRange[1]))
        else:
            LessValue = Rng.randint(90, max(91, FromValue // 4))
        CorrectAnswer = Decimal(FromValue % LessValue)
        FromDisplay = FromValue
        LessDisplay = LessValue

    return [FromDisplay, LessDisplay], ["From", "Less"], CorrectAnswer, {
        "question_text": "Concept Drill",
    }


# ---------------------------------------------------------------------------
# BODMAS -- basic 4-operation tier (Lessons 5-6) and squared-term tier
# (Lesson 7 onward), matching the workbook's own mid-level difficulty step.
# This is the IM-L4 template (LEVEL 8.xlsx). IM-L3 (IM3 Lvl 7 New.xlsx) and
# IM-L2 (IM2 Lvl 6.xlsx) both independently use a structurally different
# template -- see _GenerateBodmasExactDivision below -- dispatched via
# GeneratorConfig["bodmasTemplate"] == "EXACT_DIVISION_TEMPLATE". The shared
# A+B×C-D÷E+F shape is genuinely common to both workbooks, but every
# magnitude range is sourced independently per level via GeneratorConfig
# overrides (bodmasAdditiveRange/bodmasMultiplierLeftRange/bodmasTailRange)
# -- L2 is never assumed to share L3's number ranges just because it shares
# the term shape.
# ---------------------------------------------------------------------------

def _GenerateBodmasExactDivision(Config: IMConfig, Rng: random.Random) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    """Shape: A + B x C - D/E + F, where the division term divides EXACTLY
    (no remainder). Confirmed independently in two workbooks:
      - IM3 Lvl 7 New.xlsx (IM-L3): 25/25 real expressions exact (e.g.
        4516/4=1129, 183/61=3, 3822/7=546, 4248/6=708). A/B/F land in the
        100-999 band there (curriculum_map.py's L3 default, unchanged).
      - IM2 Lvl 6.xlsx (IM-L2, audit 2026-07-18): 37/40 real expressions
        exact (the 3 exceptions look like isolated data-entry slips, not
        deliberate remainder design). A and B are consistently 2-digit
        (10-99) there, not L3's 3-digit -- passed via bodmasAdditiveRange/
        bodmasMultiplierLeftRange overrides rather than assumed equal to L3.
    This is the opposite of L4's BODMAS, whose division term is an ordinary
    fractional remainder. Both source workbooks' real expressions also vary
    term order/count/sign lesson to lesson (some drop the leading "A +",
    some add a trailing "- H", one lesson even flips division to addition)
    -- this generator reproduces the single dominant 5-term shape common to
    the majority of instances rather than every literal structural
    permutation, the same level of template fidelity L4's own generator
    already uses.
    """
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    DivisionDigits = GeneratorConfig.get("bodmasDivisionDigits") or (4, 1)
    DivisorDigits, DividendExtraDigits = int(DivisionDigits[1]), int(DivisionDigits[0])

    AdditiveRange = GeneratorConfig.get("bodmasAdditiveRange") or (100, 999)
    MultiplierLeftRange = GeneratorConfig.get("bodmasMultiplierLeftRange") or (100, 999)
    MultiplierRightRange = GeneratorConfig.get("bodmasMultiplierRightRange") or (4, 9)
    TailRange = GeneratorConfig.get("bodmasTailRange") or (100, 999)

    A = Rng.randint(int(AdditiveRange[0]), int(AdditiveRange[1]))
    B = Rng.randint(int(MultiplierLeftRange[0]), int(MultiplierLeftRange[1]))
    C = Rng.randint(int(MultiplierRightRange[0]), int(MultiplierRightRange[1]))
    F = Rng.randint(int(TailRange[0]), int(TailRange[1]))

    DivisorMin, DivisorMax = _DigitRange(DivisorDigits)
    for _Attempt in range(60):
        E = Rng.randint(DivisorMin, DivisorMax)
        if E > 1:
            break
    else:
        E = max(DivisorMin, 2)
    DividendMin, DividendMax = _DigitRange(DividendExtraDigits)
    QuotientMin = max(2, -(-DividendMin // E))
    QuotientMax = max(QuotientMin, DividendMax // E)
    Quotient = Rng.randint(QuotientMin, QuotientMax)
    D = E * Quotient  # always exact -- D / E has zero remainder, matching every real L3/L2 instance

    Expression = f"{A} + {B} × {C} − {D} ÷ {E} + {F}"
    CorrectAnswer = Decimal(A) + Decimal(B * C) - (Decimal(D) / Decimal(E)) + Decimal(F)
    CorrectAnswer = _Quantize(CorrectAnswer, 2)
    return [Expression], [""], CorrectAnswer, {
        "question_text": Expression,
        "has_square_term": False,
        "bodmas_template": "EXACT_DIVISION_TEMPLATE",
    }


def GenerateBodmas(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    if GeneratorConfig.get("bodmasTemplate") == "EXACT_DIVISION_TEMPLATE":
        return _GenerateBodmasExactDivision(Config, Rng)

    HasSquare = bool(GeneratorConfig.get("hasSquareTerm"))

    A = Rng.randint(150, 980)       # dividend
    B = Rng.randint(13, 92)         # divisor
    F = Rng.randint(100, 9999)      # additive term
    G = Rng.randint(100, 9999)      # subtractive term

    if HasSquare:
        C = Rng.randint(10, 99)     # squared base
        D = Rng.randint(10, 99)     # multiplication term left
        E = Rng.randint(10, 99)     # multiplication term right
        Expression = f"{A} ÷ {B} + {C}² + {D} × {E} + {F} - {G}"
        CorrectAnswer = (Decimal(A) / Decimal(B)) + Decimal(C * C) + Decimal(D * E) + Decimal(F) - Decimal(G)
    else:
        C = Rng.randint(1000, 9999)  # multiplication term left (larger operand)
        D = Rng.randint(2, 9)        # multiplication term right (single digit)
        Expression = f"{A} ÷ {B} + {C} × {D} + {F} - {G}"
        CorrectAnswer = (Decimal(A) / Decimal(B)) + Decimal(C * D) + Decimal(F) - Decimal(G)

    CorrectAnswer = _Quantize(CorrectAnswer, 2)
    return [Expression], [""], CorrectAnswer, {
        "question_text": Expression,
        "has_square_term": HasSquare,
    }


# ---------------------------------------------------------------------------
# Solve the Equation: signed-integer add/subtract, parenthesised negatives
# ---------------------------------------------------------------------------

def GenerateSolveEquation(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    A = Rng.choice([Value for Value in range(-15, 16) if Value != 0])
    B = Rng.choice([Value for Value in range(-15, 16) if Value != 0])
    Operator = Rng.choice(["+", "-"])

    ShouldParenthesise = B < 0 or Rng.random() < 0.3
    BText = f"({B})" if ShouldParenthesise else f"{B}"
    Expression = f"{A} {Operator} {BText}"

    CorrectAnswer = Decimal(A + B) if Operator == "+" else Decimal(A - B)
    return [Expression], [""], CorrectAnswer, {
        "question_text": Expression,
    }


# ---------------------------------------------------------------------------
# Answer Position: Write the Number From the Given Position, and its inverse,
# Find the Position of the First Natural Number. Both directions share one
# place-value scale: position 1 = ones, 2 = tens, 3 = hundreds ... and
# 0 = tenths, -1 = hundredths, -2 = thousandths ...
# ---------------------------------------------------------------------------

def _DigitStringForPosition(NumberValue: Decimal) -> str:
    """Strip the decimal point, drop a leading integer-part '0' placeholder
    (values < 1 only -- that zero is not a real digit), keep every other
    digit including internal/trailing zeros.
    """
    Text = format(abs(NumberValue), "f")
    if "." in Text:
        IntegerPart, FractionalPart = Text.split(".", 1)
    else:
        IntegerPart, FractionalPart = Text, ""
    if IntegerPart == "0":
        IntegerPart = ""
    DigitString = (IntegerPart + FractionalPart) or "0"
    return DigitString


def _WorkbookPositionAnswer(NumberValue: Decimal, Position: int) -> Decimal:
    DigitString = _DigitStringForPosition(NumberValue)
    DigitCount = len(DigitString)
    Exponent = Position - DigitCount
    Value = Decimal(int(DigitString))
    if Exponent >= 0:
        return Value * (Decimal(10) ** Exponent)
    return Value / (Decimal(10) ** abs(Exponent))


def _FirstNonzeroPosition(NumberValue: Decimal) -> int:
    Text = format(abs(NumberValue), "f")
    IntegerPart, _, FractionalPart = Text.partition(".")
    IntegerDigits = IntegerPart.lstrip("0")
    if IntegerDigits:
        return len(IntegerDigits)
    for Index, Character in enumerate(FractionalPart):
        if Character != "0":
            return -Index
    return 0


def _GenerateWriteFromPositionNumber(Rng: random.Random) -> Decimal:
    if Rng.random() < 0.15:
        WholeDigits = Rng.randint(1, 2)
        Minimum, Maximum = _DigitRange(WholeDigits)
        Whole = Rng.randint(Minimum, Maximum)
        Fraction = Rng.randint(1, 9999)
        return Decimal(f"{Whole}.{Fraction}")
    Digits = Rng.randint(2, 4)
    Minimum, Maximum = _DigitRange(Digits)
    return Decimal(Rng.randint(Minimum, Maximum))


def _GenerateFindPositionNumber(Rng: random.Random, TargetPosition: int) -> Decimal:
    if TargetPosition >= 1:
        Minimum, Maximum = _DigitRange(TargetPosition)
        Whole = Rng.randint(Minimum, Maximum)
        if Rng.random() < 0.4:
            return Decimal(f"{Whole}.{Rng.randint(0, 9999)}")
        return Decimal(Whole)
    FirstDigit = Rng.randint(1, 9)
    LeadingZeros = abs(TargetPosition)
    Tail = Rng.randint(0, 9999)
    return Decimal(f"0.{'0' * LeadingZeros}{FirstDigit}{Tail}")


def GenerateAnswerPosition(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    Direction = GeneratorConfig.get("answerPositionDirection", "WRITE_FROM_POSITION")
    PositionRange = GeneratorConfig.get("positionRange") or (-4, 2)
    PositionMin, PositionMax = int(PositionRange[0]), int(PositionRange[1])

    if Direction == "WRITE_FROM_POSITION":
        Position = Rng.randint(PositionMin, PositionMax)
        NumberValue = _GenerateWriteFromPositionNumber(Rng)
        CorrectAnswer = _WorkbookPositionAnswer(NumberValue, Position)
        NumberDisplay: int | float | str = _Display(NumberValue)
        return [Position, NumberDisplay], ["Position", "Number"], CorrectAnswer, {
            "question_text": "Write the Number from the Given Position",
            "answer_position_direction": "WRITE_FROM_POSITION",
        }

    TargetPosition = Rng.randint(PositionMin, PositionMax)
    NumberValue = _GenerateFindPositionNumber(Rng, TargetPosition)
    CorrectAnswer = Decimal(_FirstNonzeroPosition(NumberValue))
    NumberText = format(NumberValue, "f")
    return [NumberText], ["Number"], CorrectAnswer, {
        "question_text": "Find the Position of the First Natural Number",
        "answer_position_direction": "FIND_POSITION",
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def GenerateImQuestion(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list, list[str], Decimal, dict]:
    ConceptFamily = Config.ConceptFamily
    if ConceptFamily in ("ADD_LESS", "DECIMAL_ADD_LESS"):
        return GenerateAddLess(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
    if ConceptFamily == "SQUARES":
        return GenerateSquares(Config, Rng, QuestionNumber)
    if ConceptFamily == "SKILL_STACKER":
        return GenerateSkillStacker(Config, Rng, QuestionNumber)
    if ConceptFamily == "CONCEPT_DRILL":
        return GenerateConceptDrill(Config, Rng, QuestionNumber)
    if ConceptFamily == "BODMAS":
        return GenerateBodmas(Config, Rng, QuestionNumber)
    if ConceptFamily == "SOLVE_EQUATION":
        return GenerateSolveEquation(Config, Rng, QuestionNumber)
    if ConceptFamily == "ANSWER_POSITION":
        return GenerateAnswerPosition(Config, Rng, QuestionNumber)
    raise ValueError(f"Intermediate Module generator does not support concept: {ConceptFamily}")
