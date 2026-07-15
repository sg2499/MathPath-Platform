#!/usr/bin/env python3
"""
Diagnostic + conservative safe-fix for the IM "Long Division & Estimation"
generation bug (Shailesh, 2026-07-15 -- see docs/project-memory/OPEN_ISSUES.md).

Background: IM's 3D/1D and 4D/1D "Long Division & Estimation" division
sections (isLongDivisionEstimation=True in curriculum_map.py's _DIV() calls)
were, until this fix, generating a dividend/divisor pair guaranteed to divide
evenly -- exactly like plain division, with no remainder. That defeats the
whole point of the concept: a student should be doing real long division to a
remainder, then rounding the quotient (truncate to 3 decimal places, then
round to 2 decimals on the 3rd decimal digit -- see
app/question_engine/im/operands.py's TruncateThenRoundQuotient()). The
generator and validator are now fixed going forward. This script finds any
ALREADY-PERSISTED content that was generated under the old, buggy logic
(recognizable because its stored dividend divides its stored divisor with zero
remainder) across all three delivery contexts, and safely cleans up only the
content nobody has actually seen/attempted yet.

What this script does NOT do, on purpose: it never touches a
GeneratedQuestionSet, AssessmentVersion, or CompetitionMockExam that a real
student has already started or completed an attempt against. Silently
swapping the numbers under an in-progress or already-graded attempt is a
fairness problem, not a data-hygiene one -- those cases are only ever
reported here, in full detail, for Shailesh to make an explicit call on
(leave as historical record, or handle some other way). --apply only ever
deletes rows that are pure unattempted/unpublished draft content, which the
normal generation flow will safely and correctly regenerate the next time
it's needed (DPS: next attempt start / next Publish DPS; assessments: next
Generate Preview / Publish Version; competition mocks: recreate via the
existing admin Create Mock flow).

Three areas scanned:
  1. DPS/practice: GeneratedQuestion rows (via GeneratedQuestionSet) tied to
     an Attempt. ALWAYS just reported -- persist_question_set() is only ever
     called from a real student's start_attempt(), so every affected row here
     represents real (in-progress or completed) student work. Never deleted
     by this script under any flag.
  2. Assessments: AssessmentQuestion rows (via AssessmentVersion). If the
     parent AssessmentVersion has zero AssessmentAttempt rows against it,
     --apply deletes the whole version (cascades to its questions/options) so
     a fresh one can be generated/published. If it has any attempts, only
     reported.
  3. Competition mocks: CompetitionMockQuestion rows (via CompetitionMockExam,
     matched on the same metadata flag as areas 1/2 -- NOT concept_tag, see
     the note above _is_long_division_metadata() for why title-string
     matching was tried and abandoned). If nobody has been assigned or has
     attempted the exam yet, --apply deletes the whole exam (cascades to its
     questions/options) so it can be recreated via the admin Create Mock
     flow. Otherwise, only reported.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/diagnose_and_fix_long_division_estimation.py --dry-run   # preview only
    python scripts/diagnose_and_fix_long_division_estimation.py --apply     # deletes safe-only rows

--dry-run is the default if neither flag is passed. Idempotent: re-running
after --apply finds nothing left to safely delete (anything remaining is
either already-fixed content or content this script deliberately never
touches).
"""
from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    Attempt,
    AssessmentAttempt,
    AssessmentQuestion,
    AssessmentVersion,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockQuestion,
    DPS,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Student,
)

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


# NOTE on why this script never filters by section-title/concept_tag string:
# two different naming conventions exist across contexts for the same
# concept -- DPS/assessment section titles use "3D ÷ 1D Long Division &
# Estimation (Visual/Abacus)" (curriculum_map.py's _DIV() helper) while
# competition mocks use "3D / 1D Long Division & Estimation" with no
# Visual/Abacus split (competition_mock_generation_service.py's IM_DIVISION
# pool list) -- confirmed the hard way this round, an earlier draft of this
# script filtered competition mocks on the wrong string format and silently
# found zero affected rows that a live browser check had already shown
# existed. The reliable, single filter for all three areas is the metadata
# flag via _is_long_division_metadata() below -- traced all the way through
# competition_mock_generation_service.py's own row-building code
# (`QuestionMetadata = dict(Metadata)` before adding competition-specific
# keys, so the original generator's is_long_division_estimation flag
# survives into metadata_json intact for mocks too). Never go back to
# title-string matching as the primary filter.


