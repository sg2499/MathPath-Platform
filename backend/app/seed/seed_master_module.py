import json
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module
from app.question_engine.mm.config import ClassifyMmConcept, OperationFocusForConcept

MODULE_CODE = "MM"
MODULE_NAME = "Master Module"
MODULE_DESCRIPTION = "Advanced MathPath Master Module practice curriculum."
MODULE_DISPLAY_ORDER = 5

LEVEL_CODE = "MM-L1"
LEVEL_NAME = "Master Module Level 1"
LEVEL_INTERNAL_NUMBER = 1
LEVEL_DISPLAY_ORDER = 1

DPS_DURATION_SECONDS = 5 * 60
DPS_PER_LESSON = 5

# MathPath module hierarchy convention:
# 1. Young Learners Module
# 2. Preparatory Module
# 3. Bridge Module
# 4. Intermediate Module
# 5. Master Module
MODULE_ORDER = {
    "YLM": 1,
    "PM": 2,
    "PREP": 2,
    "BM": 3,
    "BRIDGE": 3,
    "IM": 4,
    "MM": 5,
}

LESSON_TITLES = {
    1: 'Add-Less, BODMAS, Borrowing (Negative Answers), Decimal Add-Less, Division, Integers, Multiplication & Squares',
    2: 'Add-Less, BODMAS, Borrowing (Negative Answers), Decimal Add-Less, Division, Equation Solving, Integers, Multiplication & Squares',
    3: 'Add-Less, Borrowing (Negative Answers), Concept Drill, Decimal Add-Less, Division, Multiplication, Skill Stacker & Squares',
    4: 'Add-Less, BODMAS, Concept Drill, Decimal Add-Less, Equation Solving, Integers, Multiplication & Number Position',
    5: 'BODMAS, Borrowing (Negative Answers), Decimal Answer Position, Division, Equation Solving, Integers, Multiplication, Number Position & Skill Stacker',
    6: 'Add-Less, BODMAS, Decimal Add-Less, Decimal Answer Position, Division, Equation Solving, Multiplication & Squares',
    7: 'Add-Less, Decimal Answer Position, Decimal Multiplication, Division, Integers & Multiplication',
    8: 'Add-Less, Concept Drill, Decimal Multiplication, Division, Mixed Operations, Multiplication & Skill Stacker',
    9: 'Borrowing (Mixed), Concept Drill, Decimal Multiplication, Division, Equation Solving, Mixed Operations, Multiplication, Number Position & Skill Stacker',
    10: 'Add-Less, Answer Position, BODMAS, Concept Drill, Decimal Multiplication, Division, Multiplication, Skill Stacker & Squares',
    11: 'BODMAS, Decimal Division, Decimal Multiplication, Division, Equation Solving, Mixed Operations, Number Position, Skill Stacker & Squares',
    12: 'Decimal Division, Decimal Multiplication, Mixed Operations, Multiplication & Percentage',
    13: 'Decimal Division, Decimal Multiplication, Mixed Operations, Multiplication & Percentage',
    14: 'Percentage & Simple Interest',
    15: 'Decimal Division, Percentage & Simple Interest',
    16: 'BODMAS, Concept Drill, Cubes, Integers, Mixed Operations, Profit & Loss, Skill Stacker & Squares',
    17: 'Cube Root, Decimal Division, Decimal Multiplication, Division, Multiplication, Percentage, Profit & Loss & Simple Interest',
    18: 'Cube Root, Decimal Division, Decimal Multiplication, Mixed Operations & Percentage',
    19: 'BODMAS, Concept Drill, Cube Root, Cubes, Decimal Division, Percentage, Simple Interest, Skill Stacker & Squares',
    20: 'Cube Root, Cubes, Decimal Division, Decimal Multiplication, Percentage, Profit & Loss, Simple Interest & Squares',
    21: 'Add-Less, BODMAS, Decimal Division, Division, Multiplication & Simple Interest',
    22: 'BODMAS, Borrowing (Mixed), Cube Root, Decimal Division, Decimal Multiplication, Division, Multiplication & Skill Stacker',
    23: 'BODMAS, Concept Drill, Division, Mixed Operations, Multiplication, Percentage & Skill Stacker',
    24: 'Add-Less, Cube Root, Cubes, Decimal Division, Decimal Multiplication, Profit & Loss, Selling Price, Simple Interest & Squares',
    25: 'Mixed Operations, Multiplication, Profit & Loss, Skill Stacker & Square Root',
    26: 'Cube Root, Cubes, Division, Multiplication, Profit & Loss, Selling Price, Simple Interest, Square Root & Squares',
    27: 'BODMAS, Percentage, Profit & Loss, Selling Price & Square Root',
    28: 'Concept Drill, Cube Root, Cubes, Decimal Division, Decimal Multiplication, Division, Multiplication, Skill Stacker, Square Root & Squares',
    29: 'Division, Multiplication, Percentage, Profit & Loss, Selling Price & Simple Interest',
    30: 'Cube Root, Decimal Division, Division, Multiplication, Profit & Loss & Square Root',
}

