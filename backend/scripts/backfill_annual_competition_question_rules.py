#!/usr/bin/env python3
"""
One-time backfill for the Annual Competition question rules of 2026-10-07
(Shailesh): "once done we will need to backfill the assigned but pending
practice papers and after it is applied then official and practice papers
generated after that will obviously follow the new rules and conventions",
and, for IM-3's removed Squares section: "remove the scores obtained from
the section which was removed ... recompute the stats there out of 300 only
so everything is consistent."

Every paper generated from 2026-10-07 on follows the new rules by itself. A
practice paper's content is frozen when it is assigned, though, and a result
is stored when a paper is submitted -- so papers assigned earlier and
results computed earlier stay as they were until something brings them
forward. This script does that, in two parts.

PART 1 -- practice papers nobody has opened
  - Only PRACTICE papers (paper_kind == "PRACTICE") with consumed_at IS NULL
    AND zero CompetitionEventAttempt rows of ANY status: a paper a student
    has started, even without finishing, is never touched.
  - Each such paper that predates today's rules gets a freshly generated
    paper of its level, in place (RebuildUnopenedPracticePaperToCurrentRules):
    same bank entry, same student, same assignment date and so the same
    "Practice Paper N" number; same exam record, code and title. Every
    question is replaced. IM-3 papers go from 5 sections to 4.
  - A paper already generated under today's rules (its exam record says so)
    is left exactly as it is.
  - The bank entry is locked while it is rebuilt, with the same lock a
    student's "start practice paper" takes, so a student cannot open a
    paper half-way through its rebuild.

PART 2 -- stored results that still count a removed section
  - Every result of a level that has a removed section (today: IM-3 only,
    its Squares section), practice and official, is recomputed on the
    sections that remain: score, total, percentage, accuracy, the correct /
    wrong / unanswered counts, time taken and the per-section breakdown.
  - Nothing is deleted. The removed section's questions and the student's
    answers stay stored; they are no longer counted or shown.
  - A result that already leaves the section out is left alone.

What it never touches
  - Practice papers a student has opened or completed (Part 1).
  - OFFICIAL papers -- listed for information only. An official paper
    generated before these rules keeps its questions until it is regenerated
    from the Annual Competition studio.

Idempotent by construction: a rebuilt paper carries today's rules version
and a recomputed result no longer holds the removed section, so a second
run finds nothing left to do.

Each paper and each result is committed on its own; a failure rolls back
that one item and the run carries on with the next.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_annual_competition_question_rules.py --dry-run
    python scripts/backfill_annual_competition_question_rules.py --apply

--dry-run is the default if neither flag is passed. ALWAYS run --dry-run
first and read the summary before --apply. Run --apply at a quiet time.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionMockExam,
    Student,
    User,
)
from app.services.annual_competition_paper_generation_service import (  # noqa: E402
    ANNUAL_COMPETITION_QUESTION_RULES_VERSION,
    AnnualPaperQuestionRulesVersion,
)
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY  # noqa: E402
from app.services.annual_competition_retired_sections import LevelCodesWithRetiredSections  # noqa: E402
from app.services.annual_competition_scoring_service import (  # noqa: E402
    ComputeAndFinalizeCompetitionEventResult,
    RetiredSectionRecomputeFor,
)
from app.services.annual_competition_studio_service import (  # noqa: E402
    RebuildUnopenedPracticePaperToCurrentRules,
    _IsLevelPaperLocked,
)

# Force every print() to flush immediately -- same reasoning as every other
# backfill script in this directory.
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


LINE = "-" * 88
PROGRESS_EVERY = 25


def target_level_codes() -> list[str]:
    """Every Annual Competition level, in the registry's own order."""
    return list(ANNUAL_COMPETITION_LEVEL_REGISTRY.keys())


def _student_label(db, student_id: str | None) -> str:
    if not student_id:
        return "(unknown student)"
    student = db.get(Student, student_id)
    if not student:
        return student_id
    user = db.get(User, student.user_id) if student.user_id else None
    return f"{user.full_name} ({student.student_code})" if user else student.student_code


