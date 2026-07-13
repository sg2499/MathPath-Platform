"""Intermediate Module Level 4 curriculum map.

Source of truth: LEVEL 8.xlsx ("IM Level 4" per Shailesh, confirmed), 12 lesson
tabs, 5 DPS per lesson, 60 DPS total. Every entry below was built directly from
the verified findings pass over that workbook (every embedded answer-key formula
checked, all 60 student-facing worksheet images reviewed) -- not guessed, and not
copied from any other module's curriculum map.

Structure: IM_CURRICULUM_MAP[lesson_number][dps_number] -> list of section dicts,
in on-sheet left-to-right / top-to-bottom order. Each section dict is consumed by
generator.py exactly the way DPSSection rows will be (sectionTitle, conceptFamily,
questionCount, plus concept-specific generator flags).
"""

from typing import Any


def _S(title: str, concept: str, count: int, **flags: Any) -> dict:
    return {
        "sectionTitle": title,
        "conceptFamily": concept,
        "questionCount": count,
        **flags,
    }


# Shorthand builders for the concept families that recur constantly across the
# 60 DPS, so the per-lesson tables below stay readable.

def _AL(title: str, count: int = 10, *, decimal: bool = False, visual: bool = True,
        borrowing: str | None = None, explicit_digits: int | None = None) -> dict:
    flags: dict[str, Any] = {"isVisual": visual, "isAbacus": not visual}
    if decimal:
        flags["isDecimal"] = True
        flags["decimalPlaces"] = 2
    if borrowing:
        flags["borrowingMode"] = borrowing
    if explicit_digits:
        flags["explicitDigitCount"] = explicit_digits
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
    # worksheet images, not assumed.
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


def _SS(count: int = 2) -> dict:
    return _S("Skill Stacker (Visual)", "SKILL_STACKER", count)


def _CD(count: int = 2, *, decimal_variant: bool = False) -> dict:
    return _S("Concept Drill (Abacus)", "CONCEPT_DRILL", count, allowDecimalFrom=decimal_variant)


def _BM(count: int = 5, *, has_square: bool = False) -> dict:
    # The workbook's own section header is always just "BODMAS (VISUAL)" -- it never
    # calls out the squared term in the title even on sheets where one is present
    # (verified against Lesson 7/9/10 images). hasSquareTerm still drives generation
    # behavior; it's just not reflected in the display title, matching the sheet.
    return _S("BODMAS (Visual)", "BODMAS", count, hasSquareTerm=has_square)


def _SE(count: int = 10) -> dict:
    return _S("Solve the Equation", "SOLVE_EQUATION", count)


def _APW(count: int, position_range: tuple[int, int]) -> dict:
    return _S("Write the Number from the Given Position", "ANSWER_POSITION", count,
              answerPositionDirection="WRITE_FROM_POSITION", positionRange=position_range)


def _APF(count: int, position_range: tuple[int, int]) -> dict:
    return _S("Find the Position of the First Natural Number", "ANSWER_POSITION", count,
              answerPositionDirection="FIND_POSITION", positionRange=position_range)


IM_CURRICULUM_MAP: dict[int, dict[int, list[dict]]] = {
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
        5: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False), _DIV(4, 3)],
    },
    3: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(4, 1), _DIV(4, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(4, 3)],
        5: [_AL("Borrowing Sums with Negative Answers (Visual)", borrowing="NEGATIVE", visual=True), _DIV(3, 1, long_division=True)],
    },
    4: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False), _SS(), _CD()],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_MUL(3, 1), _DIV(4, 2)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(4, 3)],
        5: [_AL("Borrowing Sums with Negative/Positive Answers (Visual)", borrowing="POSITIVE_NEGATIVE", visual=True), _DIV(4, 1, visual=False, long_division=True)],
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
        3: [_AL("Add/Less (Abacus)", decimal=False, visual=False), _MUL(4, 1, count=5), _DIV(3, 2, count=5)],
        4: [_BM(has_square=False), _SS()],
        5: [_AL("Add/Less (Visual)", decimal=False, visual=True), _CD(decimal_variant=True)],
    },
    7: {
        1: [_AL("Borrowing Sums with Negative Answers (Abacus)", borrowing="NEGATIVE", visual=False), _BM(has_square=True)],
        2: [_MUL(2, 2), _DIV(4, 2)],
        3: [_SQ(), _DIV(4, 3, visual=False)],
        4: [_APF(10, (-4, 4)), _SS(), _CD(decimal_variant=True)],
        5: [_MUL(3, 2, visual=False), _MUL(4, 1)],
    },
    8: {
        1: [_AL("Decimal Number Add/Less (Abacus)", decimal=True, visual=False), _SS(), _CD(decimal_variant=True)],
        2: [_DIV(3, 2), _DIV(4, 2)],
        3: [_MUL(3, 1), _MUL(4, 1)],
        4: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SQ(), _DIV(3, 2)],
        5: [_AL("Borrowing Sums with Negative/Positive Answers (Visual)", borrowing="POSITIVE_NEGATIVE", visual=True), _DIV(4, 3)],
    },
    9: {
        1: [_AL("Add/Less Sums (Visual)", decimal=False, visual=True), _DIV(4, 1, visual=False, long_division=True)],
        2: [_SE(10), _APW(10, (-4, 3))],
        3: [_BM(has_square=True), _SS()],
        4: [_AL("Add/Less Sums (Abacus)", decimal=False, visual=False, explicit_digits=6), _DIV(3, 1, long_division=True)],
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
        1: [_AL("6 Digit Add/Less Sums (Abacus)", decimal=False, visual=False, explicit_digits=6)],
        2: [_MUL(3, 1), _MUL(4, 2)],
        3: [_MUL(2, 2), _MUL(3, 2, visual=False)],
        4: [_SQ(), _DIV(4, 3)],
        5: [_DIV(3, 2), _DIV(4, 2)],
    },
    12: {
        1: [_AL("Decimal Number Add/Less (Visual)", decimal=True, visual=True), _SS(), _CD(decimal_variant=True)],
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