def _is_pre_fix_exact_division(operands_json: str | None) -> bool:
    """True if the stored [dividend, divisor] pair divides evenly -- the
    signature of a question generated before this fix (every post-fix Long
    Division & Estimation question is guaranteed to have a remainder)."""
    if not operands_json:
        return False
    try:
        operands = json.loads(operands_json)
        dividend = Decimal(str(operands[0]))
        divisor = Decimal(str(operands[1]))
    except (ValueError, TypeError, IndexError, InvalidOperation, json.JSONDecodeError):
        return False
    if divisor <= 0:
        return False
    return dividend % divisor == 0


def _is_long_division_metadata(metadata_json: str | None) -> bool:
    if not metadata_json:
        return False
    try:
        metadata = json.loads(metadata_json)
    except json.JSONDecodeError:
        return False
    return bool(metadata.get("is_long_division_estimation"))


def _scan_dps(db) -> list[dict]:
    """Area 1: DPS/practice. Always report-only -- see module docstring."""
    findings: list[dict] = []
    rows = (
        db.query(GeneratedQuestion, GeneratedQuestionSet, DPS)
        .join(GeneratedQuestionSet, GeneratedQuestion.question_set_id == GeneratedQuestionSet.id)
        .join(DPS, GeneratedQuestionSet.dps_id == DPS.id)
        .filter(GeneratedQuestion.operands_json.isnot(None))
        .all()
    )
    for question, qset, dps in rows:
        if not _is_long_division_metadata(question.metadata_json):
            continue
        if not _is_pre_fix_exact_division(question.operands_json):
            continue
        attempt = db.query(Attempt).filter(Attempt.question_set_id == qset.id).first()
        student = db.query(Student).filter(Student.id == qset.student_id).first() if qset.student_id else None
        findings.append({
            "dps_title": dps.dps_title,
            "dps_id": dps.id,
            "question_number": question.question_number,
            "operands": question.operands_json,
            "student_name": getattr(student, "full_name", None) or qset.student_id,
            "attempt_id": getattr(attempt, "id", None),
            "attempt_status": getattr(attempt, "status", "UNKNOWN (no attempt row found -- investigate manually)"),
        })
    return findings


def _scan_assessments(db, apply: bool) -> tuple[list[dict], int]:
    """Area 2: Assessments. Safe to delete only when zero AssessmentAttempt
    rows reference the parent AssessmentVersion."""
    findings: list[dict] = []
    deleted_versions = 0
    affected_version_ids: set[str] = set()

    rows = (
        db.query(AssessmentQuestion, AssessmentVersion)
        .join(AssessmentVersion, AssessmentQuestion.assessment_version_id == AssessmentVersion.id)
        .filter(AssessmentQuestion.operands_json.isnot(None))
        .all()
    )
    for question, version in rows:
        if not _is_long_division_metadata(question.metadata_json):
            continue
        if not _is_pre_fix_exact_division(question.operands_json):
            continue
        affected_version_ids.add(version.id)
        attempt_count = (
            db.query(AssessmentAttempt)
            .filter(AssessmentAttempt.assessment_version_id == version.id)
            .count()
        )
        findings.append({
            "version_id": version.id,
            "version_number": version.version_number,
            "version_status": version.status,
            "question_number": question.question_number,
            "operands": question.operands_json,
            "attempt_count": attempt_count,
            "safe_to_delete": attempt_count == 0,
        })

    if apply:
        for version_id in affected_version_ids:
            attempt_count = (
                db.query(AssessmentAttempt)
                .filter(AssessmentAttempt.assessment_version_id == version_id)
                .count()
            )
            if attempt_count == 0:
                version = db.query(AssessmentVersion).filter(AssessmentVersion.id == version_id).first()
                if version:
                    print(f"  [APPLY] Deleting untouched AssessmentVersion {version_id} "
                          f"(version {version.version_number}, status {version.status}) -- "
                          f"generate + publish a fresh version once ready.")
                    db.delete(version)
                    deleted_versions += 1
        if deleted_versions:
            db.commit()

    return findings, deleted_versions


def _competition_mock_is_untouched(db, exam_id: str) -> tuple[bool, int, int]:
    """A mock is safe to delete only if nobody has been assigned it yet AND
    nobody has attempted it -- status alone isn't reliable, since a DRAFT mock
    can still be assigned directly to students from Manage Mocks."""
    assignment_count = (
        db.query(CompetitionMockAssignment)
        .filter(CompetitionMockAssignment.mock_exam_id == exam_id)
        .count()
    )
    attempt_count = (
        db.query(CompetitionMockAttempt)
        .filter(CompetitionMockAttempt.mock_exam_id == exam_id)
        .count()
    )
    return assignment_count == 0 and attempt_count == 0, assignment_count, attempt_count


