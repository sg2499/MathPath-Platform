#!/usr/bin/env python3
"""
One-time backfill for the Annual Competition IM/MM Add/Less difficulty ease
(2026-09-17, Shailesh, relaying a teacher concern): "we need to make sure
that this is fixed accurately and exactly as expected for both the official
and practice flows for the competition and must be applied to all the
practice papers that have been assigned to students but have not been
attempted yet and are pending."

Root cause / forward-fix context: annual_competition_paper_registry.py's
Abacus/Visual Add/Less pools for IM-L1..IM-L4 and MM-L1/MM-L2 were eased
(lower magnitude/row counts -- see that file's own 2026-09-17 comments, and
mm/operands.py's new addLessRowCountOverride/maxWholeDigits/rowCountCap
overrides). GenerateAnnualCompetitionLevelPaper (annual_competition_paper_
generation_service.py) already reads those pools fresh on every call, so
every NEW paper generated from that point forward automatically gets the
easier content -- but a practice paper's content is generated ONCE and
frozen as its own CompetitionMockExam/CompetitionMockQuestion rows the
moment it's assigned to a student (see annual_competition_studio_service.py's
_GeneratePracticePapersForOneStudent). A paper that was already assigned
before this fix landed keeps its old, tougher content forever unless
something regenerates it -- that is what this script does.

Unlike the sibling backfill_mm_percentage_digit_cap.py (which repairs one
question row's math in place because only ONE concept family's answers were
over a cap), this fix touches how EVERY Add/Less question in the affected
sections is generated -- row counts, digit ranges, the whole shape -- so
there is no single-row "repair" that makes sense. Instead, this script
regenerates the WHOLE exam for a qualifying paper via the exact same
production function real generation already uses (GenerateAnnualCompetition
LevelPaper), then repoints that paper's CompetitionEventLevelPaper.mock_exam_id
at the freshly generated exam and deletes the old one (via the existing,
already-guarded DeleteCompetitionMockExam). This is safe specifically
because "qualifying" means nothing has EVER touched this paper -- not the
old exam, not any question in it, not even a started-but-abandoned attempt
-- so there is no partial student work anywhere to disturb by replacing it
wholesale.

Scope -- "assigned but not yet attempted", enforced per the SAME any-status
gate this codebase already uses everywhere else (backfill_mm_percentage_
digit_cap.py's phase 3, GetAnnualCompetitionPracticeReportForStudent's own
"has this student touched this paper at all" reasoning):
  - A PRACTICE CompetitionEventLevelPaper (paper_kind == "PRACTICE") for one
    of the affected level codes qualifies only when consumed_at IS NULL
    (never submitted) AND zero CompetitionEventAttempt rows exist anywhere
    for that level_paper_id -- ANY status, not just FINALIZED, so a
    started-but-abandoned IN_PROGRESS attempt (which never sets consumed_at
    -- see StartAnnualCompetitionPracticeAttempt's own docstring) is
    correctly excluded too, never silently blown away.
  - NOTE on a real, separate bug this script deliberately does NOT repeat:
    backfill_mm_percentage_digit_cap.py's own Annual Competition practice
    phase gates on CompetitionMockAttempt existing for (mock_exam_id,
    student_id) -- but Annual Competition attempts are recorded in
    CompetitionEventAttempt, a completely separate table (confirmed via
    annual_competition_attempt_service.py: it never creates a
    CompetitionMockAttempt row for either PRACTICE or OFFICIAL). That
    script's gate can therefore never actually detect a real Annual
    Competition attempt, and should be audited separately -- flagged here
    for visibility, not fixed by this script, which is scoped to the
    difficulty-ease backfill only.
  - OFFICIAL papers are reported (counted, listed) but NEVER touched by
    --apply, mirroring backfill_mm_percentage_digit_cap.py's own explicit
    "Annual Competition OFFICIAL papers are explicitly OUT of scope"
    decision -- an official paper is shared across every student sitting
    that level, is a materially higher-risk single point of regeneration,
    and Shailesh's own request named "the practice papers" specifically.
    Regenerating an official paper (if one exists and truly has zero
    attempts anywhere) is a decision for Shailesh to make explicitly, not
    something this script does automatically.

Idempotent: a paper this script has already regenerated is tagged with
"DIFFEASE" in its new exam's mock_code (e.g.
ANNUAL-PRACTICE-IM-L2-DIFFEASE-A1B2C3D4), and a paper whose CURRENT
mock_exam_id already carries that tag is skipped on any later run (reported
as "already backfilled"), so running --apply twice does not regenerate the
same paper's content a second time for no reason.

Safe by design:
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
    one big transaction), mirroring _GeneratePracticePapersForOneStudent's
    own hard-won 2026-09-15 fix for exactly this reason: one paper's failure
    can only ever cost that one paper's work, never anything already
    successfully committed before it.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_annual_competition_add_less_difficulty_ease.py --dry-run
    python scripts/backfill_annual_competition_add_less_difficulty_ease.py --apply

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


# The exact levels whose Abacus/Visual Add/Less pools were eased
# (annual_competition_paper_registry.py, 2026-09-17).
TARGET_LEVEL_CODES = ["IM-L1", "IM-L2", "IM-L3", "IM-L4", "MM-L1", "MM-L2"]

DIFFEASE_TAG = "DIFFEASE"


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
    filter) exactly, so a MM-L2 paper resolves through the real MM-L1 row
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
    return bool(ExamRecord and DIFFEASE_TAG in (ExamRecord.mock_code or ""))


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
                Title=f"Annual Competition Practice -- {paper.competition_level_code} (Add/Less difficulty-ease backfill, 2026-09-17)",
                MockCode=f"ANNUAL-PRACTICE-{paper.competition_level_code}-{DIFFEASE_TAG}-{uuid4().hex[:8].upper()}",
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
    print(f"ANNUAL COMPETITION IM/MM ADD/LESS DIFFICULTY-EASE BACKFILL -- mode: "
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
