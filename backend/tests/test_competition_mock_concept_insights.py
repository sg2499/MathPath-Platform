"""Regression coverage for the 2026-07-19 competition-mock Strengths/Areas to
Improve fixes.

Two separate things are covered here:

1. Threshold dead zone: _section_performance_from_review() and the
   equivalent concept_totals loop in SubmitCompetitionMockAttempt() used to
   split strengths at >=75% and weaknesses at <60%, leaving a silent 60-74%
   dead zone where a section or concept appeared in neither list -- even
   though every UI label advertises a single 70% cutoff ("Strengths >= 70%
   Accuracy" / "Areas to Improve < 70% Accuracy").
2. Concept identity: Strengths/Areas to Improve must show the individual,
   student-recognizable concept (e.g. "BODMAS", "2D × 2D Multiplication"),
   not a broad section rollup -- but a small, confirmed set of synthetic
   generator-only labels ("BODMAS Competition Challenge" and similar) must
   collapse down to the one real concept name they actually represent. See
   _canonical_competition_concept_name()'s docstring in
   competition_mock_attempt_service.py for the full reasoning.
"""

from types import SimpleNamespace

from app.services.competition_mock_attempt_service import (
    _canonical_competition_concept_name,
    _section_performance_from_review,
)


def _question(concept_tag: str, section_title: str = "Section 8 - BODMAS, Solve Equation, Add/Less Percentage", section_number: int = 8) -> SimpleNamespace:
    return SimpleNamespace(concept_tag=concept_tag, concept_family=None, section_title=section_title, section_number=section_number)


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


def test_synthetic_bodmas_variants_all_collapse_to_plain_bodmas():
    # Reproduces the 2026-07-19 live screenshot: MM_BODMAS_PERCENTAGE's two
    # BODMAS sub-generators and IM's "with Square Term" variant each stamp a
    # verbose, synthetic competitionConceptKey -- but there's no such thing
    # as multiple different "BODMAS" concepts in the curriculum (confirmed
    # against seed_master_module.py's real DPS lesson titles, which only
    # ever say plain "BODMAS" / "BODMAS (Visual)"). All three must resolve
    # to the one real concept name.
    names = {
        _canonical_competition_concept_name(_question("BODMAS Competition Challenge")),
        _canonical_competition_concept_name(_question("BODMAS Square Root Decimal Percentage Challenge")),
        _canonical_competition_concept_name(_question("BODMAS with Square Term")),
    }
    assert names == {"BODMAS"}


def test_solve_equation_challenge_becomes_plain_solve_equation():
    assert _canonical_competition_concept_name(_question("Solve Equation Competition Challenge")) == "Solve Equation"


def test_percentage_challenge_variants_stay_as_three_distinct_real_concepts():
    # Unlike BODMAS, "Add Percentage", "Less Percentage", and "Add-Less
    # Percentage" are genuinely distinct real concepts (confirmed against
    # seed_master_module.py, which lists "Add Percentage" and "Less
    # Percentage" as separate DPS lesson topics) -- they must NOT collapse
    # into each other just because they share a synthetic "... Challenge"
    # suffix and the same conceptFamily.
    add_name = _canonical_competition_concept_name(_question("Add Percentage Challenge"))
    less_name = _canonical_competition_concept_name(_question("Less Percentage Challenge"))
    add_less_name = _canonical_competition_concept_name(_question("Add-Less Percentage Challenge"))

    assert add_name == "Add Percentage"
    assert less_name == "Less Percentage"
    assert add_less_name == "Add-Less Percentage"
    assert len({add_name, less_name, add_less_name}) == 3


def test_already_clean_concept_names_pass_through_unchanged():
    # Most competition concept titles (digit-pattern multiplication/division
    # variants, Add/Less variants, Squares, Cubes, etc.) are already real,
    # individually distinct DPS-recognized names and must not be touched by
    # the override map.
    for real_name in ["2D × 2D Multiplication", "Cube Root 5 Digit Number", "Skill Stacker", "Mixed Digit Add-Less"]:
        assert _canonical_competition_concept_name(_question(real_name)) == real_name


def test_section_performance_groups_by_individual_concept_not_by_section():
    # Two different real concepts in the same section (BODMAS and Solve
    # Equation both live in Section 8) must appear as two separate buckets,
    # not get rolled up into one "Section 8" bucket -- a student needs to see
    # exactly which of the two they're weak in.
    review = (
        [
            {"sectionNumber": 8, "sectionTitle": "Section 8 - BODMAS, Solve Equation, Add/Less Percentage", "concept": "BODMAS", "isCorrect": index < 9}
            for index in range(10)
        ]
        + [
            {"sectionNumber": 8, "sectionTitle": "Section 8 - BODMAS, Solve Equation, Add/Less Percentage", "concept": "Solve Equation", "isCorrect": index < 3}
            for index in range(10)
        ]
    )

    performance, strengths, weaknesses = _section_performance_from_review(review)

    concepts = {item["concept"] for item in performance}
    assert concepts == {"BODMAS", "Solve Equation"}
    assert {item["concept"] for item in strengths} == {"BODMAS"}
    assert {item["concept"] for item in weaknesses} == {"Solve Equation"}
    # sectionTitle is still carried on each bucket so the frontend can jump
    # to the right spot in the Question Review tab even though display now
    # groups by concept, not section.
    for item in performance:
        assert item["sectionTitle"] == "Section 8 - BODMAS, Solve Equation, Add/Less Percentage"