def _scan_competition_mocks(db, apply: bool) -> tuple[list[dict], int]:
    """Area 3: Competition mocks. Safe to delete only when nobody has been
    assigned or has attempted the exam yet -- see _competition_mock_is_untouched."""
    findings: list[dict] = []
    deleted_exams = 0
    affected_exam_ids: set[str] = set()

    rows = (
        db.query(CompetitionMockQuestion, CompetitionMockExam)
        .join(CompetitionMockExam, CompetitionMockQuestion.mock_exam_id == CompetitionMockExam.id)
        .filter(CompetitionMockQuestion.operands_json.isnot(None))
        .all()
    )
    for question, exam in rows:
        if not _is_long_division_metadata(question.metadata_json):
            continue
        if not _is_pre_fix_exact_division(question.operands_json):
            continue
        affected_exam_ids.add(exam.id)
        untouched, assignment_count, attempt_count = _competition_mock_is_untouched(db, exam.id)
        findings.append({
            "exam_id": exam.id,
            "exam_title": exam.title,
            "mock_code": exam.mock_code,
            "exam_status": exam.status,
            "question_number": question.question_number,
            "concept_tag": question.concept_tag,
            "operands": question.operands_json,
            "assignment_count": assignment_count,
            "attempt_count": attempt_count,
            "safe_to_delete": untouched,
        })

    if apply:
        for exam_id in affected_exam_ids:
            exam = db.query(CompetitionMockExam).filter(CompetitionMockExam.id == exam_id).first()
            if not exam:
                continue
            untouched, _assignment_count, _attempt_count = _competition_mock_is_untouched(db, exam_id)
            if untouched:
                print(f"  [APPLY] Deleting untouched competition mock '{exam.title}' "
                      f"(code {exam.mock_code}, id {exam_id}, status {exam.status}) -- "
                      f"recreate via admin Create Mock once ready.")
                db.delete(exam)
                deleted_exams += 1
        if deleted_exams:
            db.commit()

    return findings, deleted_exams


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Delete safe-only (unattempted/unpublished) affected rows. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"LONG DIVISION & ESTIMATION BACKFILL -- mode: {'APPLY (deleting safe-only rows)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        print("\n--- Area 1: DPS / Practice (always report-only, never deleted by this script) ---")
        dps_findings = _scan_dps(db)
        if not dps_findings:
            print("  None found.")
        for item in dps_findings:
            print(f"  DPS '{item['dps_title']}' (id {item['dps_id']}) Q{item['question_number']} "
                  f"operands={item['operands']} -- student={item['student_name']}, "
                  f"attempt={item['attempt_id']} status={item['attempt_status']} "
                  f"-- REVIEW MANUALLY, real student work.")

        print("\n--- Area 2: Assessments ---")
        assessment_findings, deleted_versions = _scan_assessments(db, apply)
        if not assessment_findings:
            print("  None found.")
        for item in assessment_findings:
            tag = "safe to delete" if item["safe_to_delete"] else "HAS ATTEMPTS -- review manually"
            print(f"  AssessmentVersion {item['version_id']} (v{item['version_number']}, "
                  f"status={item['version_status']}) Q{item['question_number']} operands={item['operands']} "
                  f"-- {item['attempt_count']} attempt(s) -- {tag}")
        if apply:
            print(f"  Deleted {deleted_versions} untouched AssessmentVersion(s).")

        print("\n--- Area 3: Competition Mocks ---")
        mock_findings, deleted_exams = _scan_competition_mocks(db, apply)
        if not mock_findings:
            print("  None found.")
        for item in mock_findings:
            tag = "safe to delete" if item["safe_to_delete"] else "ASSIGNED OR ATTEMPTED -- review manually"
            print(f"  Mock '{item['exam_title']}' (code {item['mock_code']}, id {item['exam_id']}, "
                  f"status={item['exam_status']}) Q{item['question_number']} [{item['concept_tag']}] "
                  f"operands={item['operands']} -- {item['assignment_count']} assignment(s), "
                  f"{item['attempt_count']} attempt(s) -- {tag}")
        if apply:
            print(f"  Deleted {deleted_exams} untouched DRAFT competition mock(s).")

        print("\n" + "=" * 88)
        total = len(dps_findings) + len(assessment_findings) + len(mock_findings)
        print(f"SUMMARY: {total} affected row(s) found across all three areas "
              f"({len(dps_findings)} DPS, {len(assessment_findings)} assessment, {len(mock_findings)} mock).")
        if not apply and total:
            print("Re-run with --apply to delete the safe-only (unattempted/unpublished) rows above.")
        if apply:
            print("Anything still flagged 'REVIEW MANUALLY' / 'HAS ATTEMPTS' / 'PUBLISHED OR ATTEMPTED' above "
                  "was deliberately left untouched -- decide case by case with Shailesh.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
