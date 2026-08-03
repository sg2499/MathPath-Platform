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

Every DPS concept family across all three modules (YLM, MM, IM -- including
IM's "Answer Position", which is also a plain numeric position value, not a
word/ordinal -- see app/question_engine/im/generator.py's _Display()) stores
correct_answer as a plain number today. answers_match() still falls back to
an exact case-insensitive string compare whenever either side doesn't parse
as a number, purely as a safety net for any future non-numeric DPS concept
family -- it is not exercised by anything currently in production.
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


def answers_match(correct_answer, student_answer) -> bool:
    """True iff student_answer should be judged equal to correct_answer.

    Tolerates formatting noise only: surrounding/internal whitespace, unicode
    minus variants, a redundant leading "+", leading zeros, decimal padding
    ("5" == "5.0" == "5.00"), and comma thousands-separators. Never tolerates
    an actual difference in value -- correctness is exact Decimal equality,
    with zero rounding/tolerance applied.

    Falls back to an exact (whitespace-collapsed, case-insensitive) string
    compare when either side isn't a plain number, so a future non-numeric
    DPS concept family degrades safely instead of crashing or silently
    always failing.
    """
    correct_raw = _normalize_unicode(correct_answer)
    student_raw = _normalize_unicode(student_answer)

    student_stripped_all_ws = _WHITESPACE_RE.sub("", student_raw)
    if not student_stripped_all_ws:
        return False

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
