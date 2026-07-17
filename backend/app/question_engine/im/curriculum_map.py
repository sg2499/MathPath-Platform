"""Intermediate Module curriculum map, covering both live levels.

Source of truth for IM-L4: LEVEL 8.xlsx ("IM Level 4" per Shailesh, confirmed),
12 lesson tabs, 5 DPS per lesson, 60 DPS total.
Source of truth for IM-L3: IM3 Lvl 7 New.xlsx ("IM Level 3" per Shailesh,
confirmed), same 12x5 shape, 60 DPS total (the workbook's own last two tabs are
assessment sheets and are intentionally excluded here per Shailesh's
instruction).

Every entry below -- for both levels -- was built directly from a full,
cell-by-cell audit of the respective workbook: every literal answer-key value
read via openpyxl (not sampled, not inferred from titles alone), including a
row-count / magnitude / first-row-sign pass over every single Add/Less-family
DPS in both workbooks (2026-07-17). Where that pass showed IM-L4's *live*
implementation diverging from LEVEL 8.xlsx's own real data (row counts and
magnitude bands that don't match the section's actual worksheet), the
corrected values are set explicitly below via `_AL`'s row_count /
magnitude_min / magnitude_max kwargs -- see the "L4 CORRECTION" comments
inline. IM-L3 is a net-new build using the same measured-not-guessed
discipline from the start.

Structure: IM_CURRICULUM_MAP[level_code][lesson_number][dps_number] -> list of
section dicts, in on-sheet left-to-right / top-to-bottom order. Each section
dict is consumed by generator.py exactly the way DPSSection rows will be
(sectionTitle, conceptFamily, questionCount, plus concept-specific generator
flags).
"""

from typing import Any


def _S(title: str, concept: str, count: int, **flags: Any) -> dict:
    return {
        "sectionTitle": title,
        "conceptFamily": concept,
        "questionCount": count,
        **flags,
    }


# Shorthand builders for the concept families that recur constantly across
# each level's 60 DPS, so the per-lesson tables below stay readable.

def _AL(title: str, count: int = 10, *, decimal: bool = False, visual: bool = True,
        borrowing: str | None = None, explicit_digits: int | None = None,
        row_count: int | None = None, magnitude_min: int | None = None,
        magnitude_max: int | None = None) -> dict:
    flags: dict[str, Any] = {"isVisual": visual, "isAbacus": not visual}
    if decimal:
        flags["isDecimal"] = True
        flags["decimalPlaces"] = 2
    if borrowing:
        flags["borrowingMode"] = borrowing
    if explicit_digits:
        flags["explicitDigitCount"] = explicit_digits
    # Explicit row-count / magnitude overrides -- read first by
    # operands.py's _AddLessRowPlan(), ahead of its category-based fallback.
    # Needed wherever a section's real workbook data doesn't match the flat
    # per-category default (see module docstring).
    if row_count is not None:
        flags["rowCount"] = row_count
    if magnitude_min is not None:
        flags["magnitudeMin"] = magnitude_min
    if magnitude_max is not None:
        flags["magnitudeMax"] = magnitude_max
    concept = "DECIMAL_ADD_LESS" if decimal else "ADD_LESS"
    return _S(title, concept, count, **flags)


def _MUL(left: int, right: int, count: int = 10, *, visual: bool = True) -> dict:
    title = f"{left}D x {right}D ({'Visual' if visual else 'Abacus'})"
    return _S(title, "WHOLE_NUMBER_MULTIPLICATION", count,
              multiplicationDigits=(left, right), isVisual=visual, isAbacus=not visual)


def _DIV(dividend: int, divisor: int, count: int = 10, *, visual: bool = True,
          long_division: bool = False) -> dict:
    # Matches the workbook's own header text exactly: plain division sections are
    # labeled just "ND / MD (Mode)" with no "Division" word (e.g. "4D ÷ 2D (VISUAL)"),
    # while long-division sections spell out "Long Division & Estimation" (e.g.
    # "3D ÷ 1D LONG DIVISION & ESTIMATION (VISUAL)"). Verified against the actual
    # worksheet images/headers, not assumed.
    if long_division:
        title = f"{dividend}D ÷ {divisor}D Long Division & Estimation ({'Visual' if visual else 'Abacus'})"
    else:
        title = f"{dividend}D ÷ {divisor}D ({'Visual' if visual else 'Abacus'})"
    return _S(title, "WHOLE_NUMBER_DIVISION", count,
              divisionDigits=(dividend, divisor), isVisual=visual, isAbacus=not visual,
              isLongDivisionEstimation=long_division)


