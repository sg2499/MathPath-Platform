"""Exhaustive tests for app.services.answer_matching.answers_match() -- the
single function DPS grading uses to compare a student's typed answer
against GeneratedQuestion.correct_answer now that DPS questions are
free-text instead of MCQ (see OPEN_ISSUES.md, 2026-08-03e).

Two failure directions matter equally here and both are tested explicitly:
  1. False negative -- a student who typed the actually correct answer, in
     any reasonable format, gets marked wrong. Never acceptable.
  2. False positive -- a student who typed an actually different value gets
     marked correct. Never acceptable either; normalization must only
     forgive formatting noise, never value differences.
"""
from __future__ import annotations

import pytest

from app.services.answer_matching import answers_match, is_complete_plain_number


# ---------------------------------------------------------------------------
# Exact / trivial matches
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("correct,student", [
    ("42", "42"),
    ("0", "0"),
    ("-7", "-7"),
    ("3.75", "3.75"),
])
def test_exact_match(correct, student):
    assert answers_match(correct, student) is True


# ---------------------------------------------------------------------------
# Formatting noise that must NEVER cost a student a correct answer
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("correct,student", [
    ("42", " 42 "),              # surrounding whitespace
    ("42", "4 2"),               # accidental internal space (fumbled keystroke)
    ("42", "+42"),               # redundant leading plus
    ("42", "042"),               # leading zero
    ("42", "0042"),              # multiple leading zeros
    ("42", "42.0"),              # trailing decimal zero
    ("42", "42.00"),             # multiple trailing decimal zeros
    ("3.75", "3.750"),           # padded decimal
    ("3.75", "3.7500"),
    ("0", "-0"),                 # negative zero
    ("0", "0.0"),
    ("-7", "−7"),           # unicode minus sign (U+2212)
    ("-7", "–7"),           # en dash used as minus (U+2013)
    ("1234", "1,234"),           # thousands separator
    ("1234.5", "1,234.50"),
    ("7", "７"),                  # fullwidth digit (NFKC-normalizable)
    (".5", "0.5"),
    ("0.5", ".5"),
    ("5", "5."),                 # trailing bare decimal point
])
def test_formatting_noise_never_marks_correct_answer_wrong(correct, student):
    assert answers_match(correct, student) is True, (
        f"correct={correct!r} student={student!r} should have matched -- "
        "a formatting-only difference must never cost a student a correct answer"
    )


# ---------------------------------------------------------------------------
# Genuinely different values must ALWAYS be wrong -- no false leniency
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("correct,student", [
    ("42", "43"),
    ("42", "-42"),
    ("42", "4.2"),
    ("3.75", "3.7"),
    ("3.75", "3.76"),
    ("100", "1000"),
    ("0", "1"),
    ("-5", "5"),
    ("12", "21"),          # digit transposition is still wrong
    ("42", "420"),
])
def test_different_values_never_marked_correct(correct, student):
    assert answers_match(correct, student) is False, (
        f"correct={correct!r} student={student!r} are different values and must never match"
    )


# ---------------------------------------------------------------------------
# Empty / missing / garbage input -- must never crash, must never match
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("student", ["", "   ", None])
def test_empty_or_missing_answer_is_never_correct(student):
    assert answers_match("42", student) is False


@pytest.mark.parametrize("student", [
    "abc", "42abc", "--42", "4-2", "42..5", "NaN", "Infinity", "1e5", "5,,",
])
def test_garbage_input_never_crashes_and_never_falsely_matches(student):
    # None of these should ever equal a numeric correct_answer like "42".
    assert answers_match("42", student) is False


def test_garbage_correct_answer_does_not_crash():
    # Defensive: even if correct_answer itself were ever malformed, this must
    # not raise -- it should just fail to match rather than 500 the request.
    assert answers_match("not-a-number", "42") is False


# ---------------------------------------------------------------------------
# Non-numeric fallback path (future-proofing -- not exercised by any DPS
# concept family in production today, since YLM/MM/IM -- including IM's
# Answer Position -- all store a plain numeric correct_answer)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("correct,student", [
    ("North", "north"),
    ("North", " North "),
    ("North", "NORTH"),
])
def test_non_numeric_fallback_is_case_and_whitespace_tolerant(correct, student):
    assert answers_match(correct, student) is True


