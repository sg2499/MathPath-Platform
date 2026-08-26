"""Backfill DPS.default_duration_seconds to a flat 1200 (20 minutes)

Revision ID: 621d91efe76f
Revises: e5a2c9f14b7d
Create Date: 2026-08-26 00:00:00.000000

2026-08-26, Shailesh: DPS sheet timers move from the old size-based rule
(5 minutes for <=10 questions, 10 minutes for more) to a flat 20 minutes
across every module/level/lesson/dps-number, matching the equivalent
change to the 8 seed scripts (seed_bridge_module_l1, seed_intermediate_
module, seed_master_module, seed_preparatory_module[/_l2/_l3/_l4],
seed_ylm_phase1).

This is a data-only backfill on the DPS table's own default_duration_
seconds column. Assignment never stores its own duration -- every DPS
attempt resolves its allotted time fresh from this column at attempt-start
via Assignment.dps_id -- so this single UPDATE retroactively applies the
new 20-minute timer to every sheet that exists today, including sheets
already assigned to a student but not yet attempted, and reattempts that
have been granted but not yet started. No Assignment or AssignmentReattempt
Permission row needs touching.

downgrade() intentionally does NOT attempt to restore the old size-based
(<=10 -> 300s, >10 -> 600s) values -- that data is not recoverable from
the DPS table alone (it never stored the original question_count-derived
duration, only its resolved seconds), so a downgrade would have to fake
values rather than actually reverse this migration. It's a no-op with an
explanatory message instead of a silent/incorrect rollback.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '621d91efe76f'
down_revision: Union[str, None] = 'e5a2c9f14b7d'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.execute("UPDATE dps SET default_duration_seconds = 1200")


def downgrade() -> None:
    # Not reversible -- see module docstring. The pre-migration per-sheet
    # durations were derived from each sheet's question_count at seed time
    # and were never themselves persisted, so there is nothing to restore
    # them from at the database layer.
    pass