def _SQ(count: int = 10, *, visual: bool = True) -> dict:
    return _S("Squares (Visual)" if visual else "Squares (Abacus)", "SQUARES", count,
              isVisual=visual, isAbacus=not visual)


def _SS(count: int = 2, *, fixed_times: int | None = None,
        add_range: tuple[int, int] | None = None) -> dict:
    flags: dict[str, Any] = {}
    if fixed_times is not None:
        flags["fixedTimes"] = fixed_times
    if add_range is not None:
        flags["addRange"] = add_range
    return _S("Skill Stacker (Visual)", "SKILL_STACKER", count, **flags)


def _CD(count: int = 2, *, decimal_variant: bool = False,
        whole_from_range: tuple[int, int] | None = None,
        whole_less_range: tuple[int, int] | None = None,
        decimal_from_range: tuple[float, float] | None = None,
        decimal_less_range: tuple[float, float] | None = None) -> dict:
    flags: dict[str, Any] = {"allowDecimalFrom": decimal_variant}
    if whole_from_range is not None:
        flags["wholeFromRange"] = whole_from_range
    if whole_less_range is not None:
        flags["wholeLessRange"] = whole_less_range
    if decimal_from_range is not None:
        flags["decimalFromRange"] = decimal_from_range
    if decimal_less_range is not None:
        flags["decimalLessRange"] = decimal_less_range
    return _S("Concept Drill (Abacus)", "CONCEPT_DRILL", count, **flags)


def _BM(count: int = 5, *, has_square: bool = False, template: str = "L4",
        division_digits: tuple[int, int] | None = None) -> dict:
    # The workbook's own section header is always just "BODMAS (VISUAL)" -- it never
    # calls out the squared term or the division digit pattern in the title even on
    # sheets where either is present (verified against images/headers). hasSquareTerm
    # and bodmasDivisionDigits still drive generation behavior; they're just not
    # reflected in the display title, matching the sheet.
    flags: dict[str, Any] = {"hasSquareTerm": has_square}
    if template == "L3_EXACT_DIVISION":
        flags["bodmasTemplate"] = "L3_EXACT_DIVISION"
        if division_digits is not None:
            flags["bodmasDivisionDigits"] = division_digits
    return _S("BODMAS (Visual)", "BODMAS", count, **flags)


def _SE(count: int = 10) -> dict:
    return _S("Solve the Equation", "SOLVE_EQUATION", count)


def _APW(count: int, position_range: tuple[int, int]) -> dict:
    return _S("Write the Number from the Given Position", "ANSWER_POSITION", count,
              answerPositionDirection="WRITE_FROM_POSITION", positionRange=position_range)


def _APF(count: int, position_range: tuple[int, int]) -> dict:
    return _S("Find the Position of the First Natural Number", "ANSWER_POSITION", count,
              answerPositionDirection="FIND_POSITION", positionRange=position_range)


# =============================================================================
# IM-L4 (LEVEL 8.xlsx)
# =============================================================================

