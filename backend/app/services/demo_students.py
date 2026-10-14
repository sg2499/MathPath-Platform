"""Demo / test student accounts (2026-10-14, Phase 2 part 3).

Shailesh: "flag them as demo and leave them out of every count to have
everything clean." A demo account (students.is_demo) can still sign in and
use the platform exactly as before, and admin still sees it on the Students
page (marked Demo). Everywhere else it is left out:

- every tracker, readiness view, results page, assessment and mock list,
  approval queue and dashboard number, for admin and teachers;
- every leaderboard (practice, mock and annual), so it never takes a place
  from a real student, and the podium / rank notices that come from them;
- every notification to admin or a teacher about the student's activity;
- billing: no monthly invoice drafts, not listed as "not billed", not in
  the dues or collection numbers.

The account MP-ST-001 is also the assessment test account
(IsAssessmentOpenAccessStudent); teachers can still assign it any level's
assessment from Assign Assessment.

Mark accounts with backend/scripts/mark_demo_students.py.
"""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Query, Session

from app.models import Student

_CACHE_KEY = "mp_demo_student_ids"


def DemoStudentIds(Db: Session) -> set[str]:
    """Ids of every demo student, read once per request/session."""
    Cached = Db.info.get(_CACHE_KEY)
    if Cached is None:
        Cached = {Row[0] for Row in Db.query(Student.id).filter(Student.is_demo == True).all()}  # noqa: E712
        Db.info[_CACHE_KEY] = Cached
    return Cached


def IsDemoStudent(StudentItem: Student | None) -> bool:
    return bool(StudentItem is not None and getattr(StudentItem, "is_demo", False))


def IsDemoStudentId(Db: Session, StudentId: str | None) -> bool:
    return bool(StudentId) and StudentId in DemoStudentIds(Db)


def RealStudents(QueryValue: Query) -> Query:
    """Add 'not a demo account' to a query that selects or joins Student."""
    return QueryValue.filter(Student.is_demo == False)  # noqa: E712


def WithoutDemo(Db: Session, Items: Iterable, StudentIdOf=lambda Item: getattr(Item, "student_id", None)) -> list:
    """Drop items (rows, dicts, ORM objects) that belong to a demo student."""
    Demo = DemoStudentIds(Db)
    if not Demo:
        return list(Items)
    return [Item for Item in Items if StudentIdOf(Item) not in Demo]


def WithoutDemoColumn(Db: Session, QueryValue: Query, StudentIdColumn) -> Query:
    """Add 'not a demo student' to a query by its student id column (for
    tables that hold a student_id without joining Student)."""
    Demo = DemoStudentIds(Db)
    if not Demo:
        return QueryValue
    return QueryValue.filter((StudentIdColumn.is_(None)) | (StudentIdColumn.notin_(sorted(Demo))))