def _whole(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def report_official_papers(db, level_codes: list[str]) -> dict:
    print(LINE)
    print("OFFICIAL papers -- LISTED ONLY, never touched by this script")
    print(LINE)
    official_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "OFFICIAL",
            CompetitionEventLevelPaper.competition_level_code.in_(level_codes),
        )
        .order_by(CompetitionEventLevelPaper.competition_level_code.asc())
        .all()
    )
    counts = {"listed": len(official_papers), "old": 0, "old_locked": 0}
    if not official_papers:
        print("  None found.")
        return counts
    for paper in official_papers:
        if not paper.mock_exam_id:
            print(f"  {paper.competition_level_code}: no paper generated yet (level_paper_id={paper.id})")
            continue
        exam = db.get(CompetitionMockExam, paper.mock_exam_id)
        if AnnualPaperQuestionRulesVersion(exam) == ANNUAL_COMPETITION_QUESTION_RULES_VERSION:
            print(f"  {paper.competition_level_code}: already on today's rules (level_paper_id={paper.id})")
            continue
        counts["old"] += 1
        if _IsLevelPaperLocked(db, paper):
            counts["old_locked"] += 1
            print(
                f"  {paper.competition_level_code}: OLD questions, and LOCKED (a student has attempted it or results are released) "
                f"-- it cannot be regenerated (level_paper_id={paper.id})"
            )
        else:
            print(
                f"  {paper.competition_level_code}: OLD questions -- press Regenerate Official Paper for this level in the studio "
                f"(level_paper_id={paper.id})"
            )
    return counts


def run_practice_phase(db, apply: bool, level_codes: list[str]) -> dict:
    print("\n" + LINE)
    print("PART 1 -- PRACTICE papers, assigned and never opened")
    print(LINE)

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
    db.rollback()

    counts = {"checked": len(candidate_ids), "opened": 0, "no_content": 0, "current": 0, "rebuilt": 0, "failed": 0}
    by_level: dict[str, dict[str, int]] = {code: {"rebuilt": 0, "current": 0, "opened": 0} for code in level_codes}

    for position, paper_id in enumerate(candidate_ids, start=1):
        # A whole paper is rewritten each time, so a large bank takes a
        # while: say where the run has got to.
        if position % PROGRESS_EVERY == 0:
            print(f"  ... {position} of {len(candidate_ids)} papers looked at, {counts['rebuilt']} {'rebuilt' if apply else 'to rebuild'} so far")
        label = f"level_paper_id={paper_id}"
        try:
            outcome = RebuildUnopenedPracticePaperToCurrentRules(db, LevelPaperId=paper_id, Apply=apply)
            status = outcome["status"]
            level_code = outcome.get("levelCode") or "?"
            if status == "REBUILT":
                db.commit()
            else:
                db.rollback()
        except Exception as Error:  # noqa: BLE001 -- one bad paper must never abort the rest of the backfill
            db.rollback()
            counts["failed"] += 1
            print(f"  [FAILED -- left as it was] {label}: {getattr(Error, 'detail', None) or Error}")
            continue

        row = by_level.setdefault(level_code, {"rebuilt": 0, "current": 0, "opened": 0})
        if status == "OPENED":
            counts["opened"] += 1
            row["opened"] += 1
        elif status in ("NO_CONTENT", "NOT_CONFIGURED", "NOT_FOUND", "NOT_PRACTICE"):
            counts["no_content"] += 1
        elif status == "CURRENT":
            counts["current"] += 1
            row["current"] += 1
        elif status in ("WOULD_REBUILD", "REBUILT"):
            counts["rebuilt"] += 1
            row["rebuilt"] += 1
            if outcome["sectionsBefore"] != outcome["sectionsAfter"] or outcome["questionsBefore"] != outcome["questionsAfter"]:
                paper = db.get(CompetitionEventLevelPaper, paper_id)
                print(
                    f"  [{'REBUILT' if apply else 'WOULD REBUILD'} -- layout changes] "
                    f"{_student_label(db, paper.assigned_student_id if paper else None)} / {level_code} / {label}: "
                    f"{len(outcome['sectionsBefore'])} sections, {outcome['questionsBefore']} questions -> "
                    f"{len(outcome['sectionsAfter'])} sections, {outcome['questionsAfter']} questions"
                )
                db.rollback()

    verb = "Rebuilt" if apply else "Would rebuild"
    print(f"\nPRACTICE papers checked (never submitted): {counts['checked']}")
    print(f"  Skipped (a student has opened it -- untouched):   {counts['opened']}")
    print(f"  Skipped (no paper content linked):                {counts['no_content']}")
    print(f"  Already on today's rules (untouched):             {counts['current']}")
    print(f"  Failed (left as it was):                          {counts['failed']}")
    print(f"  {verb + ' under today' + chr(39) + 's rules:':<50}{counts['rebuilt']}")
    print("  By level:")
    for code in level_codes:
        row = by_level[code]
        print(f"    {code}: {verb.lower()} {row['rebuilt']}, already current {row['current']}, opened by a student {row['opened']}")
    return counts


