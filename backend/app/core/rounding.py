"""Whole-percent rounding shared by every average on the platform.

Python's round() rounds halves to the nearest even number (round(42.5) is
42, round(43.5) is 44), while the browser's Math.round() always rounds
halves up (42.5 -> 43). An average worked out on the server and the same
average worked out in the browser could therefore differ by 1% (found
2026-10-14: one student showed 42% on the leaderboard and 43% on My
Students). Averages use this instead, so both sides agree.
"""
from __future__ import annotations

import math


def round_half_up(value: float | int | None) -> int:
    if value is None:
        return 0
    return int(math.floor(float(value) + 0.5))
