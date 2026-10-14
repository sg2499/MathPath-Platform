"""Demo / test student accounts (2026-10-14, Phase 2 part 3).

Shailesh: demo accounts (students.is_demo -- MP-ST-001..009 on live) are
how new features get tested, so they must stay usable, but they must not
mix into the real numbers.

How it works -- one switch per request:

- Admin / teacher: a "Show Demo Accounts" switch in the top bar (remembered
  per browser) sends the header X-MP-Show-Demo: 1. With it ON, demo
  accounts appear everywhere for that person exactly like real students --
  lists, trackers, approval queues, leaderboards, notifications, billing,
  payments and every count. With it OFF (the default) they are left out of
  all of those.
- A signed-in demo student sees the platform as normal, including the
  leaderboards with the demo accounts on them. A real student never sees a
  demo account.
- Requests with no signed-in user (background jobs, payment webhooks) leave
  demo accounts out of lists and counts, but never block an operation on a
  demo account (a payment for a demo invoice is still processed).
- Always, whatever the switch: the automatic monthly invoice drafts on the
  1st skip demo accounts (a demo draft is made by hand with the switch on).

get_current_user() sets the switch for the request (on the request's own
database session) -- see SetIncludeDemo.

Mark accounts with backend/scripts/mark_demo_students.py.
"""
from __future__ import annotations

from typing import Iterable

from sqlalchemy import event, true
from sqlalchemy.orm import Query, Session, with_loader_criteria

from app.models import Student

_IDS_KEY = "mp_demo_student_ids"
_INCLUDE_KEY = "mp_include_demo"
_HIDE_PAYMENTS_KEY = "mp_hide_demo_payments"

SHOW_DEMO_HEADER = "X-MP-Show-Demo"


def SetIncludeDemo(Db: Session, Include: bool) -> None:
    Db.info[_INCLUDE_KEY] = bool(Include)


def IncludeDemo(Db: Session) -> bool:
    return bool(Db.info.get(_INCLUDE_KEY))


def AllDemoStudentIds(Db: Session) -> set[str]:
    """Every demo student's id, whatever the switch says (read once per
    session)."""
    Cached = Db.info.get(_IDS_KEY)
    if Cached is None:
        Cached = {Row[0] for Row in Db.query(Student.id).filter(Student.is_demo == True).all()}  # noqa: E712
        Db.info[_IDS_KEY] = Cached
    return Cached


def DemoStudentIds(Db: Session) -> set[str]:
    """The demo students to leave out of this request: none when the switch
    is on (or the viewer is a demo student), otherwise every demo student."""
    if IncludeDemo(Db):
        return set()
    return AllDemoStudentIds(Db)


def IsDemoStudent(StudentItem: Student | None) -> bool:
    return bool(StudentItem is not None and getattr(StudentItem, "is_demo", False))


def IsHiddenDemoStudent(Db: Session, StudentItem: Student | None) -> bool:
    """A demo student this request should leave out."""
    return IsDemoStudent(StudentItem) and not IncludeDemo(Db)


def IsDemoStudentId(Db: Session, StudentId: str | None) -> bool:
    """True when this student is a demo account to leave out of this request."""
    return bool(StudentId) and StudentId in DemoStudentIds(Db)


def RealStudentsClause(Db: Session):
    """'Not a demo account' for a query that selects or joins Student (always
    true when demo accounts are shown)."""
    return true() if IncludeDemo(Db) else (Student.is_demo == False)  # noqa: E712


def RealStudents(QueryValue: Query) -> Query:
    """Leave demo accounts out of a query that selects or joins Student,
    unless this request shows them."""
    Db = QueryValue.session
    if Db is not None and IncludeDemo(Db):
        return QueryValue
    return QueryValue.filter(Student.is_demo == False)  # noqa: E712


def WithoutDemo(Db: Session, Items: Iterable, StudentIdOf=lambda Item: getattr(Item, "student_id", None)) -> list:
    """Drop items (rows, dicts, ORM objects) that belong to a hidden demo student."""
    Demo = DemoStudentIds(Db)
    if not Demo:
        return list(Items)
    return [Item for Item in Items if StudentIdOf(Item) not in Demo]


def WithoutDemoColumn(Db: Session, QueryValue: Query, StudentIdColumn) -> Query:
    """Leave hidden demo students out of a query by its student id column
    (for tables that hold a student_id without joining Student)."""
    Demo = DemoStudentIds(Db)
    if not Demo:
        return QueryValue
    return QueryValue.filter((StudentIdColumn.is_(None)) | (StudentIdColumn.notin_(sorted(Demo))))


# --- Payments --------------------------------------------------------------
# The Payments screens read invoices, payments, drafts, online orders and
# follow-ups in many places. Rather than touch every query, an admin GET on
# a payments screen with the switch off marks its session, and every SELECT
# of those tables in that request then leaves demo accounts' rows out. Only
# reads are affected: recording a payment, a webhook or any other change is
# never filtered, so nothing for a demo account can get lost.

def HideDemoPaymentsForThisRequest(Db: Session) -> None:
    if DemoStudentIds(Db):
        Db.info[_HIDE_PAYMENTS_KEY] = True


def _PaymentModels() -> list:
    from app.models import OnlinePaymentOrder, PaymentFollowUp, PaymentInvoice, PaymentInvoiceDraft, PaymentReceipt

    return [PaymentInvoice, PaymentReceipt, PaymentInvoiceDraft, OnlinePaymentOrder, PaymentFollowUp]


@event.listens_for(Session, "do_orm_execute")
def _HideDemoPaymentRows(OrmExecuteState) -> None:
    Db = OrmExecuteState.session
    if not OrmExecuteState.is_select or not Db.info.get(_HIDE_PAYMENTS_KEY):
        return
    Demo = sorted(DemoStudentIds(Db))
    if not Demo:
        return
    Options = [
        with_loader_criteria(Model, lambda Cls, Ids=tuple(Demo): Cls.student_id.notin_(Ids), include_aliases=True, track_closure_variables=False)
        for Model in _PaymentModels()
    ]
    OrmExecuteState.statement = OrmExecuteState.statement.options(*Options)
