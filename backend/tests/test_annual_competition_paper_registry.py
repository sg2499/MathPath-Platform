"""2026-09-15 (Shailesh): dedicated coverage for
FormatCompetitionLevelLabel -- the human-facing display-label layer used
across every Annual Competition surface (Official + Practice, admin +
teacher + student). Previously untested directly (only exercised
incidentally through notification-service tests); this locks in the four
special-cased codes (YLM-L0/YLM-L1 from the Beginners/Bloomers phase,
MM-L1/MM-L2 from this phase) plus the pass-through behavior for every other
code, so a future edit to the dict can't silently drop or rename one of
these without a test failing.
"""

from app.services.annual_competition_paper_registry import (
    ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS,
    FormatCompetitionLevelLabel,
)


def test_format_label_renames_bloomers_and_beginners():
    assert FormatCompetitionLevelLabel("YLM-L0") == "Bloomers (Below 8 Years)"
    assert FormatCompetitionLevelLabel("YLM-L1") == "Beginners (Above 8 Years)"


def test_format_label_renames_master_levels():
    assert FormatCompetitionLevelLabel("MM-L1") == "MM-1"
    assert FormatCompetitionLevelLabel("MM-L2") == "MM-2"


def test_format_label_passes_through_every_other_code():
    for LevelCode in ("PM-L1", "PM-L2", "PM-L3", "PM-L4", "IM-L1", "IM-L2", "IM-L3", "IM-L4"):
        assert FormatCompetitionLevelLabel(LevelCode) == LevelCode


def test_format_label_handles_none_and_empty():
    assert FormatCompetitionLevelLabel(None) == ""
    assert FormatCompetitionLevelLabel("") == ""


def test_display_labels_dict_has_exactly_the_four_expected_entries():
    # A change here should be deliberate, not an accidental addition/removal
    # -- this test exists precisely so that happens with a visible diff.
    assert ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS == {
        "YLM-L0": "Bloomers (Below 8 Years)",
        "YLM-L1": "Beginners (Above 8 Years)",
        "MM-L1": "MM-1",
        "MM-L2": "MM-2",
    }