def run_results_phase(db, apply: bool) -> dict:
    level_codes = LevelCodesWithRetiredSections()
    print("\n" + LINE)
    print("PART 2 -- stored RESULTS that still count a removed section")
    print(f"Levels with a removed section: {', '.join(level_codes) if level_codes else '(none)'}")
    print(LINE)
    counts = {"checked": 0, "fine": 0, "recomputed": 0, "failed": 0}
    if not level_codes:
        return counts

    result_ids = [
        row[0]
        for row in db.query(CompetitionEventResult.id)
        .filter(CompetitionEventResult.competition_level_code.in_(level_codes))
        .order_by(CompetitionEventResult.competition_level_code.asc(), CompetitionEventResult.computed_at.asc())
        .all()
    ]
    db.rollback()
    counts["checked"] = len(result_ids)

    for result_id in result_ids:
        try:
            result = db.get(CompetitionEventResult, result_id)
            if not result:
                db.rollback()
                continue
            plan = RetiredSectionRecomputeFor(db, result)
            if plan is None:
                counts["fine"] += 1
                db.rollback()
                continue
            before, after = plan["before"], plan["after"]
            label = (
                f"{_student_label(db, result.student_id)} / {result.competition_level_code} / {result.attempt_type} / "
                f"attempt_id={result.attempt_id}"
            )
            line = (
                f"{_whole(before['score'])}/{_whole(before['maxScore'])} -> {_whole(after['score'])}/{_whole(after['maxScore'])}, "
                f"time {before['timeTakenSeconds']}s -> {after['timeTakenSeconds']}s"
            )
            if apply:
                ComputeAndFinalizeCompetitionEventResult(db, plan["attempt"])
                db.commit()
            else:
                db.rollback()
            counts["recomputed"] += 1
            print(f"  [{'RECOMPUTED' if apply else 'WOULD RECOMPUTE'}] {label}: {line}")
        except Exception as Error:  # noqa: BLE001 -- one bad result must never abort the rest
            db.rollback()
            counts["failed"] += 1
            print(f"  [FAILED -- left as it was] result_id={result_id}: {getattr(Error, 'detail', None) or Error}")

    verb = "Recomputed" if apply else "Would recompute"
    print(f"\nRESULTS checked: {counts['checked']}")
    print(f"  Already without the removed section (untouched): {counts['fine']}")
    print(f"  Failed (left as it was):                         {counts['failed']}")
    print(f"  {verb + ' on the remaining sections:':<49}{counts['recomputed']}")
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
        "ANNUAL COMPETITION QUESTION RULES BACKFILL -- mode: "
        f"{'APPLY (rebuilding papers, recomputing results)' if apply else 'DRY RUN (no changes will be written)'}"
    )
    print(f"Question rules version: {ANNUAL_COMPETITION_QUESTION_RULES_VERSION}")
    # Which database this run is looking at (password hidden) -- so a run
    # started from the wrong folder, without backend/.env, is obvious at once
    # instead of quietly reporting "0 papers" from an empty local file.
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    print("=" * 88)

    db = SessionLocal()
    try:
        official = report_official_papers(db, level_codes)
        db.rollback()
        papers = run_practice_phase(db, apply, level_codes)
        results = run_results_phase(db, apply)

        print("\n" + "=" * 88)
        print("OVERALL SUMMARY")
        print("=" * 88)
        print(f"OFFICIAL papers listed (never touched): {official['listed']}")
        if official["old"]:
            print(f"  of which still on OLD questions: {official['old']}  <-- regenerate them from the studio")
        if official["old_locked"]:
            print(f"  of which LOCKED and cannot be regenerated: {official['old_locked']}")
        print(f"PRACTICE papers {'rebuilt' if apply else 'that would be rebuilt'}: {papers['rebuilt']}")
        print(f"PRACTICE papers already on today's rules: {papers['current']}")
        print(f"PRACTICE papers opened by a student (untouched): {papers['opened']}")
        print(f"RESULTS {'recomputed' if apply else 'that would be recomputed'}: {results['recomputed']}")
        failed = papers["failed"] + results["failed"]
        if failed:
            print(f"FAILED and left as they were: {failed}  <-- read the [FAILED] lines above")
        if not apply:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply to rebuild and recompute.")
        else:
            print("\nDone. Running this again should now report 0 to rebuild and 0 to recompute.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
