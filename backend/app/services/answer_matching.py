"""Single authoritative answer-matching function for DPS (daily practice
sheet) grading, used by both save_answer/submit_attempt in attempt_service.py.

Why this exists: DPS questions used to be MCQ, so grading was a simple
"does the selected option's is_correct flag say True" lookup. Students were
answering randomly without solving, so DPS questions are now typed-answer
(free text) instead of multiple choice -- see OPEN_ISSUES.md, 2026-08-03e.
Grading now has to compare what the student typed against
GeneratedQuestion.correct_answer directly, and that comparison has to be
generous about formatting (a stray space, a leading zero, a "+" sign should
never cost a student a correct answer) while being strict about value (an
actually different number is always wrong -- no tolerance/rounding, since
these are exact arithmetic answers, not estimates).

This module is the ONE place that logic lives, so it can be exhaustively
unit-tested once and trusted everywhere, rather than re-implemented ad hoc
per call site.

Every DPS concept family across YLM/MM/IM (including IM's "Answer Position",
which is also a plain numeric position value, not a word/ordinal -- see
app/question_engine/im/generator.py's _Display()) stores correct_answer as a
plain number. answers_match() still falls back to an exact case-insensitive
string compare whenever either side doesn't parse as a number, purely as a
safety net for any future non-numeric DPS concept family -- it is not
exercised by any of those levels in production.

PM-L4 (added 2026-08-06, Shailesh) introduces the platform's first genuinely
compound answer: "3D ÷ 1D WITH REMAINDER" (question_engine/pm_l4/
divide_remainder.py), where correct_answer is a "quotient, remainder" pair
like "73, 1" rather than a single number. A dedicated pair-comparison path
(_to_decimal_pair, gated entirely on whether correct_answer itself has that
two-comma-separated-numbers shape) is checked BEFORE the single-number path
below -- the single-number path's thousands-separator handling would
otherwise silently mangle "73, 1" into the single number 731 by stripping
the comma, instead of comparing quotient and remainder independently. This
keeps every other level's grading byte-for-byte unchanged: the pair path
only ever activates when correct_answer itself is a pair, which no
existing concept family's correct_answer ever is.
"""
from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation

# Unicode minus/hyphen variants some keyboards/autocorrect produce (en dash,
# em dash, minus sign, hyphen variants) -- all treated as a plain ASCII "-".
_UNICODE_MINUS_RE = re.compile(r"[‐‑‒–—⁃−﹣－]")

# A plain decimal number: optional sign, then either digits with an optional
# ".digits" (or bare trailing ".") tail, or a bare ".digits". Deliberately
# does NOT accept scientific notation, "Infinity", or "NaN" -- none of those
# are things a student should be able to "match" a numeric answer with.
# Intentionally lenient about a trailing bare "." (e.g. "5.") -- that's a
# harmless typing artifact for grading purposes, not a different value. The
# frontend's own "has the student finished typing" heuristic is a separate,
# deliberately stricter check (it requires digits after any decimal point,
# so it doesn't prematurely auto-advance mid-decimal) and does not reuse
# this regex.
_PLAIN_NUMBER_RE = re.compile(r"^-?(\d+(\.\d*)?|\.\d+)$")

_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_unicode(raw) -> str:
    if raw is None:
        return ""
    text = unicodedata.normalize("NFKC", str(raw))
    return _UNICODE_MINUS_RE.sub("-", text)


def _to_decimal(text: str) -> Decimal | None:
    """Parse a whitespace-free, unicode-normalized string as a Decimal, but
    only if it is unambiguously a plain number -- never scientific notation,
    never "Infinity"/"NaN" (Decimal() would otherwise happily accept both)."""
    if not text:
        return None
    candidate = text[1:] if text.startswith("+") else text
    candidate = candidate.replace(",", "")  # thousands separators only
    if not _PLAIN_NUMBER_RE.match(candidate):
        return None
    try:
        return Decimal(candidate)
    except (InvalidOperation, ValueError):
        return None


def _split_pair(text: str) -> tuple[str, str] | None:
    """Split text on a single comma into two non-empty halves, or None if
    the shape doesn't match: not exactly one comma in the whole string, or
    either half is empty/whitespace-only after stripping. Requiring exactly
    one comma (not "at least one") is deliberate -- a student who fat-
    fingers a third value ("7,3,1") has not given a reasonable quotient/
    remainder pair, so this must fail closed rather than guess which two
    parts they meant.
    """
    if text.count(",") != 1:
        return None
    left, right = text.split(",", 1)
    left, right = left.strip(), right.strip()
    if not left or not right:
        return None
    return left, right