DPS_TITLES = {
    1: {
        1: 'Decimal Number Add-Less, 2D × 2D Visual & 4D ÷ 2D Visual',
        2: 'Add-Less, 2D × 2D Visual & 4D ÷ 2D Visual',
        3: 'Borrowing Sums with Negative Answers, 3D × 2D Visual & 4D ÷ 3D Visual',
        4: 'Integers, Squares & 4D ÷ 3D Visual',
        5: '2 Digit Number Add-Less (Fast Visualisation) & BODMAS',
    },
    2: {
        1: 'Decimal Number Add-Less, 2D × 2D Visual & 4D ÷ 2D Visual',
        2: 'Add-Less, 2D × 2D Visual & 4D ÷ 2D Visual',
        3: 'Borrowing Sums with Negative Answers, 3D × 2D Visual & 5D ÷ 2D Visual',
        4: 'Integers, Squares & 4D ÷ 3D Visual',
        5: '2 Digit Number Add-Less (Fast Visualisation), BODMAS & Solve Equation',
    },
    3: {
        1: 'Decimal Number Add-Less, Skill Stacker & Concept Drill',
        2: '2D × 2D & 4D ÷ 2D Visual',
        3: '3D × 2D & 5D ÷ 2D Visual',
        4: 'Add-Less, Squares & 4D ÷ 3D Visual',
        5: 'Borrowing Sums with Negative Answers & 4D ÷ 3D Visual',
    },
    4: {
        1: 'Integers & 3D × 2D Visual',
        2: '2 Digit Number Add-Less (Fast Visualisation) & 2D × 2D Visual',
        3: 'BODMAS & Concept Drill',
        4: 'Decimal Number Add-Less',
        5: 'BODMAS, Solve Equation & Write the Number from the Given Position',
    },
    5: {
        1: 'Borrowing Sums with Negative Answers & BODMAS',
        2: '4D ÷ 3D Visual & Skill Stacker',
        3: '2D × 2D & 4D ÷ 2D Visual',
        4: 'Integers & Find the Position of the First Natural Number',
        5: 'Find the Position for Decimal Number Multiplication Answer Placement & Solve Equation',
    },
    6: {
        1: 'Decimal Number Add-Less & 2D × 2D Visual',
        2: 'Find the Position for Decimal Number Multiplication Answer Placement & Solve Equation',
        3: 'Squares & 4D ÷ 3D',
        4: 'Add-Less',
        5: 'BODMAS',
    },
    7: {
        1: '4D ÷ 3D & 5D ÷ 2D Visual',
        2: 'Add-Less & Find the Position for Decimal Number Multiplication Answer Placement',
        3: '2D × 2D & 4D ÷ 3D Visual',
        4: 'Integers',
        5: 'Decimal Multiplication & 4D ÷ 2D Visual',
    },
    8: {
        1: '2 Digit Number Add-Less (Fast Visualisation)',
        2: 'Decimal Multiplication & Multiplication Mixed Pattern',
        3: 'Skill Stacker & Concept Drill',
        4: '2D × 2D & 4D ÷ 3D Visual',
        5: '5D ÷ 2D & Decimal Multiplication Visual',
    },
    9: {
        1: '5D ÷ 2D & Decimal Multiplication Visual',
        2: 'Skill Stacker & Concept Drill',
        3: '3D × 2D & 4D × 3D Visual',
        4: 'Borrowing Sums with Positive / Negative Answers, Find the Position of the First Natural Number & Solve Equation',
        5: 'Multiplication & Division Mixed Pattern',
    },
    10: {
        1: 'Squares & 4D ÷ 3D',
        2: '3 Digit Add-Less (Fast Visualisation) & BODMAS',
        3: 'Decimal Multiplication & Write the Number from the Given Position',
        4: '5D ÷ 3D & 3D × 2D Visual',
        5: 'Squares, Skill Stacker & Concept Drill',
    },
    11: {
        1: 'Find the Position of the First Natural Number, Solve Equation & Decimal Multiplication',
        2: 'Decimal Multiplication & Skill Stacker',
        3: 'Multiplication Mixed Pattern & Skill Stacker',
        4: 'Squares, 5D ÷ 2D & 5D ÷ 3D',
        5: 'BODMAS & Division of Decimal Numbers',
    },
    12: {
        1: 'Division of Decimal Numbers & Decimal Number Multiplication',
        2: 'Multiplication & Division Mixed Pattern',
        3: 'Add Percentage & Less Percentage',
        4: 'Add Percentage & Less Percentage',
        5: 'Add Percentage & Less Percentage',
    },
    13: {
        1: 'Division of Decimal Numbers & Decimal Number Multiplication',
        2: 'Multiplication & Division Mixed Pattern',
        3: 'Add Percentage & Less Percentage',
        4: 'Add Percentage & Less Percentage',
        5: 'Add Percentage & Less Percentage',
    },
    14: {
        1: 'Add Percentage & Less Percentage',
        2: 'Add Percentage & Less Percentage',
        3: 'Add Percentage & Less Percentage',
        4: 'Add Percentage & Less Percentage',
        5: 'Simple Interest & Less Percentage',
    },
    15: {
        1: 'Add Percentage & Less Percentage',
        2: 'Add Percentage & Less Percentage',
        3: 'Simple Interest',
        4: 'Division of Decimal Numbers & Less Percentage',
        5: 'Simple Interest',
    },
    16: {
        1: 'Integers & Concept Drill',
        2: 'Squares & Cubes',
        3: 'Profit-Loss & Skill Stacker',
        4: 'Multiplication Mixed Pattern & BODMAS',
        5: 'BODMAS & Concept Drill',
    },
    17: {
        1: 'Division of Decimal Numbers & Decimal Number Multiplication',
        2: 'Add Percentage & Less Percentage',
        3: 'Simple Interest & Profit-Loss',
        4: '3D × 3D & 4D ÷ 3D Visual',
        5: 'Cube Root of 4 Digit Number',
    },
    18: {
        1: 'Cube Root of 5 Digit Numbers',
        2: 'Cube Root of 6 Digit Numbers',
        3: 'Cube Root of Mixed Digit',
        4: 'Division of Decimal Numbers & Decimal Number Multiplication',
        5: 'Multiplication Mixed Pattern & Less Percentage',
    },
    19: {
        1: 'Squares, Cubes, Skill Stacker & Concept Drill',
        2: 'Add Percentage & Less Percentage',
        3: 'Cube Root of Mixed Digit',
        4: 'BODMAS & Concept Drill',
        5: 'Division of Decimal Numbers & Simple Interest',
    },
    20: {
        1: 'Division of Decimal Numbers & Decimal Number Multiplication',
        2: 'Add Percentage & Less Percentage',
        3: 'Squares & Cubes',
        4: 'Simple Interest & Profit-Loss',
        5: 'Cubes, Squares & Cube Root',
    },
    21: {
        1: 'Mixed Digit Add-Less',
        2: '4D × 3D & 5D ÷ 3D',
        3: '5D × 3D & 4D ÷ 2D',
        4: 'Simple Interest & Decimal Division',
        5: 'BODMAS',
    },
    22: {
        1: 'BODMAS',
        2: 'Division of Decimal Numbers & Decimal Number Multiplication',
        3: 'Borrowing Sums with Positive / Negative Answers & Skill Stacker',
        4: '3D × 3D & 6D ÷ 3D',
        5: 'Division of Decimal Numbers & 6 Digit Number Cube Root',
    },
    23: {
        1: 'Skill Stacker & Concept Drill',
        2: 'BODMAS',
        3: '3D × 3D & 6D ÷ 3D',
        4: 'Add Percentage & Less Percentage',
        5: 'Multiplication Mixed Pattern & Less Percentage',
    },
    24: {
        1: 'Profit-Loss & Selling Price',
        2: 'Simple Interest',
        3: 'Cubes, Squares & Cube Root',
        4: 'Division of Decimal Numbers & Decimal Number Multiplication',
        5: 'Add-Less',
    },
    25: {
        1: 'Square Root 3 & 4 Digit Number',
        2: 'Profit-Loss & Skill Stacker',
        3: '4D × 2D & 3D × 3D Visual',
        4: 'Profit-Loss',
        5: 'Multiplication & Division Mixed Pattern',
    },
    26: {
        1: 'Square Root - 4 Digit Number',
        2: 'Cubes, Squares & Cube Root',
        3: '3D × 3D & 4D ÷ 3D Visual',
        4: 'Simple Interest',
        5: 'Profit-Loss & Selling Price',
    },
    27: {
        1: 'Square Root - 5 Digit Number',
        2: 'Profit-Loss & Selling Price',
        3: 'Add Percentage & Less Percentage',
        4: 'Profit & Loss',
        5: 'BODMAS',
    },
    28: {
        1: 'Cubes, Squares, Cube Root & Square Root',
        2: 'Multiplication by 3D & 5D × 2D',
        3: 'Division of Decimal Numbers & Decimal Number Multiplication',
        4: '5D ÷ 3D & 6D ÷ 3D Visual',
        5: 'Concept Drill & Skill Stacker',
    },
    29: {
        1: 'Add Percentage & Less Percentage',
        2: 'Profit-Loss & Selling Price',
        3: 'Profit & Loss',
        4: 'Simple Interest & Profit-Loss',
        5: '3D × 3D & 6D ÷ 3D',
    },
    30: {
        1: 'Profit & Loss',
        2: 'Square Root - 5 Digit Number',
        3: 'Square Root - 6 Digit Number',
        4: 'Division of Decimal Numbers & Cube Root',
        5: '3D × 3D & 6D ÷ 3D',
    },
}