_IM_L4_MAP: dict[int, dict[int, list[dict]]] = {
    1: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(4, 1), _DIV(4, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(3, 2)],
        5: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True), _DIV(4, 3)],
    },
    2: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(4, 1), _DIV(3, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(4, 3)],
        # L4 CORRECTION (2026-07-17 audit): real Borrowing data is 5-digit
        # (10509-98750), not the flat 3-digit default.
        5: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=99999), _DIV(4, 3)],
    },
    3: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(4, 1), _DIV(4, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(4, 3)],
        5: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True), _DIV(3, 1, long_division=True)],
    },
    4: {
        # L4 CORRECTION: real decimal Add/Less data reaches 4-digit whole
        # part (635.75-9543.18), not the flat 2-3 digit default.
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False,
                magnitude_min=100, magnitude_max=9999), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(3, 1), _DIV(4, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(4, 3)],
        # L4 CORRECTION: real Borrowing data is 4-digit (1010-9652), not
        # the flat 3-digit default.
        5: [_AL("Borrowing Sums with Negative/Positive Answers (Visual)", borrowing="POSITIVE_NEGATIVE", visual=True,
                row_count=3, magnitude_min=1000, magnitude_max=9999), _DIV(4, 1, visual=False, long_division=True)],
    },
    5: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False)],
        2: [_BM(has_square=False), _SE()],
        3: [_APW(10, (-4, 2)), _DIV(4, 1, visual=False, long_division=True)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _BM(has_square=False)],
        5: [_MUL(2, 2), _DIV(4, 2)],
    },
    6: {
        1: [_APF(5, (-4, 1)), _SE(5), _DIV(3, 1, long_division=True)],
        2: [_MUL(3, 1), _DIV(4, 1, visual=False, long_division=True)],
        # L4 CORRECTION: real "Add/Less (Abacus)" data is 4 rows of 4-digit
        # numbers (1167-9983), not the flat 5-row/3-digit plain default.
        3: [_AL("Add/Less (Abacus)", decimal=False, visual=False,
                row_count=4, magnitude_min=1000, magnitude_max=9999), _MUL(4, 1, count=5), _DIV(3, 2, count=5)],
        4: [_BM(has_square=False), _SS()],
        # L4 CORRECTION: real "Add/Less (Visual)" data is 6 rows of 2-digit
        # numbers (13-99), the opposite direction from the flat default.
        5: [_AL("Add/Less (Visual)", decimal=False, visual=True,
                row_count=6, magnitude_min=10, magnitude_max=99), _CD(decimal_variant=True)],
    },
    7: {
        # L4 CORRECTION: real Borrowing data spans 4-5 digit (1012-98765)
        # across 4 rows, not the flat 3-row/3-digit default.
        1: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False,
                row_count=4, magnitude_min=1000, magnitude_max=99999), _BM(has_square=True)],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_SQ(), _DIV(4, 3, visual=False)],
        4: [_APF(10, (-4, 4)), _SS(), _CD(decimal_variant=True)],
        5: [_MUL(3, 2, visual=False), _MUL(4, 1)],
    },
    8: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False), _SS(), _CD(decimal_variant=True)],
        2: [_DIV(3, 2), _DIV(4, 2)],
        3: [_MUL(3, 1), _MUL(4, 1)],
        # L4 CORRECTION: real decimal Add/Less data (DPS-4's second section)
        # stays under 10 (0.04-9.05) across 5 rows -- the opposite direction
        # from the flat default.
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True,
                row_count=5, magnitude_min=0, magnitude_max=9), _SQ(), _DIV(3, 2)],
        5: [_AL("Borrowing Sums with Negative/Positive Answers (Visual)", borrowing="POSITIVE_NEGATIVE", visual=True), _DIV(4, 3)],
    },
    9: {
        1: [_AL("Add/Less Sums (Visual)", decimal=False, visual=True), _DIV(4, 1, visual=False, long_division=True)],
        2: [_SE(10), _APW(10, (-4, 3))],
        3: [_BM(has_square=True), _SS()],
        # L4 CORRECTION: real data is a MIXED 5-6 digit spread
        # (10965-838901), not a pure 6-digit band -- explicitDigitCount=6
        # forced every value to exactly 6 digits, undershooting the real
        # low end. An explicit magnitude range covers the true spread.
        4: [_AL("Add/Less Sums (Abacus)", decimal=False, visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=999999), _DIV(3, 1, long_division=True)],
        5: [_MUL(2, 2), _DIV(4, 2)],
    },
    10: {
        1: [_AL("Decimal Number Add/Less Sums (Visual)", decimal=True, visual=True), _MUL(3, 2, visual=False)],
        2: [_DIV(4, 3), _SQ()],
        3: [_SE(10), _APW(10, (-5, 5))],
        4: [_BM(has_square=True), _SS()],
        5: [_DIV(3, 1, long_division=True), _DIV(4, 1, visual=False, long_division=True)],
    },
    11: {
        # L4 CORRECTION: same mixed 5-6 digit spread as Lesson 9 DPS-4
        # (50976-888888); explicit magnitude range replaces the pure-6-digit
        # forcing of explicitDigitCount.
        1: [_AL("6 Digit Add/Less Sums (Abacus)", decimal=False, visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=999999)],
        2: [_MUL(3, 1), _MUL(4, 2)],
        3: [_MUL(2, 2), _MUL(3, 2, visual=False)],
        4: [_SQ(), _DIV(4, 3)],
        5: [_DIV(3, 2), _DIV(4, 2)],
    },
    12: {
        # L4 CORRECTION: real decimal Add/Less data is 3 rows (not 4),
        # magnitude otherwise fits the existing default band.
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=10, magnitude_max=999), _SS(), _CD(decimal_variant=True)],
        2: [_DIV(4, 2), _DIV(4, 3)],
        3: [_DIV(3, 2), _SQ()],
        4: [
            _MUL(4, 1, count=5),
            _MUL(3, 2, count=5, visual=False),
            _MUL(3, 1, count=5),
            _MUL(2, 2, count=5),
        ],
        5: [_DIV(3, 1, long_division=True), _DIV(4, 1, visual=False, long_division=True)],
    },
}