def test_non_numeric_fallback_does_not_collapse_distinct_words():
    # Internal whitespace is collapsed to a single space, never removed
    # entirely, so two distinct words are never accidentally treated as one.
    assert answers_match("New York", "NewYork") is False


def test_non_numeric_fallback_rejects_different_words():
    assert answers_match("North", "South") is False


# ---------------------------------------------------------------------------
# Quotient/remainder pairs -- PM-L4's "3D ÷ 1D WITH REMAINDER" concept
# family (question_engine/pm_l4/divide_remainder.py). correct_answer is a
# "quotient, remainder" pair like "73, 1"; this whole section exists because
# that shape is genuinely new and the existing single-number path would
# otherwise silently mangle it (comma stripped as a thousands separator,
# "73, 1" collapsing to the single number 731) instead of comparing the two
# values independently.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("correct,student", [
    ("73, 1", "73, 1"),
    ("73, 1", "73,1"),            # no space after comma
    ("73, 1", "73 , 1"),          # space before comma too
    ("73, 1", "73  ,  1"),        # extra spaces both sides
    ("73, 1", "073, 1"),          # leading zero on quotient
    ("73, 1", "73, 01"),          # leading zero on remainder
    ("73, 1", "073, 001"),        # leading zeros on both
    ("73, 1", "73.0, 1"),         # trailing decimal zero on quotient
    ("73, 1", "73, 1.00"),        # trailing decimal zeros on remainder
    ("73, 1", "7 3, 1"),          # fumbled internal space within quotient
    ("73, 1", "73, 1 "),          # trailing whitespace on whole answer
    ("73, 1", " 73, 1"),          # leading whitespace on whole answer
    ("0, 5", "0, 5"),
    ("0, 5", "-0, 5"),            # negative zero quotient
    ("100, 0", "100, 0"),         # zero remainder (exact-looking but still a pair)
])
def test_quotient_remainder_pair_formatting_noise_never_marks_correct_wrong(correct, student):
    assert answers_match(correct, student) is True, (
        f"correct={correct!r} student={student!r} should have matched -- "
        "a formatting-only difference in a quotient/remainder pair must "
        "never cost a student a correct answer"
    )


@pytest.mark.parametrize("correct,student", [
    ("73, 1", "72, 1"),      # wrong quotient
    ("73, 1", "73, 2"),      # wrong remainder
    ("73, 1", "72, 2"),      # both wrong
    ("73, 1", "1, 73"),      # swapped order -- order matters, not just set membership
    ("73, 1", "731"),        # collapsed into a single number -- must NOT accidentally match
    ("73, 1", "73"),         # only the quotient, remainder missing
    ("73, 1", "1"),          # only the remainder
])
def test_quotient_remainder_pair_different_values_never_marked_correct(correct, student):
    assert answers_match(correct, student) is False, (
        f"correct={correct!r} student={student!r} are different and must never match"
    )


@pytest.mark.parametrize("student", [
    "", "   ", None, "abc", "73,", ",1", "7,3,1", "73 r 1", "73/1", "73;1",
])
def test_quotient_remainder_pair_malformed_student_input_never_crashes_or_matches(student):
    assert answers_match("73, 1", student) is False


def test_quotient_remainder_pair_does_not_affect_plain_single_number_grading():
    # A correct_answer with no comma at all must be completely unaffected --
    # this is the regression guard that the new pair path is gated strictly
    # on correct_answer's own shape and never fires for ordinary questions.
    assert answers_match("1234", "1,234") is True   # thousands separator, unchanged behavior
    assert answers_match("42", "42") is True
    assert answers_match("42", "43") is False


# ---------------------------------------------------------------------------
# is_complete_plain_number -- the completeness definition the frontend's
# auto-advance heuristic mirrors (client-side; correct_answer itself is
# never sent to the client mid-attempt, so this is purely a structural
# "is this a finished number" check, not a correctness check).
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text", ["42", "-42", "3.75", "-3.75", ".5", "0", "5.", "007"])
def test_is_complete_plain_number_true_cases(text):
    assert is_complete_plain_number(text) is True


@pytest.mark.parametrize("text", ["", None, "-", ".", "4-2", "abc", "1e5", "4..5"])
def test_is_complete_plain_number_false_cases(text):
    assert is_complete_plain_number(text) is False
