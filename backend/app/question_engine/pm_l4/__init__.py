"""Preparatory Module Level 4 -- fully independent question-generation
engine. Zero imports from question_engine/pm, pm_l2, pm_l3, or any other
module's engine (IM/MM/YLM); nothing outside this package imports from here
either. Per Shailesh's explicit, repeated instruction: every level gets a
dedicated engine so a change to one level's generation logic can never
silently affect another. Where PM-L4's underlying abacus technique is
genuinely identical to PM-L1/L2/L3's (DIRECT, COMPLEMENT_OF_5,
COMPLEMENT_OF_10 bead movement rules -- the physics of the abacus itself
doesn't change between levels), the *logic* is copied into this package's
own validators.py/operands.py rather than imported.

PM-L4 is the final level of the Preparatory Module and introduces two
genuinely new elements vs PM-L3: a "2D ÷ 1D" easier exact-division variant
alongside "3D ÷ 1D", and the platform's first compound-answer concept,
"3D ÷ 1D WITH REMAINDER(S)" (divide_remainder.py), whose correct_answer is
a "quotient, remainder" text pair handled end-to-end by a dedicated
answer-matching path in app/services/answer_matching.py.
"""
from app.question_engine.pm_l4.config import (
    PML4Config,
    PML4ConceptDrillConfig,
    PML4MultiplyConfig,
    PML4DivideConfig,
    PML4DivideRemainderConfig,
    PML4BodmasConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    BODMAS_L4_BRACKET_PRODUCT,
    BODMAS_L4_PLAIN_PRODUCT,
    BODMAS_L4_BRACKET_SUM,
)
from app.question_engine.pm_l4.generator import (
    generate_pm_l4_question_set,
    generate_pm_l4_multiply_set,
    generate_pm_l4_divide_set,
    generate_pm_l4_divide_remainder_set,
    generate_pm_l4_bodmas_set,
    generate_pm_l4_concept_drill_set,
)
