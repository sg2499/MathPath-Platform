#!/usr/bin/env python3
"""
One-time backfill for the Annual Competition multiplication / division rule
(2026-10-06, Shailesh): "for the multiplication concepts we need to remove
sums like 23 x 1, 2 x 1, 23 x 10, 23 x 100 and so on these make it very easy
for the students to just type the answer without even solving it ... same
goes for division ... once this is applied we will need to backfill the
existing assigned practice papers to the students that are pending and have
not been completed yet, the ones that are completed for them we cant do
anything", then: "regeneration is only required for division and
multiplication rest is fine ... all pending papers only."

Forward fix: annual_competition_paper_generation_service.py's
_CollectAnnualCompetitionQuestions now refuses a sum that needs no working
(a factor or divisor of 1 or a power of ten, a number divided by itself, a
quotient of exactly 10/100/1000) and allows at most two round-number sums
per section, never back to back (see ClassifyAnnualMultiplyDivideSum there).
Every paper generated from that point on, official or practice, follows it.
A practice paper's content is frozen when it is assigned, though, so papers
assigned earlier keep their old sums until something rebuilds them -- that
is what this script does.

What it changes
  - Only PRACTICE papers (paper_kind == "PRACTICE") that nobody has opened:
    consumed_at IS NULL AND zero CompetitionEventAttempt rows of ANY status
    for that level_paper_id (the same any-status gate
    backfill_annual_competition_add_less_difficulty_ease.py uses, so a
    started-but-unfinished attempt is never disturbed).
  - Inside such a paper, only the multiplication / division sections that
    actually break the rule are rebuilt, through the same production
    function the forward fix uses
    (RebuildAnnualCompetitionMultiplyDivideSections). Every other section
    keeps its question rows untouched -- same ids, same order, same sums.
    The paper keeps its own exam, its code, its "Practice Paper N" number
    and its section timers.
  - A paper whose multiplication / division sections already meet the rule
    is left exactly as it is (reported as "already fine").

What it never touches
  - Completed papers, and papers a student has opened (any attempt row).
  - OFFICIAL papers -- they are listed for information only. An official
    paper generated before this rule keeps its content until it is
    regenerated from the Annual Competition studio.
  - A paper whose stored section layout does not match today's layout for
    its level (reported as "layout differs", never rewritten).

Idempotent by construction: a rebuilt section meets the rule, so a second
run finds nothing left to do for that paper. No marker is needed.

Each paper is committed on its own; a failure rolls back that one paper and
the run carries on with the next.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_annual_competition_multiply_divide_rule.py --dry-run
    python scripts/backfill_annual_competition_multiply_divide_rule.py --apply

--dry-run is the default if neither flag is passed. ALWAYS run --dry-run
first and read the summary before --apply.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionEventAttempt,
    CompetitionEventLevelPaper,
    Student,
    User,
)
from app.services.annual_competition_paper_generation_service import (  # noqa: E402
    IsAnnualMultiplyDivideSection,
    RebuildAnnualCompetitionMultiplyDivideSections,
)
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY  # noqa: E402

# Force every print() to flush immediately -- same reasoning as every other
# backfill script in this directory.
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


def target_level_codes() -> list[str]:
    """Every Annual Competition level whose paper has at least one
    multiplication or division section -- read from the registry itself, so
    this list can never drift from what the generator actually produces."""
    Codes: list[str] = []
    for LevelCode, LevelConfig in ANNUAL_COMPETITION_LEVEL_REGISTRY.items():
        Pools = LevelConfig["sectionConceptPools"]
        if any(IsAnnualMultiplyDivideSection(Pools.get(Section["key"]) or []) for Section in LevelConfig["sections"]):
            Codes.append(LevelCode)
    return Codes


def _student_label(db, student_id: str | None) -> str:
    if not student_id:
        return "(unknown student)"
    student = db.get(Student, student_id)
    if not student:
        return student_id
    user = db.get(User, student.user_id) if student.user_id else None
    return f"{user.full_name} ({student.student_code})" if user else student.student_code


def _section_summary(sections: list[dict]) -> str:
    Parts = []
    for Section in sections:
        if "never" not in Section:
            continue
        if Section.get("faults", 0) <= 0:
            continue
        Parts.append(
            f"{Section['title']}: {Section['never']} no-working, {Section['round']} round-number"
            + (f", {Section['adjacent']} back to back" if Section.get("adjacent") else "")
        )
    return "; ".join(Parts)


def report_official_papers(db, level_codes: list[str]) -> int:
    print("-" * 88)
    print("OFFICIAL papers for these levels -- LISTED ONLY, never touched by this script")
    print("-" * 88)
    official_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "OFFICIAL",
            CompetitionEventLevelPaper.competition_level_code.in_(level_codes),
        )
        .all()
    )
    if not official_papers:
        print("  None found.")
        return 0
    for paper in official_papers:
        if not paper.mock_exam_id:
            print(f"  {paper.competition_level_code}: no paper generated yet (level_paper_id={paper.id})")
            continue
        check = RebuildAnnualCompetitionMultiplyDivideSections(
            db, MockExamId=paper.mock_exam_id, CompetitionLevelCode=paper.competition_level_code, Apply=False
        )
        verdict = {
            "COMPLIANT": "already meets the rule",
            "WOULD_REBUILD": "holds old sums -- regenerate it from the studio when you want the rule applied (" + _section_summary(check["sections"]) + ")",
            "STRUCTURE_DIFFERS": "layout differs from today's",
            "NOT_APPLICABLE": "no multiplication / division section",
        }.get(check["status"], check["status"])
        print(f"  {paper.competition_level_code}: {verdict} (level_paper_id={paper.id})")
    return len(official_papers)


def run_practice_phase(db, apply: bool, level_codes: list[str]) -> dict:
    print("\n" + "-" * 88)
    print("PRACTICE papers -- assigned, never opened (consumed_at IS NULL, zero CompetitionEventAttempt rows)")
    print("-" * 88)

    # Ids first, then one paper at a time: every paper is loaded, rebuilt and
    # committed (or rolled back) on its own.
    candidate_ids = [
        row[0]
        for row in db.query(CompetitionEventLevelPaper.id)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "PRACTICE",
            CompetitionEventLevelPaper.competition_level_code.in_(level_codes),
            CompetitionEventLevelPaper.consumed_at.is_(None),
        )
        .order_by(CompetitionEventLevelPaper.competition_level_code.asc(), CompetitionEventLevelPaper.assigned_at.asc())
        .all()
    ]

    counts = {"checked": len(candidate_ids), "opened": 0, "no_exam": 0, "fine": 0, "layout": 0, "rebuilt": 0, "failed": 0}
    by_level: dict[str, dict[str, int]] = {code: {"rebuilt": 0, "fine": 0, "opened": 0} for code in level_codes}

    for paper_id in candidate_ids:
        paper = db.get(CompetitionEventLevelPaper, paper_id)
        if not paper:
            continue
        level_code = paper.competition_level_code
        has_any_attempt = (
            db.query(CompetitionEventAttempt.id).filter(CompetitionEventAttempt.level_paper_id == paper.id).first() is not None
        )
        if has_any_attempt:
            counts["opened"] += 1
            by_level[level_code]["opened"] += 1
            continue
        if not paper.mock_exam_id:
            counts["no_exam"] += 1
            continue

        label = f"{_student_label(db, paper.assigned_student_id)} / {level_code} / level_paper_id={paper.id}"
        try:
            outcome = RebuildAnnualCompetitionMultiplyDivideSections(
                db, MockExamId=paper.mock_exam_id, CompetitionLevelCode=level_code, Apply=apply
            )
            status = outcome["status"]
            if status == "REBUILT":
                db.commit()
            else:
                db.rollback()
        except Exception as Error:  # noqa: BLE001 -- one bad paper must never abort the rest of the backfill
            db.rollback()
            counts["failed"] += 1
            print(f"  [FAILED -- left as it was] {label}: {getattr(Error, 'detail', None) or Error}")
            continue

        if status in ("COMPLIANT", "NOT_APPLICABLE"):
            counts["fine"] += 1
            by_level[level_code]["fine"] += 1
        elif status == "STRUCTURE_DIFFERS":
            counts["layout"] += 1
            print(f"  [SKIP -- layout differs, untouched] {label}: {outcome['sections']}")
        elif status in ("WOULD_REBUILD", "REBUILT"):
            counts["rebuilt"] += 1
            by_level[level_code]["rebuilt"] += 1
            print(f"  [{'REBUILT' if apply else 'WOULD REBUILD'}] {label}: {_section_summary(outcome['sections'])}")

    verb = "Rebuilt" if apply else "Would rebuild"
    print(f"\nPRACTICE papers checked (level in scope, never submitted): {counts['checked']}")
    print(f"  Skipped (a student has opened it -- untouched):         {counts['opened']}")
    print(f"  Skipped (no paper content linked):                      {counts['no_exam']}")
    print(f"  Skipped (layout differs from today's -- untouched):     {counts['layout']}")
    print(f"  Already fine (meets the rule -- untouched):             {counts['fine']}")
    print(f"  Failed (left as it was):                                {counts['failed']}")
    print(f"  {verb + ' (multiplication / division sections only):':<56}{counts['rebuilt']}")
    print("  By level:")
    for code in level_codes:
        row = by_level[code]
        print(f"    {code}: {verb.lower()} {row['rebuilt']}, already fine {row['fine']}, opened by a student {row['opened']}")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually rebuild and write. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)
    level_codes = target_level_codes()

    print("=" * 88)
    print(
        "ANNUAL COMPETITION MULTIPLICATION / DIVISION RULE BACKFILL -- mode: "
        f"{'APPLY (rebuilding sections)' if apply else 'DRY RUN (no changes will be written)'}"
    )
    print(f"Levels with a multiplication or division section: {', '.join(level_codes)}")
    # Which database this run is looking at (password hidden) -- so a run
    # started from the wrong folder, without backend/.env, is obvious at once
    # instead of quietly reporting "0 papers" from an empty local file.
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    print("=" * 88)

    db = SessionLocal()
    try:
        official_count = report_official_papers(db, level_codes)
        db.rollback()
        counts = run_practice_phase(db, apply, level_codes)

        print("\n" + "=" * 88)
        print("OVERALL SUMMARY")
        print("=" * 88)
        print(f"OFFICIAL papers listed (never touched): {official_count}")
        print(f"PRACTICE papers {'rebuilt' if apply else 'that would be rebuilt'}: {counts['rebuilt']}")
        print(f"PRACTICE papers already fine: {counts['fine']}")
        print(f"PRACTICE papers opened by a student (untouched): {counts['opened']}")
        if counts["failed"]:
            print(f"PRACTICE papers that FAILED and were left as they were: {counts['failed']}  <-- read the [FAILED] lines above")
        if not apply:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply to rebuild.")
        else:
            print("\nDone. Running this again should now report 0 to rebuild.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
