"""Preparatory Module Level 3 -- fully independent question-generation
engine. Zero imports from question_engine/pm, question_engine/pm_l2, or any
other module's engine (IM/MM/YLM); nothing outside this package imports from
here either. Per Shailesh's explicit, repeated instruction (2026-08-05,
reaffirmed 2026-08-06 while scoping this level): every level gets a
dedicated engine so a change to one level's generation logic can never
silently affect another. Where PM-L3's underlying abacus technique is
genuinely identical to PM-L1/PM-L2's (DIRECT, COMPLEMENT_OF_5,
COMPLEMENT_OF_10 bead movement rules -- the physics of the abacus itself
doesn't change between levels), the *logic* is copied into this package's
own validators.py/operands.py rather than imported, exactly the same
precedent PM-L2 already established relative to PM-L1.
"""
from app.question_engine.pm_l3.config import (
    PML3Config,
    PML3ConceptDrillConfig,
    PML3MultiplyConfig,
    PML3DivideConfig,
    PML3BodmasConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    BODMAS_SIMPLE_BRACKET,
    BODMAS_COMPOUND,
    BODMAS_CHAINED,
)
from app.question_engine.pm_l3.generator import (
    generate_pm_l3_question_set,
    generate_pm_l3_multiply_set,
    generate_pm_l3_divide_set,
    generate_pm_l3_bodmas_set,
    generate_pm_l3_concept_drill_set,
)
