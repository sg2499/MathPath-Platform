"""Bridge Module Level 1 -- fully independent question-generation engine.
Zero imports from question_engine/pm, pm_l2, pm_l3, pm_l4, or any other
module's engine (IM/MM/YLM); nothing outside this package imports from here
either. Per Shailesh's explicit instruction ("dedicated engine for bm,
entirely independent from all the other modules and levels"): every level
gets a dedicated engine so a change to one level's generation logic can
never silently affect another. Where BM-L1's underlying abacus technique is
genuinely identical to PM's (DIRECT, COMPLEMENT_OF_5, COMPLEMENT_OF_10 bead
movement rules -- the physics of the abacus itself doesn't change between
levels), the *logic* is copied into this package's own
validators.py/operands.py rather than imported.

Bridge Module sits between Preparatory and Intermediate in the platform's
hierarchy (YLM-PM-BM-IM-MM) and has a single level, BM-L1, spanning 40
lessons / 200 DPS sheets. It ramps from single-digit bead recognition all
the way to 4-digit,4-row Add/Less, 2D x 1D multiplication, 2D/3D exact
division, 3D ÷ 1D WITH REMAINDER(S) (divide_remainder.py, same
compound-answer "quotient, remainder" text convention PM-L4 introduced,
reusing the same dedicated answer-matching path in
app/services/answer_matching.py), BODMAS, and Concept Drill.
"""
from app.question_engine.bm.config import (
    BMConfig,
    BMConceptDrillConfig,
    BMMultiplyConfig,
    BMDivideConfig,
    BMDivideRemainderConfig,
    BMBodmasConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    BODMAS_BM_BRACKET_PRODUCT,
    BODMAS_BM_PLAIN_PRODUCT,
    BODMAS_BM_BRACKET_SUM,
    BODMAS_BM_PRODUCT_AFTER_TAIL,
)
from app.question_engine.bm.generator import (
    generate_bm_question_set,
    generate_bm_multiply_set,
    generate_bm_divide_set,
    generate_bm_divide_remainder_set,
    generate_bm_bodmas_set,
    generate_bm_concept_drill_set,
)
