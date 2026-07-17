from app.question_engine.mm.curriculum_map import MM_CURRICULUM_MAP


PERCENTAGE_VISUAL_EXPECTATIONS = {
    (12, 3): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (12, 4): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (12, 5): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (13, 3): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (13, 4): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (13, 5): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (14, 1): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (14, 2): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (14, 3): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (14, 4): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (15, 1): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (15, 2): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (15, 4): {"Less Percentage (Visual)"},
    (18, 5): {"Less Percentage (Visual)"},
    (19, 2): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (20, 2): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (23, 4): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (23, 5): {"Less Percentage (Visual)"},
    (27, 3): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
    (29, 1): {"Add Percentage (Visual)", "Less Percentage (Visual)"},
}


def _section_titles(lesson_number: int, dps_number: int) -> set[str]:
    return {
        str(section["sectionTitle"])
        for section in MM_CURRICULUM_MAP[lesson_number][dps_number]
    }


def test_workbook_percentage_visual_mappings_are_displayed():
    for key, expected_titles in PERCENTAGE_VISUAL_EXPECTATIONS.items():
        lesson_number, dps_number = key
        titles = _section_titles(lesson_number, dps_number)
        assert expected_titles <= titles, f"L{lesson_number} DPS {dps_number}: {titles}"


def test_non_visual_percentage_sheet_stays_plain():
    assert {"Add Percentage", "Less Percentage"} <= _section_titles(17, 2)


def test_visual_borrowing_add_less_uses_visual_flag():
    for lesson_number, dps_number in [(1, 3), (2, 3), (3, 5)]:
        borrowing_section = MM_CURRICULUM_MAP[lesson_number][dps_number][0]
        assert borrowing_section["sectionTitle"] == "Borrowing Sums with Negative Answers (Visual)"
        assert borrowing_section["isVisual"] is True
