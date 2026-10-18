"""Birthdays API (2026-10-18). Plan: `claude/mathpath-birthdays-plan-oct18.md`.

Student: today's greeting, if it's their birthday. A student only ever
sees their own greeting: the student comes from the session, never from
the address.

Admin: every active student's birthday in a date range, the tile counts,
students whose date of birth needs fixing, and an Excel export. Demo
accounts follow the Show Demo switch, as everywhere else."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_student, get_current_teacher, require_roles
from app.models import Student, Teacher, User
from app.services.birthday_export import BuildBirthdaysWorkbook
from pydantic import BaseModel

from app.services.birthday_service import (
    CreateWish,
    ListWishes,
    PreviewWish,
    UpdateWish,
    WishError,
    BirthdayFilterOptions,
    GreetingFor,
    GreetingPayload,
    MarkGreeting,
    MissingDob,
    StaffBirthdays,
    TeacherLevelOptions,
    TodayIndia,
)
from app.core.errors import api_error

student_router = APIRouter(prefix="/api/student/birthday", tags=["student-birthday"])


@student_router.get("")
def student_birthday(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Greeting = GreetingFor(db, student)
    if Greeting is None:
        return {"isBirthday": False, "greeting": None}
    return {"isBirthday": True, "greeting": GreetingPayload(db, student, Greeting)}


@student_router.post("/{greeting_id}/seen")
def student_birthday_seen(greeting_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Greeting = MarkGreeting(db, student, greeting_id, Seen=True)
    if Greeting is None:
        api_error(404, "NOT_FOUND", "Greeting not found.")
    return {"ok": True}


@student_router.post("/{greeting_id}/dismiss")
def student_birthday_dismiss(greeting_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Greeting = MarkGreeting(db, student, greeting_id, Dismissed=True)
    if Greeting is None:
        api_error(404, "NOT_FOUND", "Greeting not found.")
    return {"ok": True}


admin_router = APIRouter(prefix="/api/admin/birthdays", tags=["admin-birthdays"])
admin_dep = require_roles("SUPER_ADMIN", "ADMIN")


def _Range(start: str | None, days: int | None, month: str | None) -> tuple[date, date]:
    """A calendar month (month=YYYY-MM), or `days` days from `start`
    (default: 30 days from today, India time)."""
    if month:
        try:
            Year, Month = (int(Part) for Part in month.split("-", 1))
            First = date(Year, Month, 1)
        except (ValueError, TypeError):
            api_error(400, "VALIDATION_ERROR", "Month must look like 2026-10.")
        Last = (First.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        return First, Last
    try:
        First = date.fromisoformat(start) if start else TodayIndia()
    except ValueError:
        api_error(400, "VALIDATION_ERROR", "Start must be a date like 2026-10-18.")
    Span = max(1, min(int(days or 30), 92))
    return First, First + timedelta(days=Span - 1)


@admin_router.get("")
def admin_birthdays(
    start: str | None = None,
    days: int | None = Query(default=None, ge=1, le=92),
    month: str | None = None,
    teacherId: str | None = None,
    levelId: str | None = None,
    centreId: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Start, End = _Range(start, days, month)
    Data = StaffBirthdays(db, Start=Start, End=End, TeacherId=teacherId, LevelId=levelId, CentreId=centreId, Search=q)
    Data["filters"] = BirthdayFilterOptions(db)
    return Data


@admin_router.get("/missing")
def admin_birthdays_missing(
    teacherId: str | None = None,
    levelId: str | None = None,
    centreId: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    return {"students": MissingDob(db, TeacherId=teacherId, LevelId=levelId, CentreId=centreId, Search=q)}


@admin_router.get("/export")
def admin_birthdays_export(
    start: str | None = None,
    days: int | None = Query(default=None, ge=1, le=92),
    month: str | None = None,
    teacherId: str | None = None,
    levelId: str | None = None,
    centreId: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Start, End = _Range(start, days, month)
    Data = StaffBirthdays(db, Start=Start, End=End, TeacherId=teacherId, LevelId=levelId, CentreId=centreId, Search=q)
    Name = f"MathPath Birthdays {Start.isoformat()} to {End.isoformat()}.xlsx"
    return Response(
        content=BuildBirthdaysWorkbook(Data["entries"]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{Name}"', "Cache-Control": "no-store"},
    )


@admin_router.get("/today")
def admin_birthdays_today(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    """For the dashboard: today's birthdays (names and ages only)."""
    Today = TodayIndia()
    Data = StaffBirthdays(db, Start=Today, End=Today)
    return {
        "today": Data["today"],
        "count": len(Data["entries"]),
        "students": [{"studentId": E["studentId"], "studentCode": E["studentCode"], "name": E["name"], "age": E["age"], "status": E["status"]} for E in Data["entries"]],
    }


