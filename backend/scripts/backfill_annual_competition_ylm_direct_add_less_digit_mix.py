#!/usr/bin/env python3
"""
One-time backfill for the Annual Competition Bloomers/Beginners (YLM-L0/
YLM-L1) direct add/less digit-mix fix (2026-09-17, Shailesh): "most of the
sums are single digit direct addition and most of the sums are single digit
direct addition ... we need to have a mix of both single, double and
single-double mixed sums but direct add/less only, the concept remains the
same ... once done we will need a backfill script to backfill all the
practice papers for these 2 levels for the papers that are assigned but
pending."

Root cause / forward-fix context: annual_competition_paper_registry.py's
_YLM_L1_DIRECT_POOL (shared by both YLM-L0 "Bloomers" and YLM-L1 "Beginners"
-- same pool object, same single "Direct Sums (Abacus)" section) used to
split its 50 questions only 25/25 between pure single-digit (lessonNumber 1)
and single-and-double-digit mixed (lessonNumber 2) -- there was no pure
double-digit tier, so roughly half the paper never went past single digits
and a student could do it mentally without the abacus. A third pool entry
now overrides the digit pattern to pure "2D" (via the new, opt-in
YLMConfig.digit_pattern_override -- see annual_competition_paper_generation_
service.py's _GenerateYlmQuestion and question_engine/ylm/config.py), giving
a roughly 17/17/16 split across single-digit, mixed, and double-digit --
always direct add/less, never any other concept.
GenerateAnnualCompetitionLevelPaper already reads that pool fresh on every
call, so every NEW paper generated from this point forward automatically
gets the mixed content -- but a practice paper's content is generated ONCE
and frozen as its own CompetitionMockExam/CompetitionMockQuestion rows the
moment it's assigned to a student (see annual_competition_studio_service.py's
_GeneratePracticePapersForOneStudent). A paper that was already assigned
before this fix landed keeps its old, mostly-single-digit content forever
unless something regenerates it -- that is what this script does.

This mirrors backfill_annual_competition_add_less_difficulty_ease.py's own
shape almost exactly (same underlying situation: a registry pool content
change that a frozen, already-assigned practice paper can't pick up on its
own) -- see that script for the fuller design rationale this one reuses
verbatim.

Scope -- "assigned but not yet attempted", enforced per the SAME any-status
gate this codebase already uses everywhere else:
  - A PRACTICE CompetitionEventLevelPaper (paper_kind == "PRACTICE") for
    YLM-L0 or YLM-L1 qualifies only when consumed_at IS NULL (never
    submitted) AND zero CompetitionEventAttempt rows exist anywhere for that
    level_paper_id -- ANY status, not just FINALIZED, so a started-but-
    abandoned IN_PROGRESS attempt (which never sets consumed_at -- see
    StartAnnualCompetitionPracticeAttempt's own docstring) is correctly
    excluded too, never silently blown away.
  - OFFICIAL papers are reported (counted, listed) but NEVER touched by
    --apply -- same reasoning as the sibling difficulty-ease script: an
    official paper is shared across every student sitting that level, is a
    materially higher-risk single point of regeneration, and Shailesh's own
    request named "the practice papers" specifically. Regenerating an
    official paper (if one exists and truly has zero attempts anywhere) is a
    decision for Shailesh to make explicitly, not something this script does
    automatically -- note that any OFFICIAL paper generated fresh (including
    on the actual event day) already gets the new mix automatically, with no
    backfill needed, since GenerateAnnualCompetitionLevelPaper reads the same
    registry pool for both official and practice generation.

Idempotent: a paper this script has already regenerated is tagged with
"DIRECTMIX" in its new exam's mock_code (e.g.
ANNUAL-PRACTICE-YLM-L1-DIRECTMIX-A1B2C3D4), and a paper whose CURRENT
mock_exam_id already carries that tag is skipped on any later run (reported
as "already backfilled"), so running --apply twice does not regenerate the
same paper's content a second time for no reason.

Safe by design (identical guarantees to the sibling difficulty-ease script):
  - Read-only detection/preview unless --apply.
  - Never touches a paper once ANY CompetitionEventAttempt exists against it
    (any status), and never touches an OFFICIAL paper at all.
  - Regenerated content goes through the exact same GenerateAnnualCompetition
    LevelPaper + registry + validator pipeline real paper generation
    already uses -- never a bespoke reimplementation.
  - Old exam content is only deleted via the existing, already-guarded
    DeleteCompetitionMockExam, and only AFTER the paper's mock_exam_id has
    already been repointed at the new exam and committed -- so a failure
    partway through never leaves a paper referencing a half-deleted exam.
  - Each paper is regenerated and committed individually (never batched into
    one big transaction) -- one paper's failure can only ever cost that one
    paper's work, never anything already successfully committed before it.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_annual_competition_ylm_direct_add_less_digit_mix.py --dry-run
    python scripts/backfill_annual_competition_ylm_direct_add_less_digit_mix.py --apply

--dry-run is the default if neither flag is passed. ALWAYS run --dry-run
first and read the summary before --apply.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionEventAttempt,
    CompetitionEventLevelPaper,
    CompetitionMockExam,
    Level,
    Student,
    User,
)
from app.services.annual_competition_paper_generation_service import GenerateAnnualCompetitionLevelPaper  # noqa: E402
from app.services.annual_competition_studio_service import _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES  # noqa: E402
from app.services.competition_mock_generation_service import DeleteCompetitionMockExam  # noqa: E402

# Force every print() to flush immediately -- same reasoning as every other
# backfill script in this directory.
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


# The exact levels whose direct add/less pool got the new digit-mix entry
# (annual_competition_paper_registry.py, 2026-09-17). Both share the same
# _YLM_L1_DIRECT_POOL object -- YLM-L0 has no curriculum Level row of its
# own (resolved through YLM-L1 via _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES,
# same shape as MM-L2).
TARGET_LEVEL_CODES = ["YLM-L0", "YLM-L1"]

DIGITMIX_TAG = "DIRECTMIX"


def _student_label(db, student_id: str | None) -> str:
    if not student_id:
        return "(unknown student)"
    student = db.get(Student, student_id)
    if not student:
        return student_id
    user = db.get(User, student.user_id) if student.user_id else None
    return f"{user.full_name} ({student.student_code})" if user else student.student_code


def _resolve_level_records(db) -> dict[str, Level]:
    """One Level lookup per distinct curriculum code, mirroring
    annual_competition_studio_service.py's own AssignAnnualCompetitionPractice
    ToStudents resolution (CurriculumLookupLevelCode override + is_active
    filter) exactly, so a YLM-L0 paper resolves through the real YLM-L1 row
    the same way live generation already does."""
    Records: dict[str, Level] = {}
    for LevelCode in TARGET_LEVEL_CODES:
        CurriculumLookupLevelCode = _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES.get(LevelCode, LevelCode)
        LevelRecord = (
            db.query(Level)
            .filter(Level.level_code == CurriculumLookupLevelCode, Level.is_active == True)  # noqa: E712
            .first()
        )
        if LevelRecord:
            Records[LevelCode] = LevelRecord
    return Records


def _is_already_backfilled(db, mock_exam_id: str | None) -> bool:
    if not mock_exam_id:
        return False
    ExamRecord = db.get(CompetitionMockExam, mock_exam_id)
    return bool(ExamRecord and DIGITMIX_TAG in (ExamRecord.mock_code or ""))


def _report_official_papers(db) -> int:
    print("-" * 88)
    print("OFFICIAL papers for the affected levels -- REPORTED ONLY, never touched by this script")
    print("-" * 88)
    official_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "OFFICIAL",
            CompetitionEventLevelPaper.competition_level_code.in_(TARGET_LEVEL_CODES),
        )
        .all()
    )
    if not official_papers:
        print("  None found.")
        return 0
    for paper in official_papers:
        has_any_attempt = (
            db.query(CompetitionEventAttempt.id)
            .filter(CompetitionEventAttempt.level_paper_id == paper.id)
            .first()
            is not None
        )
        print(
            f"  {paper.competition_level_code}: level_paper_id={paper.id}, "
            f"mock_exam_id={paper.mock_exam_id}, has_any_attempt={has_any_attempt} "
            f"-- a decision for Shailesh, not auto-applied here"
        )
    return len(official_papers)


def _run_practice_phase(db, apply: bool, level_records: dict[str, Level]) -> dict:
    print("\n" + "-" * 88)
    print("PRACTICE papers -- assigned, never attempted (consumed_at IS NULL, zero CompetitionEventAttempt rows)")
    print("-" * 88)

    candidate_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "PRACTICE",
            CompetitionEventLevelPaper.competition_level_code.in_(TARGET_LEVEL_CODES),
            CompetitionEventLevelPaper.consumed_at.is_(None),
        )
        .all()
    )

    checked = len(candidate_papers)
    skipped_has_attempt = 0
    skipped_already_backfilled = 0
    skipped_no_level = 0
    regenerated = 0
    failed = 0
    by_level: dict[str, int] = {code: 0 for code in TARGET_LEVEL_CODES}

    for paper in candidate_papers:
        has_any_attempt = (
            db.query(CompetitionEventAttempt.id)
            .filter(CompetitionEventAttempt.level_paper_id == paper.id)
            .first()
            is not None
        )
        if has_any_attempt:
            skipped_has_attempt += 1
            continue

        if _is_already_backfilled(db, paper.mock_exam_id):
            skipped_already_backfilled += 1
            continue

        LevelRecord = level_records.get(paper.competition_level_code)
        if not LevelRecord:
            skipped_no_level += 1
            print(f"  [SKIP -- no curriculum Level row] {paper.competition_level_code} / level_paper_id={paper.id}")
            continue

        by_level[paper.competition_level_code] = by_level.get(paper.competition_level_code, 0) + 1
        label = f"{_student_label(db, paper.assigned_student_id)} / {paper.competition_level_code} / level_paper_id={paper.id}"

        if not apply:
            print(f"  [WOULD REGENERATE] {label} (old mock_exam_id={paper.mock_exam_id})")
            regenerated += 1
            continue

        old_exam_id = paper.mock_exam_id
        try:
            exam_payload = GenerateAnnualCompetitionLevelPaper(
                db,
                LevelId=LevelRecord.id,
                CreatedBy=None,
                Title=f"Annual Competition Practice -- {paper.competition_level_code} (Direct Add/Less digit-mix backfill, 2026-09-17)",
                MockCode=f"ANNUAL-PRACTICE-{paper.competition_level_code}-{DIGITMIX_TAG}-{uuid4().hex[:8].upper()}",
                CompetitionScope="ANNUAL_COMPETITION_PRACTICE",
                CompetitionLevelCode=paper.competition_level_code,
            )
            paper.mock_exam_id = exam_payload["mockExamId"]
            db.commit()
        except Exception as Error:  # noqa: BLE001 -- one bad paper must never abort the rest of the backfill
            db.rollback()
            failed += 1
            print(f"  [FAILED to regenerate] {label}: {getattr(Error, 'detail', None) or Error}")
            continue

        try:
            if old_exam_id:
                DeleteCompetitionMockExam(db, MockExamId=old_exam_id)
        except Exception as Error:  # noqa: BLE001 -- the paper is already safely repointed; a cleanup failure is logged, not fatal
            print(f"  [WARNING -- old exam {old_exam_id} could not be cleaned up, now orphaned] {label}: {getattr(Error, 'detail', None) or Error}")

        regenerated += 1
        print(f"  [REGENERATED] {label}: old mock_exam_id={old_exam_id} -> new mock_exam_id={paper.mock_exam_id}")

    print(f"\nPRACTICE papers checked (level in scope, never submitted): {checked}")
    print(f"  Skipped (an attempt exists somewhere -- untouched):       {skipped_has_attempt}")
    print(f"  Skipped (already backfilled by a prior run):              {skipped_already_backfilled}")
    print(f"  Skipped (no matching curriculum Level row):               {skipped_no_level}")
    print(f"  Failed to regenerate:                                     {failed}")
    print(f"  {'Regenerated' if apply else 'Would regenerate'}:{'':<{45 - len('Regenerated' if apply else 'Would regenerate')}}{regenerated}")
    print("  By level:")
    for code in TARGET_LEVEL_CODES:
        print(f"    {code}: {by_level.get(code, 0)}")

    return {"checked": checked, "regenerated": regenerated, "failed": failed, "by_level": by_level}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually regenerate and write. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"ANNUAL COMPETITION YLM (BLOOMERS/BEGINNERS) DIRECT ADD/LESS DIGIT-MIX BACKFILL -- mode: "
          f"{'APPLY (writing regenerated papers)' if apply else 'DRY RUN (no changes will be written)'}")
    print(f"Target level codes: {', '.join(TARGET_LEVEL_CODES)}")
    print("=" * 88)

    db = SessionLocal()
    try:
        official_count = _report_official_papers(db)
        level_records = _resolve_level_records(db)
        missing_levels = [code for code in TARGET_LEVEL_CODES if code not in level_records]
        if missing_levels:
            print(f"\n[WARNING] No active curriculum Level row found for: {', '.join(missing_levels)} -- their PRACTICE papers will be skipped and reported individually below.")

        practice_summary = _run_practice_phase(db, apply, level_records)

        print("\n" + "=" * 88)
        print("OVERALL SUMMARY")
        print("=" * 88)
        print(f"OFFICIAL papers found for affected levels (reported only, never touched): {official_count}")
        print(f"PRACTICE papers {'regenerated' if apply else 'that would be regenerated'}: {practice_summary['regenerated']}")
        if practice_summary["failed"]:
            print(f"PRACTICE papers that FAILED to regenerate (left untouched, needs manual review): {practice_summary['failed']}")
        if not apply:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