# Section-aware workbook structure. This map stores exact/special splits identified from the MM workbook audit.
# DPS records not present here fall back to a conservative title-derived split.
# Section map supports Package 5 concepts as dedicated sections wherever they appear in workbook sheets.
MM_DPS_SECTION_OVERRIDES = {
    # Exact pattern-specific multiplication/division sheets from MM workbook audit.
    # These must not route through generic mixed multiplication/division pools.
    (21, 2): [
        {"sectionTitle": "4D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "5D ÷ 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (21, 3): [
        {"sectionTitle": "5D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 2D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (22, 4): [
        {"sectionTitle": "3D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "6D ÷ 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (23, 3): [
        {"sectionTitle": "3D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "6D ÷ 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (29, 5): [
        {"sectionTitle": "3D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "6D ÷ 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (30, 5): [
        {"sectionTitle": "3D × 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "6D ÷ 3D", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    # Lessons 1-2 Excel workbook sheets: each DPS carries multiple workbook sections.
    (1, 1): [
        {"sectionTitle": "Decimal Number Add-Less (Visual)", "questionCount": 10, "conceptFamily": "DECIMAL_ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (1, 2): [
        {"sectionTitle": "Add-Less (Visual)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (1, 3): [
        {"sectionTitle": "Borrowing Sums with Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_NEGATIVE"},
        {"sectionTitle": "3D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 3D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (1, 4): [
        {"sectionTitle": "Integers", "questionCount": 10, "conceptFamily": "INTEGERS"},
        {"sectionTitle": "Squares", "questionCount": 10, "conceptFamily": "SQUARES"},
        {"sectionTitle": "4D ÷ 3D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (1, 5): [
        {"sectionTitle": "2 Digit Number Add-Less (Fast Visualisation)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 10, "conceptFamily": "BODMAS"},
    ],
    (2, 1): [
        {"sectionTitle": "Decimal Number Add-Less (Visual)", "questionCount": 10, "conceptFamily": "DECIMAL_ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (2, 2): [
        {"sectionTitle": "Add-Less (Visual)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "4D ÷ 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (2, 3): [
        {"sectionTitle": "Borrowing Sums with Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_NEGATIVE"},
        {"sectionTitle": "3D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
        {"sectionTitle": "5D ÷ 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (2, 4): [
        {"sectionTitle": "Integers", "questionCount": 10, "conceptFamily": "INTEGERS"},
        {"sectionTitle": "Squares", "questionCount": 10, "conceptFamily": "SQUARES"},
        {"sectionTitle": "4D ÷ 3D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (2, 5): [
        {"sectionTitle": "2 Digit Number Add-Less (Fast Visualisation)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
    ],

    # Image workbook sheets with missing secondary sections in the platform map.
    (3, 1): [
        {"sectionTitle": "Decimal Number Add-Less (Visual)", "questionCount": 10, "conceptFamily": "DECIMAL_ADD_LESS"},
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (3, 4): [
        {"sectionTitle": "Add-Less (Visual)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "Squares", "questionCount": 10, "conceptFamily": "SQUARES"},
        {"sectionTitle": "4D ÷ 3D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (3, 5): [
        {"sectionTitle": "Borrowing Sums with Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_NEGATIVE"},
        {"sectionTitle": "4D ÷ 3D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_DIVISION"},
    ],
    (4, 2): [
        {"sectionTitle": "2 Digit Number Add-Less (Fast Visualisation)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
    ],
    (4, 3): [
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (4, 5): [
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
        {"sectionTitle": "Write the Number from the Given Position", "questionCount": 5, "conceptFamily": "NUMBER_POSITION"},
    ],
    (5, 1): [
        {"sectionTitle": "Borrowing Sums with Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_NEGATIVE"},
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
    ],
    (5, 4): [
        {"sectionTitle": "Integers", "questionCount": 10, "conceptFamily": "INTEGERS"},
        {"sectionTitle": "Find the Position of the First Natural Number", "questionCount": 5, "conceptFamily": "NUMBER_POSITION"},
    ],
    (5, 5): [
        {"sectionTitle": "Find the Position for Decimal Number Multiplication Answer Placement", "questionCount": 5, "conceptFamily": "DECIMAL_MULTIPLICATION_ANSWER_POSITION"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
    ],
    (6, 1): [
        {"sectionTitle": "Decimal Number Add-Less (Visual)", "questionCount": 10, "conceptFamily": "DECIMAL_ADD_LESS"},
        {"sectionTitle": "2D × 2D Visual", "questionCount": 10, "conceptFamily": "WHOLE_NUMBER_MULTIPLICATION"},
    ],
    (6, 2): [
        {"sectionTitle": "Find the Position for Decimal Number Multiplication Answer Placement", "questionCount": 5, "conceptFamily": "DECIMAL_MULTIPLICATION_ANSWER_POSITION"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
    ],
    (7, 2): [
        {"sectionTitle": "Add-Less (Visual)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "Find the Position for Decimal Number Multiplication Answer Placement", "questionCount": 5, "conceptFamily": "DECIMAL_MULTIPLICATION_ANSWER_POSITION"},
    ],
    (9, 2): [
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (9, 4): [
        {"sectionTitle": "Borrowing Sums with Positive / Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_MIXED"},
        {"sectionTitle": "Find the Position of the First Natural Number", "questionCount": 5, "conceptFamily": "NUMBER_POSITION"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
    ],
    (10, 2): [
        {"sectionTitle": "3 Digit Add-Less (Fast Visualisation)", "questionCount": 10, "conceptFamily": "ADD_LESS"},
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
    ],
    (11, 1): [
        {"sectionTitle": "Find the Position of the First Natural Number", "questionCount": 5, "conceptFamily": "NUMBER_POSITION"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "SOLVE_EQUATION"},
        {"sectionTitle": "Decimal Multiplication", "questionCount": 10, "conceptFamily": "DECIMAL_MULTIPLICATION"},
    ],
    (11, 5): [
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Division of Decimal Numbers", "questionCount": 10, "conceptFamily": "DECIMAL_DIVISION"},
    ],
    (16, 1): [
        {"sectionTitle": "Integers", "questionCount": 10, "conceptFamily": "INTEGERS"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (16, 5): [
        {"sectionTitle": "BODMAS", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (19, 1): [
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (19, 4): [
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (19, 5): [
        {"sectionTitle": "Division of Decimal Numbers", "questionCount": 5, "conceptFamily": "DECIMAL_DIVISION"},
        {"sectionTitle": "Simple Interest", "questionCount": 5, "conceptFamily": "SIMPLE_INTEREST"},
    ],
    (20, 5): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
    (22, 3): [
        {"sectionTitle": "Borrowing Sums with Positive / Negative Answers", "questionCount": 10, "conceptFamily": "BORROWING_MIXED"},
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
    ],
    (23, 1): [
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
    ],
    (24, 3): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
    (26, 2): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
    (28, 1): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
        {"sectionTitle": "Square Root", "questionCount": 5, "conceptFamily": "SQUARE_ROOT"},
    ],
    (28, 5): [
        {"sectionTitle": "Concept Drill", "questionCount": 5, "conceptFamily": "CONCEPT_DRILL"},
        {"sectionTitle": "Skill Stacker", "questionCount": 5, "conceptFamily": "SKILL_STACKER"},
    ],
}

SECTION_TITLE_NORMALISATIONS = {
    "add percentage": "Add Percentage",
    "less percentage": "Less Percentage",
    "profit loss": "Profit-Loss",
    "profit-loss": "Profit-Loss",
    "simple interest": "Simple Interest",
    "bodmas": "BODMAS",
    "integers": "Integers",
    "squares": "Squares",
    "cubes": "Cubes",
    "cube root": "Cube Root",
    "square root": "Square Root",
    "decimal number multiplication": "Decimal Number Multiplication",
    "decimal multiplication": "Decimal Multiplication",
    "decimal number add less": "Decimal Number Add-Less",
    "add less": "Add-Less",
    "skill stacker": "Skill Stacker",
    "skill stacker visual": "Skill Stacker",
    "concept drill": "Concept Drill",
    "concept drill abacus": "Concept Drill",
    "borrowing sums with negative answers": "Borrowing Sums with Negative Answers",
    "borrowing sums with negative answers visual": "Borrowing Sums with Negative Answers",
    "borrowing sums with positive answers": "Borrowing Sums with Positive Answers",
    "borrowing sums with positive answers visual": "Borrowing Sums with Positive Answers",
    "borrowing sums with positive negative answers": "Borrowing Sums with Positive / Negative Answers",
    "borrowing sums with positive / negative answers": "Borrowing Sums with Positive / Negative Answers",
    "find the position for decimal number multiplication answer placement": "Find the Position for Decimal Number Multiplication Answer Placement",
    "find the position of the first natural number": "Find the Position of the First Natural Number",
    "write the number from the given position": "Write the Number from the Given Position",
    "number position": "Write the Number from the Given Position",
    "solve equation": "Solve Equation",
    "solve the equation": "Solve Equation",
}


def _clean_section_title(value: str) -> str:
    title = " ".join(str(value or "").replace("&", " and ").split())
    title = title.replace("(Visual)", "").replace("(Abacus)", "")
    title = title.replace(" x ", " × ").replace(" X ", " × ").strip()
    lower = title.lower().strip()
    return SECTION_TITLE_NORMALISATIONS.get(lower, title)


def _split_mm_title_parts(title: str) -> list[str]:
    working = f" {title} "
    protected = {
        "Profit and Loss": "Profit-Loss",
        "Profit & Loss": "Profit-Loss",
        "Add-Less": "Add-Less",
        "Add Less": "Add-Less",
        "Mixed Pattern Multiplication": "Multiplication Mixed Pattern",
        "Multiplication Mixed Pattern": "Multiplication Mixed Pattern",
        "Multiplication and Division Mixed Pattern": "Multiplication and Division Mixed Pattern",
        "Division of Decimal Numbers": "Division of Decimal Numbers",
        "Decimal Number Multiplication": "Decimal Number Multiplication",
        "Decimal Number Add-Less": "Decimal Number Add-Less",
        "Simple Interest": "Simple Interest",
        "Selling Price": "Selling Price",
        "Cost Price": "Cost Price",
        "Square Root": "Square Root",
        "Cube Root": "Cube Root",
        "Skill Stacker": "Skill Stacker",
        "Concept Drill": "Concept Drill",
        "Borrowing Sums with Positive / Negative Answers": "Borrowing Sums with Positive Negative Answers",
        "Borrowing Sums with Positive, Negative Answers": "Borrowing Sums with Positive Negative Answers",
        "Borrowing Sums with Negative Answers": "Borrowing Sums with Negative Answers",
        "Borrowing Sums with Positive Answers": "Borrowing Sums with Positive Answers",
        "Find the position for Decimal number Multiplication Answer placement": "Find the Position for Decimal Number Multiplication Answer Placement",
        "Find the Position for Decimal Number Multiplication Answer Placement": "Find the Position for Decimal Number Multiplication Answer Placement",
        "Find the position of the first Natural Number": "Find the Position of the First Natural Number",
        "Write the Number from the Given Position": "Write the Number from the Given Position",
        "Number Position": "Write the Number from the Given Position",
        "Solve the Equation": "Solve Equation",
        "Solve Equation": "Solve Equation",
    }
    for source, target in protected.items():
        working = working.replace(source, target)
    # Treat separators as section boundaries after protecting compound concept names.
    working = working.replace(" / ", " | ").replace(",", " | ")
    working = working.replace(" and ", " | ")
    parts = [_clean_section_title(part) for part in working.split("|") if part.strip()]
    merged: list[str] = []
    for part in parts:
        # Restore workbook-friendly display forms after splitting.
        clean = part.replace("Profit-Loss", "Profit-Loss")
        if clean and clean not in merged:
            merged.append(clean)
    return merged


def _concept_for_section(section_title: str, lesson_title: str) -> str:
    return ClassifyMmConcept(section_title, lesson_title)


def _split_title_into_sections(lesson_number: int, dps_number: int) -> list[dict]:
    override = MM_DPS_SECTION_OVERRIDES.get((lesson_number, dps_number))
    if override:
        return override

    title = _dps_title(lesson_number, dps_number)
    lesson_title = LESSON_TITLES[lesson_number]
    lowered = title.lower()
    parts = _split_mm_title_parts(title)
    if len(parts) <= 1:
        return [{
            "sectionTitle": title,
            "questionCount": int(20 if "visual" in lowered and (" x " in lowered or "÷" in lowered) else 10),
            "conceptFamily": ClassifyMmConcept(title, lesson_title),
        }]

    # Default workbook split for normal two-concept sheets is 10+10.
    # Three-concept sheets default to 10+5+5 unless explicitly overridden as 5+5+5.
    if len(parts) == 2:
        counts = [10, 10]
    elif len(parts) == 3:
        counts = [10, 5, 5]
    else:
        counts = [10] + [5 for _ in parts[1:]]

    return [
        {
            "sectionTitle": section_title,
            "questionCount": counts[index],
            "conceptFamily": _concept_for_section(section_title, lesson_title),
        }
        for index, section_title in enumerate(parts)
    ]


def _dps_sections(lesson_number: int, dps_number: int) -> list[dict]:
    sections = _split_title_into_sections(lesson_number, dps_number)
    return [
        {
            **section,
            "sectionNumber": index,
            "operationFocus": OperationFocusForConcept(section["conceptFamily"]),
        }
        for index, section in enumerate(sections, start=1)
    ]


def _dps_display_title(lesson_number: int, dps_number: int) -> str:
    return _dps_title(lesson_number, dps_number)


def _dps_question_count(lesson_number: int, dps_number: int) -> int:
    return sum(int(section.get("questionCount") or 0) for section in _dps_sections(lesson_number, dps_number))

LESSON_SOURCE_TYPES = {
    1: "EXCEL_WORKBOOK",
    2: "EXCEL_WORKBOOK",
    **{lesson_number: "IMAGE_WORKSHEET" for lesson_number in range(3, 31)},
}

LESSON_SOURCE_FILES = {
    1: "Level - 9/LESSON 1.xlsx",
    2: "Level - 9/LESSON 2.xlsx",
}

# Preserve the original uploaded-source reference while presenting MM as Level 1 in the app.
ORIGINAL_SOURCE_LEVEL_LABEL = "Level - 9"


def _normalise_source_filename(lesson_number: int, dps_number: int) -> str:
    if lesson_number in LESSON_SOURCE_FILES:
        return f"{LESSON_SOURCE_FILES[lesson_number]}#DPS {dps_number}"
    # Uploaded ZIP contains one typo: MM-L9_L8-DPS-2png.png. Preserve the source path in metadata.
    filename = f"MM-L9_L{lesson_number}-DPS-{dps_number}.png"
    if lesson_number == 8 and dps_number == 2:
        filename = "MM-L9_L8-DPS-2png.png"
    return f"Level - 9/Lesson - {lesson_number}/{filename}"


def _dps_title(lesson_number: int, dps_number: int) -> str:
    return DPS_TITLES.get(lesson_number, {}).get(dps_number, LESSON_TITLES[lesson_number])


def _section_config(lesson_number: int, dps_number: int) -> dict:
    source_type = LESSON_SOURCE_TYPES[lesson_number]
    return {
        "moduleCode": MODULE_CODE,
        "levelCode": LEVEL_CODE,
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "dpsTitle": _dps_display_title(lesson_number, dps_number),
        "lessonTitle": LESSON_TITLES[lesson_number],
        "sourceType": source_type,
        "sourceFile": _normalise_source_filename(lesson_number, dps_number),
        "sourceLevelLabel": ORIGINAL_SOURCE_LEVEL_LABEL,
        "seedMode": "DYNAMIC_MASTER_MODULE",
        "durationSeconds": DPS_DURATION_SECONDS,
        "manualReviewRequiredBeforePublishing": True,
        "generatorPackage": "MM_SECTION_AWARE_PACKAGE_3",
        "dpsSections": _dps_sections(lesson_number, dps_number),
    }


def _upsert_module_order(db: Session) -> None:
    for module_code, display_order in MODULE_ORDER.items():
        module = db.query(Module).filter(Module.module_code == module_code).first()
        if module and module.display_order != display_order:
            module.display_order = display_order


def _upsert_module(db: Session) -> Module:
    _upsert_module_order(db)
    module = db.query(Module).filter(Module.module_code == MODULE_CODE).first()
    if not module:
        module = Module(
            module_code=MODULE_CODE,
            module_name=MODULE_NAME,
            description=MODULE_DESCRIPTION,
            display_order=MODULE_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = MODULE_NAME
        module.description = MODULE_DESCRIPTION
        module.display_order = MODULE_DISPLAY_ORDER
        module.is_active = True
    return module


def _upsert_level(db: Session, module: Module) -> Level:
    level = (
        db.query(Level)
        .filter(Level.module_id == module.id, Level.level_code == LEVEL_CODE)
        .first()
    )
    if not level:
        level = Level(
            module_id=module.id,
            level_code=LEVEL_CODE,
            level_name=LEVEL_NAME,
            internal_level_number=LEVEL_INTERNAL_NUMBER,
            display_order=LEVEL_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = LEVEL_NAME
        level.internal_level_number = LEVEL_INTERNAL_NUMBER
        level.display_order = LEVEL_DISPLAY_ORDER
        level.is_active = True
    return level


def _upsert_lesson(db: Session, level: Level, lesson_number: int) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=LESSON_TITLES[lesson_number],
            description=f"Master Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = LESSON_TITLES[lesson_number]
        lesson.description = f"Master Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}"
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _upsert_dps(db: Session, lesson: Lesson, lesson_number: int, dps_number: int) -> DPS:
    dps = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number)
        .first()
    )
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=_dps_display_title(lesson_number, dps_number),
            default_question_count=_dps_question_count(lesson_number, dps_number),
            default_duration_seconds=DPS_DURATION_SECONDS,
            marks_per_question=1,
            label_style="NUMERIC",
            answer_type="MCQ",
            options_per_question=4,
            layout_template="VERTICAL_MASTER_MODULE",
            publication_status="DRAFT",
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = _dps_display_title(lesson_number, dps_number)
        dps.default_question_count = _dps_question_count(lesson_number, dps_number)
        dps.default_duration_seconds = DPS_DURATION_SECONDS
        dps.marks_per_question = 1
        dps.label_style = "NUMERIC"
        dps.answer_type = "MCQ"
        dps.options_per_question = 4
        dps.layout_template = "VERTICAL_MASTER_MODULE"
        dps.is_active = True
        if not getattr(dps, "publication_status", None):
            dps.publication_status = "DRAFT"
    return dps


def _upsert_sections(db: Session, dps: DPS, lesson_number: int, dps_number: int) -> list[DPSSection]:
    config = _section_config(lesson_number, dps_number)
    target_payload = {
        "sourceType": config["sourceType"],
        "sourceFile": config["sourceFile"],
    }
    workbook_sections = _dps_sections(lesson_number, dps_number)
    active_section_numbers = {int(section["sectionNumber"]) for section in workbook_sections}
    saved_sections: list[DPSSection] = []

    for section_definition in workbook_sections:
        section_number = int(section_definition["sectionNumber"])
        section = (
            db.query(DPSSection)
            .filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number)
            .first()
        )
        section_title = str(section_definition["sectionTitle"])
        question_count = int(section_definition["questionCount"])
        concept_family = str(section_definition["conceptFamily"])
        operation_focus = str(section_definition.get("operationFocus") or OperationFocusForConcept(concept_family))

        section_config = {
            **config,
            "activeSection": section_definition,
        }
        if not section:
            section = DPSSection(
                dps_id=dps.id,
                section_number=section_number,
                section_title=section_title,
                question_count=question_count,
                concept_family=concept_family,
                operation_focus=operation_focus,
                abacus_rule="MASTER_MODULE_SECTION_DYNAMIC",
                target_numbers_json=json.dumps(target_payload),
                place_value="ADVANCED_MIXED",
                digit_pattern="MASTER_MODULE",
                rows_count=question_count,
                difficulty="MASTER",
                allow_negative_operands=True,
                allow_negative_answer=True,
                generator_config_json=json.dumps(section_config),
            )
            db.add(section)
            db.flush()
        else:
            section.section_title = section_title
            section.question_count = question_count
            section.concept_family = concept_family
            section.operation_focus = operation_focus
            section.abacus_rule = "MASTER_MODULE_SECTION_DYNAMIC"
            section.target_numbers_json = json.dumps(target_payload)
            section.place_value = "ADVANCED_MIXED"
            section.digit_pattern = "MASTER_MODULE"
            section.rows_count = question_count
            section.difficulty = "MASTER"
            section.allow_negative_operands = True
            section.allow_negative_answer = True
            section.generator_config_json = json.dumps(section_config)
        saved_sections.append(section)

    stale_sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .filter(~DPSSection.section_number.in_(active_section_numbers))
        .all()
    )
    for stale_section in stale_sections:
        stale_section.question_count = 0
        stale_section.section_title = f"Archived Section {stale_section.section_number}"

    return saved_sections

def seed(db: Session) -> None:
    """Synchronize the Master Module curriculum skeleton.

    This sync is idempotent and intentionally creates only curriculum/master data.
    It does not create students, teachers, assignments, attempts, reports, or demo data.
    All Master Module DPS records are created as Draft by default and use a 5-minute time limit.
    """
    print("[MathPath Seed] Master Module sync started")
    module = _upsert_module(db)
    level = _upsert_level(db, module)

    lesson_count = 0
    dps_count = 0
    section_count = 0
    for lesson_number in range(1, 31):
        lesson = _upsert_lesson(db, level, lesson_number)
        lesson_count += 1
        for dps_number in range(1, DPS_PER_LESSON + 1):
            dps = _upsert_dps(db, lesson, lesson_number, dps_number)
            dps_count += 1
            sections = _upsert_sections(db, dps, lesson_number, dps_number)
            section_count += len(sections)

    db.commit()
    print(
        "[MathPath Seed] Master Module sync completed: "
        f"module={MODULE_CODE}, level={LEVEL_CODE}, lessons={lesson_count}, "
        f"dps={dps_count}, sections={section_count}, duration_seconds={DPS_DURATION_SECONDS}"
    )