@admin_router.get("/sent")
def admin_birthdays_sent(
    month: str | None = None,
    teacherId: str | None = None,
    levelId: str | None = None,
    centreId: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    """Every birthday in a month up to today, with the wish each student got
    and when they saw it; a day the server missed shows as NOT_SENT."""
    Today = TodayIndia()
    Start, End = _Range(None, None, month or Today.strftime("%Y-%m"))
    if Start > Today:
        return {"today": Today.isoformat(), "start": Start.isoformat(), "end": End.isoformat(), "entries": []}
    Data = StaffBirthdays(db, Start=Start, End=min(End, Today), TeacherId=teacherId, LevelId=levelId, CentreId=centreId, Search=q)
    Data["entries"] = list(reversed(Data["entries"]))  # newest first
    Data["end"] = End.isoformat()
    return Data


class WishIn(BaseModel):
    text: str | None = None
    style: str | None = None
    ageBand: str | None = None
    isActive: bool | None = None


class PreviewIn(BaseModel):
    text: str


@admin_router.get("/wishes")
def admin_birthday_wishes(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return ListWishes(db)


@admin_router.post("/wishes")
def admin_birthday_wish_create(payload: WishIn, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    try:
        CreateWish(db, Text=payload.text or "", Style=payload.style or "", AgeBand=payload.ageBand or "", UserId=user.id)
    except WishError as Error:
        api_error(400, "VALIDATION_ERROR", str(Error))
    return ListWishes(db)


@admin_router.patch("/wishes/{wish_id}")
def admin_birthday_wish_update(wish_id: str, payload: WishIn, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    try:
        UpdateWish(db, wish_id, Text=payload.text, Style=payload.style, AgeBand=payload.ageBand, IsActive=payload.isActive, UserId=user.id)
    except LookupError:
        api_error(404, "NOT_FOUND", "Wish not found.")
    except WishError as Error:
        api_error(400, "VALIDATION_ERROR", str(Error))
    return ListWishes(db)


@admin_router.post("/wishes/preview")
def admin_birthday_wish_preview(payload: PreviewIn, user: User = Depends(admin_dep)):
    try:
        return {"samples": PreviewWish(payload.text)}
    except WishError as Error:
        api_error(400, "VALIDATION_ERROR", str(Error))


# ---------- teacher (Part 4): their own students only --------------------------

teacher_router = APIRouter(prefix="/api/teacher/birthdays", tags=["teacher-birthdays"])


@teacher_router.get("")
def teacher_birthdays(
    start: str | None = None,
    days: int | None = Query(default=None, ge=1, le=92),
    month: str | None = None,
    levelId: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    Start, End = _Range(start, days, month)
    Data = StaffBirthdays(db, Start=Start, End=End, LevelId=levelId, Search=q, OnlyTeacherId=teacher.id)
    Data["filters"] = {"levels": TeacherLevelOptions(db, teacher.id)}
    return Data


@teacher_router.get("/today")
def teacher_birthdays_today(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    Today = TodayIndia()
    Week = StaffBirthdays(db, Start=Today, End=Today + timedelta(days=6), OnlyTeacherId=teacher.id)
    return {
        "today": Week["today"],
        "counts": Week["counts"],
        "entries": [{key: Entry[key] for key in ("studentId", "studentCode", "name", "photoUrl", "levelCode", "date", "age", "isToday", "status")} for Entry in Week["entries"]],
    }
