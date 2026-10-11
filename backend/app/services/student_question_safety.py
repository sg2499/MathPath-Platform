"""What a question may carry to a student's browser while a paper is open
(2026-10-11, Shailesh).

Questions are stored with their generator's working notes in metadata_json:
for some kinds those notes hold the answer itself (a remainder question's
quotient and remainder, a square root's root, the underlying product of a
division, golden step traces...). The student screens only ever read the
question's text and its section from metadata, so that is all that is sent.
Results and reviews, shown after a paper is submitted, are not affected.

answer_format() tells the answer box what shape of answer to expect without
saying anything about its value: "QUOTIENT_REMAINDER" for a division with a
remainder (typed "12, 3"), else None. The question itself already shows it is
such a division, so this gives nothing away.
"""
from __future__ import annotations

import re
from typing import Any

STUDENT_SAFE_METADATA_KEYS = frozenset({
    "question_text",
    "questionText",
    "section_number",
    "sectionNumber",
    "section_title",
    "sectionTitle",
    "dps_total_sections",
    "dpsTotalSections",
    "assessmentSectionNumber",
    "assessmentSectionTitle",
})

_PAIR_RE = re.compile(r"^\s*-?\d+\s*,\s*\d+\s*$")


def student_safe_metadata(metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return {key: value for key, value in metadata.items() if key in STUDENT_SAFE_METADATA_KEYS}


def answer_format(correct_answer: Any) -> str | None:
    return "QUOTIENT_REMAINDER" if _PAIR_RE.match(str(correct_answer or "")) else None
