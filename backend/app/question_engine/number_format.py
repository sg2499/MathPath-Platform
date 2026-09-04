"""Shared helper: stringify a generated correct-answer/option value for
storage without ever falling back to scientific notation (e.g. "1.61e-05").

Python's default str(float) switches to exponential notation for magnitudes
below 1e-4 (str(float(Decimal('0.0000161').normalize())) == '1.61e-05'), and
answers_match() (see app.services.answer_matching) deliberately rejects
exponential notation typed by a student -- it is not a recognised plain
number. So a small-magnitude correct_answer stored via a plain str(...) call
could never be graded correct by ANY answer a student types, no matter how
many times they retype the exact right value. The frontend's display
formatter (frontend/lib/utils.ts formatAnswerValue) then cosmetically
reformats both the student's plain-decimal answer and the corrupted
scientific-notation correct_answer back into the same plain-decimal string
for display -- which is what made this look like a grading bug ("identical
text scored wrong") rather than a data-storage bug.

2026-09-04 fix for exactly this: IM/MM "Answer Position" questions whose
answer is a small decimal (e.g. position -4 applied to a small number) were
being persisted as "1.61e-05" instead of "0.0000161".

PlainNumberString is deliberately tolerant of already-corrupted input (a
string already in scientific notation) so the exact same function can be
reused, unchanged, by a backfill script to repair existing rows -- it
round-trips any numeric value through Decimal, which never introduces
exponential notation via its own str()/format(..., "f").
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation


def PlainNumberString(value) -> str:
    """Return the plain-decimal string form of value. Never returns
    scientific/exponential notation for anything that parses as a number.
    Non-numeric input (already-plain text, None, etc.) falls back to a
    normal str(), so this is always a safe drop-in replacement for str(...)
    at a correct_answer/option_value persistence site."""
    if value is None or isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        # repr(), not str(): repr gives the shortest round-trippable decimal
        # text for the float, which Decimal(...) then parses exactly -- str()
        # is what introduces exponential notation in the first place.
        return format(Decimal(repr(value)), "f")
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, str):
        try:
            return format(Decimal(value.strip()), "f")
        except (InvalidOperation, ValueError):
            return value
    return str(value)