# =============================================================================
# IM-L3 (IM3 Lvl 7 New.xlsx)
#
# Built entirely from a full cell-by-cell audit (2026-07-17): every DPS's
# section headers, concept families, digit patterns, row counts, and
# magnitude bands read directly from the workbook, the same discipline as
# the L4 corrections above -- not adapted or scaled down from L4's own map.
#
# Level-wide patterns confirmed by the audit (see operands.py/generator.py
# for where these are wired in):
#   - Skill Stacker: TIMES is fixed at 10 in every single instance (never
#     varies, unlike L4); ADD follows a small, lesson-linked sequence
#     (fixedTimes=10, addRange=(n, n+2/3) per lesson below).
#   - Concept Drill: FROM/LESS sit in a visibly narrower band than L4
#     throughout (whole FROM ~2000-7000/LESS ~100-500; decimal FROM
#     ~90-290/LESS ~6-11).
#   - BODMAS: a structurally different template from L4's -- the division
#     term is always EXACT (zero remainder) in every one of the 25 real
#     BODMAS expressions audited, vs. L4's fractional-remainder division.
#   - Solve the Equation: does not appear anywhere in this workbook (L4-only
#     concept) -- confirmed absent across all 12 lessons.
# =============================================================================

_IM_L3_MAP: dict[int, dict[int, list[dict]]] = {
    1: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True),
            _SS(fixed_times=10, add_range=(1, 3)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_MUL(4, 1, visual=True), _DIV(3, 2, visual=True)],
        4: [_AL("Add/Less (Visual)", decimal=False, visual=True,
                row_count=3, magnitude_min=1000, magnitude_max=9999), _DIV(3, 2, visual=True)],
        5: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True,
                row_count=3, magnitude_min=100, magnitude_max=999), _MUL(3, 1, visual=True)],
    },
    2: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False),
            _SS(fixed_times=10, add_range=(2, 5)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_MUL(3, 1, visual=True), _DIV(4, 2, visual=False)],
        4: [_AL("Add/Less (Visual)", decimal=False, visual=True,
                row_count=3, magnitude_min=1000, magnitude_max=99999),
            _SQ(visual=False), _DIV(3, 1, visual=False, long_division=True)],
        5: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=99999), _DIV(3, 2, visual=True)],
    },
    3: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False),
            _SS(fixed_times=10, add_range=(4, 7)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_MUL(4, 1, visual=True), _DIV(3, 2, visual=True)],
        4: [_AL("Add/Less (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=1, magnitude_max=99),
            _SQ(visual=False), _DIV(4, 2, visual=False)],
        5: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True,
                row_count=3, magnitude_min=100, magnitude_max=999), _DIV(3, 1, visual=False, long_division=True)],
    },
    4: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False,
                magnitude_min=10, magnitude_max=9999),
            _SS(fixed_times=10, add_range=(6, 9)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_MUL(3, 1, visual=True), _MUL(4, 1, visual=True)],
        4: [_AL("Add/Less (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=1, magnitude_max=999),
            _SQ(visual=False), _DIV(3, 2, visual=True)],
        5: [_AL("Borrowing Sums with Negative/Positive Answers (Visual)", borrowing="POSITIVE_NEGATIVE", visual=True,
                row_count=3, magnitude_min=1000, magnitude_max=9999), _DIV(3, 1, visual=False, long_division=True)],
    },
    5: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False,
                row_count=6, magnitude_min=1, magnitude_max=99)],
        2: [_BM(count=5, template="L3_EXACT_DIVISION", division_digits=(4, 1)),
            _APF(10, (-5, 4))],
        3: [_DIV(4, 1, visual=True), _DIV(3, 1, visual=False, long_division=True)],
        4: [_SQ(visual=False), _DIV(3, 2, visual=True)],
        5: [_MUL(3, 1, visual=True), _MUL(4, 1, visual=True)],
    },
    6: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False),
            _SS(fixed_times=10, add_range=(8, 10)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_MUL(3, 1, visual=True), _DIV(4, 2, visual=False)],
        4: [_AL("Add/Less (Visual)", decimal=False, visual=True,
                row_count=3, magnitude_min=1000, magnitude_max=9999),
            _SQ(visual=False), _DIV(3, 1, visual=False, long_division=True)],
        5: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=99999), _DIV(3, 2, visual=True)],
    },
    7: {
        1: [_APF(10, (-5, 6)), _DIV(3, 1, count=5, visual=False, long_division=True)],
        2: [_MUL(3, 1, visual=True), _DIV(3, 2, visual=True)],
        3: [_AL("Add/Less (Abacus)", decimal=False, visual=False,
                row_count=4, magnitude_min=1000, magnitude_max=9999),
            _BM(count=5, template="L3_EXACT_DIVISION", division_digits=(3, 2))],
        4: [_AL("Add/Less (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=0, magnitude_max=9), _APW(5, (-4, 3))],
        5: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
    },
    8: {
        1: [_MUL(2, 2, visual=True), _DIV(3, 2, visual=True)],
        2: [_AL("Borrowing Sums with Negative/Positive Answers (Abacus)", borrowing="POSITIVE_NEGATIVE", visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=99999), _APW(5, (-4, 6))],
        3: [_AL("Add/Less (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=1, magnitude_max=99),
            _SQ(visual=False), _DIV(4, 2, visual=False)],
        4: [_DIV(4, 1, visual=True), _DIV(3, 1, visual=False, long_division=True)],
        5: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False), _DIV(3, 2, visual=True)],
    },
    9: {
        1: [_AL("Add/Less Sums (Visual)", decimal=True, visual=True,
                row_count=3, magnitude_min=1, magnitude_max=99), _DIV(3, 1, visual=False, long_division=True)],
        2: [_MUL(2, 2, visual=False), _MUL(4, 1, visual=True)],
        3: [_DIV(3, 2, visual=True), _DIV(4, 2, visual=False)],
        4: [_SQ(visual=False), _DIV(3, 1, visual=True)],
        5: [_SS(fixed_times=10, add_range=(11, 12)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
    },
    10: {
        1: [_AL("Borrowing Sums (Abacus)", borrowing="NEGATIVE", visual=False,
                row_count=3, magnitude_min=10000, magnitude_max=99999), _DIV(3, 2, visual=True)],
        2: [_MUL(2, 2, visual=False), _MUL(4, 1, visual=False)],
        3: [_DIV(3, 2, visual=True), _DIV(4, 2, visual=False)],
        4: [_SQ(visual=False), _DIV(3, 2, visual=False)],
        5: [_SS(fixed_times=10, add_range=(13, 14)),
            _CD(whole_from_range=(2000, 7000), whole_less_range=(100, 500),
                decimal_from_range=(90, 290), decimal_less_range=(6, 11))],
    },
    11: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True,
                row_count=6, magnitude_min=0, magnitude_max=99)],
        2: [_BM(count=5, template="L3_EXACT_DIVISION", division_digits=(4, 1)),
            _APF(10, (-5, 4))],
        3: [_DIV(4, 1, visual=True), _DIV(3, 1, visual=False, long_division=True)],
        4: [_SQ(visual=False), _DIV(3, 2, visual=True)],
        5: [_MUL(3, 1, visual=True), _MUL(4, 1, visual=True)],
    },
    12: {
        1: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True,
                row_count=3, magnitude_min=100, magnitude_max=999), _DIV(3, 1, visual=False, long_division=True)],
        2: [_MUL(2, 2, visual=False), _DIV(4, 2, visual=False)],
        3: [_BM(count=5, template="L3_EXACT_DIVISION", division_digits=(4, 1)),
            _APF(10, (-4, 4))],
        4: [_SQ(visual=False), _DIV(3, 2, visual=True)],
        5: [_MUL(4, 1, visual=False), _MUL(3, 1, visual=False)],
    },
}


IM_CURRICULUM_MAP: dict[str, dict[int, dict[int, list[dict]]]] = {
    "IM-L4": _IM_L4_MAP,
    "IM-L3": _IM_L3_MAP,
}
