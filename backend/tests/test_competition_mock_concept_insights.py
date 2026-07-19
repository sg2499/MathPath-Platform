"""Regression coverage for the 2026-07-19 strengths/weaknesses threshold bug.

_section_performance_from_review() and the equivalent concept_totals loop in
SubmitCompetitionMockAttempt() used to split strengths at >=75% and
weaknesses at <60%, leaving a silent 60-74% dead zone where a section or
concept appeared in neither list -- even though every UI label advertises a
single 70% cutoff ("Strengths >= 70% Accuracy" / "Areas to Improve < 70%
Accuracy"). This is a pure-function test against the real section
percentages found live in production (60%, 70%, 70%, 40%) that first
surfaced the bug: before the fix, the 60% and both 70% sections were
invisible in both buckets.
"""

from types import SimpleNamespace

from app.services.competition_mock_attempt_service import _competition_section_title, _section_performance_from_review


def _section_review(section_number: int, title: str, correct: int, total: int) -> list[dict]:
    return [
        {"sectionNumber": section_number, "sectionTitle": title, "isCorrect": index < correct}
        for index in range(total)
    ]


def test_every_section_lands_in_exactly_one_bucket_no_dead_zone():
    review = (
        _section_review(5, "Positional & Placement", 7, 10)  # 70%
        + _section_review(8, "BODMAS, Solve Equation, Add/Less Percentage", 6, 10)  # 60%
        + _section_review(9, "Profit/Loss, Simple Interest, Selling Price", 7, 10)  # 70%
        + _section_review(10, "Skill Stacker, Concept Drill", 4, 10)  # 40%
    )

    performance, strengths, weaknesses = _section_performance_from_review(review)

    classified = {item["concept"] for item in strengths} | {item["concept"] for item in weaknesses}
    all_sections = {item["concept"] for item in performance}
    assert classified == all_sections, "every section must appear in exactly one bucket -- no dead zone"


def test_seventy_percent_is_a_strength_sixty_nine_is_a_weakness():
    review = _section_review(1, "Exactly Seventy", 7, 10) + _section_review(2, "Just Under Seventy", 69, 100)

    _, strengths, weaknesses = _section_performance_from_review(review)

    assert {item["concept"] for item in strengths} == {"Exactly Seventy"}
    assert {item["concept"] for item in weaknesses} == {"Just Under Seventy"}


def test_sixty_percent_no_longer_falls_in_the_old_dead_zone():
    # This is the exact regression case: 60% used to satisfy neither
    # >=75 (strength) nor <60 (weakness) under the old thresholds.
    review = _section_review(1, "Sixty Percent Section", 6, 10)

    _, strengths, weaknesses = _section_performance_from_review(review)

    assert strengths == []
    assert len(weaknesses) == 1
    assert weaknesses[0]["concept"] == "Sixty Percent Section"
    assert weaknesses[0]["percentage"] == 60


def test_bodmas_challenge_subconcepts_all_collapse_into_one_section_bucket():
    # Reproduces the 2026-07-19 live screenshot: six MM_BODMAS_PERCENTAGE
    # sub-concept generators (competition_mock_generation_service.py's
    # MM_COMPETITION_SECTION_CONCEPT_POOLS["MM_BODMAS_PERCENTAGE"]) each stamp
    # a distinct fine-grained competitionConceptKey ("BODMAS Competition
    # Challenge", "Solve Equation Competition Challenge", etc.) -- but the
    # generation loop (_CollectMmCompetitionSectionLockedQuestions /
    # _CollectImCompetitionSectionLockedQuestions) unconditionally overwrites
    # every one of those questions' persisted section_title with the single
    # canonical section title before the row is ever created. So
    # _competition_section_title(), which _every_ concept-grouping call site
    # in this file uses, must return that ONE canonical title for all six --
    # never the fine-grained sub-concept name. If this ever regresses (e.g. a
    # future generator sets question.section_title from its own
    # competitionConceptKey instead of the section's title), a student would
    # see fragmented, unrecognizable "Challenge" names again instead of the
    # one real section name, which is exactly what looked "malicious" in the
    # live screenshot.
    canonical_title = "Section 8 - BODMAS, Solve Equation, Add/Less Percentage"
    fine_grained_concept_keys = [
        "BODMAS Competition Challenge",
        "BODMAS Square Root Decimal Percentage Challenge",
        "Solve Equation Competition Challenge",
        "Add Percentage Challenge",
        "Less Percentage Challenge",
        "Add-Less Percentage Challenge",
    ]

    resolved_titles = {
        _competition_section_title(
            SimpleNamespace(section_title=canonical_title, section_number=8, metadata={"competitionConceptKey": key})
        )
        for key in fine_grained_concept_keys
    }

    assert resolved_titles == {canonical_title}, (
        "all six BODMAS-section sub-concepts must group under the one canonical "
        "section title, not fragment into per-generator 'Challenge' names"
    )