def _to_decimal_pair(text: str) -> tuple[Decimal, Decimal] | None:
    """Parse text as "quotient, remainder" -- two plain numbers separated by
    a single comma, the shape PM-L4's division-with-remainder concept uses.
    Each half gets the same formatting generosity a lone number does
    (internal whitespace stripped before parsing, leading zeros and decimal
    padding tolerated via _to_decimal) -- "73 , 1", "73,1", and "073, 01"
    must all match "73, 1" exactly as readily as "042" matches "42" for a
    single-number question. Returns None (never raises) if either half
    isn't a plain number, so malformed input always just fails to match
    rather than crashing the grading request.
    """
    parts = _split_pair(text)
    if parts is None:
        return None
    left, right = parts
    left_dec = _to_decimal(_WHITESPACE_RE.sub("", left))
    right_dec = _to_decimal(_WHITESPACE_RE.sub("", right))
    if left_dec is None or right_dec is None:
        return None
    return left_dec, right_dec


def answers_match(correct_answer, student_answer) -> bool:
    """True iff student_answer should be judged equal to correct_answer.

    Tolerates formatting noise only: surrounding/internal whitespace, unicode
    minus variants, a redundant leading "+", leading zeros, decimal padding
    ("5" == "5.0" == "5.00"), and comma thousands-separators. Never tolerates
    an actual difference in value -- correctness is exact Decimal equality,
    with zero rounding/tolerance applied.

    Checks the quotient/remainder pair shape first (see _to_decimal_pair) --
    gated entirely on whether correct_answer itself is a "N, M" pair, so
    this can only ever activate for PM-L4's division-with-remainder concept
    family and changes nothing for any other question type.

    Falls back to an exact (whitespace-collapsed, case-insensitive) string
    compare when neither the pair shape nor a plain number matches on both
    sides, so a future non-numeric, non-paired DPS concept family degrades
    safely instead of crashing or silently always failing.
    """
    correct_raw = _normalize_unicode(correct_answer)
    student_raw = _normalize_unicode(student_answer)

    student_stripped_all_ws = _WHITESPACE_RE.sub("", student_raw)
    if not student_stripped_all_ws:
        return False

    correct_pair = _to_decimal_pair(correct_raw)
    if correct_pair is not None:
        student_pair = _to_decimal_pair(student_raw)
        if student_pair is None:
            return False
        return correct_pair == student_pair

    correct_stripped_all_ws = _WHITESPACE_RE.sub("", correct_raw)

    correct_dec = _to_decimal(correct_stripped_all_ws)
    student_dec = _to_decimal(student_stripped_all_ws)
    if correct_dec is not None and student_dec is not None:
        return correct_dec == student_dec

    # Non-numeric fallback: collapse internal whitespace to single spaces
    # (rather than stripping it entirely) so this doesn't accidentally treat
    # two different words mashed together as equal to two separate words.
    correct_text = _WHITESPACE_RE.sub(" ", correct_raw).strip()
    student_text = _WHITESPACE_RE.sub(" ", student_raw).strip()
    if not student_text:
        return False
    return correct_text.casefold() == student_text.casefold()


def is_complete_plain_number(text) -> bool:
    """True iff text parses as a plain decimal number at all (same lenient
    definition answers_match() uses for grading, including a trailing bare
    "."). This is NOT the same check the frontend uses to decide when to
    auto-advance to the next question -- that's a deliberately stricter,
    purely client-side heuristic (requires digits after any decimal point,
    since the correct answer/length must never be sent to the client
    mid-attempt, so it can only go on typing shape + a pause, not on
    matching length). This helper exists for backend-side use only, e.g.
    input sanity checks that want the same "is this a number at all"
    definition grading uses."""
    if text is None:
        return False
    normalized = _WHITESPACE_RE.sub("", _normalize_unicode(text))
    candidate = normalized[1:] if normalized.startswith("+") else normalized
    candidate = candidate.replace(",", "")
    return bool(_PLAIN_NUMBER_RE.match(candidate))
