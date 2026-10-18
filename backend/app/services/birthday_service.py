"""Birthdays (2026-10-18, Shailesh). Plan: `claude/mathpath-birthdays-plan-oct18.md`.

  * ParseDob / DobStatus  read Student.dob (free text) without guessing
  * BirthdayOn            the day a birthday is celebrated in a year
                          (a 29 Feb birthday is on 28 Feb in other years)
  * PickWish              chooses the wish for a student's birthday
  * GreetingFor           today's greeting for a student (made on first use)
  * EnsureBirthdayGreetings  the morning job: makes the day's greetings and
                          sends each student their notification, from 07:00
                          India time; safe to run many times, from several
                          workers at once

"Today" is always India time (the server runs in UTC).
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import BirthdayGreeting, BirthdayWish, Level, Student, Teacher, User
from app.services.notification_service import CreateNotification

logger = logging.getLogger(__name__)

INDIA = ZoneInfo("Asia/Kolkata")
SEND_FROM = time(7, 0)  # morning notification, India time
MIN_AGE = 3
MAX_AGE = 20
# a student doesn't get the same wish again within this many years
NO_REPEAT_YEARS = 3
_LOCK_KEY = 742019018  # Postgres advisory lock for picking wishes

STYLES = ("WARM", "PLAYFUL", "PROUD", "MATHS", "SHORT")
AGE_BANDS = ("ALL", "YOUNG", "MIDDLE", "OLDER")


# ---------- dates ------------------------------------------------------------

def NowIndia() -> datetime:
    return datetime.now(timezone.utc).astimezone(INDIA)


def SecondsUntilNextCheck(Now: datetime | None = None, Every: int = 30 * 60) -> int:
    """How long the background check sleeps: its usual 30 minutes, cut short
    so it wakes a few seconds after 07:00 India time and the wishes go out
    on the hour, not up to half an hour later."""
    Now = (Now or datetime.now(timezone.utc)).astimezone(INDIA)
    Send = Now.replace(hour=SEND_FROM.hour, minute=SEND_FROM.minute, second=5, microsecond=0)
    if Send <= Now:
        Send += timedelta(days=1)
    return max(5, min(Every, int((Send - Now).total_seconds())))


def TodayIndia() -> date:
    return NowIndia().date()


_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y")


def ParseDob(Value: str | None) -> date | None:
    """A date of birth as written on the profile, or None if it can't be
    read for certain. Only full dates are accepted (no "05/06" guessing)."""
    Text = str(Value or "").strip()
    if not Text:
        return None
    Text = re.split(r"[ T]", Text, maxsplit=1)[0]  # "2016-11-16 00:00:00"
    for Format in _FORMATS:
        try:
            return datetime.strptime(Text, Format).date()
        except ValueError:
            continue
    return None


def AgeOn(Dob: date, Day: date) -> int:
    Years = Day.year - Dob.year
    if (Day.month, Day.day) < (Dob.month, Dob.day):
        Years -= 1
    return Years


def DobStatus(Value: str | None, Today: date | None = None) -> str:
    """OK, MISSING, UNREADABLE or UNLIKELY (in the future, or an age outside
    3 to 20)."""
    if not str(Value or "").strip():
        return "MISSING"
    Dob = ParseDob(Value)
    if Dob is None:
        return "UNREADABLE"
    Today = Today or TodayIndia()
    if Dob > Today:
        return "UNLIKELY"
    Age = AgeOn(Dob, Today)
    if Age < MIN_AGE or Age > MAX_AGE:
        return "UNLIKELY"
    return "OK"


def _IsLeap(Year: int) -> bool:
    return Year % 4 == 0 and (Year % 100 != 0 or Year % 400 == 0)


def BirthdayOn(Dob: date, Year: int) -> date:
    """The day this birthday is celebrated in a given year."""
    if Dob.month == 2 and Dob.day == 29 and not _IsLeap(Year):
        return date(Year, 2, 28)
    return date(Year, Dob.month, Dob.day)


def AgeBand(Age: int | None) -> str:
    if Age is None:
        return "ALL"
    if Age <= 8:
        return "YOUNG"
    if Age <= 12:
        return "MIDDLE"
    return "OLDER"


# ---------- who has a birthday ----------------------------------------------

def _StudentRows(Db: Session, IncludeDemo: bool):
    Query = (
        Db.query(Student, User)
        .join(User, User.id == Student.user_id)
        .filter(Student.is_active.is_(True), User.is_active.is_(True), Student.dob.isnot(None))
    )
    if not IncludeDemo:
        Query = Query.filter(Student.is_demo.is_(False))
    return Query.all()


def BirthdayStudentsOn(Db: Session, Day: date, *, IncludeDemo: bool = False) -> list[tuple[Student, User, date, int]]:
    """Active students whose birthday is celebrated on `Day`, with their
    date of birth and the age they turn. Ordered by student code so the
    morning job always handles them in the same order."""
    Out = []
    for StudentRow, UserRow in _StudentRows(Db, IncludeDemo):
        if DobStatus(StudentRow.dob, Day) != "OK":
            continue
        Dob = ParseDob(StudentRow.dob)
        if BirthdayOn(Dob, Day.year) == Day:
            Out.append((StudentRow, UserRow, Dob, Day.year - Dob.year))
    Out.sort(key=lambda Row: Row[0].student_code or "")
    return Out


def IsBirthdayToday(StudentRow: Student, Today: date | None = None) -> bool:
    Today = Today or TodayIndia()
    if DobStatus(StudentRow.dob, Today) != "OK":
        return False
    return BirthdayOn(ParseDob(StudentRow.dob), Today.year) == Today


# ---------- wishes -----------------------------------------------------------

def FirstName(FullName: str | None) -> str:
    Parts = str(FullName or "").strip().split()
    return Parts[0] if Parts else "Friend"


def LevelCode(Db: Session, StudentRow: Student) -> str | None:
    if not StudentRow.current_level_id:
        return None
    LevelRow = Db.query(Level).filter(Level.id == StudentRow.current_level_id).first()
    return LevelRow.level_code if LevelRow else None


def RenderWish(Text: str, *, Name: str, Age: int | None, Level: str | None) -> str:
    Out = Text.replace("{name}", Name)
    Out = Out.replace("{age}", str(Age) if Age is not None else "another year")
    Out = Out.replace("{level}", Level or "your level")
    return Out


def _Seeded(StudentId: str, Year: int, WishId: str) -> str:
    return hashlib.sha256(f"{StudentId}:{Year}:{WishId}".encode()).hexdigest()


def PickWish(
    Db: Session,
    *,
    StudentId: str,
    Year: int,
    Age: int | None,
    HasLevel: bool,
    TakenToday: set[str],
) -> BirthdayWish | None:
    """The wish for one student's birthday.

    1. Active wishes for the student's age band (ALL or their own band);
       {level} wishes only if the student has a current level.
    2. Not one this student got in the last three years.
    3. Not one another student already got today.
    4. The least used overall first; between equals, a choice seeded by the
       student and year (varied, but the same on a re-run).
    If the rules leave nothing, rule 3 and then rule 2 are relaxed."""
    Band = AgeBand(Age)
    Wishes = (
        Db.query(BirthdayWish)
        .filter(BirthdayWish.is_active.is_(True), BirthdayWish.age_band.in_(["ALL", Band]))
        .all()
    )
    if not HasLevel:
        Wishes = [Wish for Wish in Wishes if not Wish.needs_level]
    if not Wishes:
        return None

    Recent = {
        WishId
        for (WishId,) in Db.query(BirthdayGreeting.wish_id)
        .filter(
            BirthdayGreeting.student_id == StudentId,
            BirthdayGreeting.year >= Year - NO_REPEAT_YEARS,
            BirthdayGreeting.year < Year,
            BirthdayGreeting.wish_id.isnot(None),
        )
        .all()
    }
    Usage = dict(
        Db.query(BirthdayGreeting.wish_id, func.count(BirthdayGreeting.id))
        .filter(BirthdayGreeting.wish_id.isnot(None))
        .group_by(BirthdayGreeting.wish_id)
        .all()
    )

    for Pool in (
        [Wish for Wish in Wishes if Wish.id not in Recent and Wish.id not in TakenToday],
        [Wish for Wish in Wishes if Wish.id not in Recent],
        Wishes,
    ):
        if Pool:
            return min(Pool, key=lambda Wish: (Usage.get(Wish.id, 0), _Seeded(StudentId, Year, Wish.id)))
    return None


def _LockForPicking(Db: Session) -> None:
    """Two greetings made at the same moment (the morning job on two
    workers, or two students opening their dashboard) must not pick the
    same wish: one waits for the other."""
    if Db.bind is not None and Db.bind.dialect.name == "postgresql":
        Db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _LOCK_KEY})


def _TakenOn(Db: Session, Day: date) -> set[str]:
    return {
        WishId
        for (WishId,) in Db.query(BirthdayGreeting.wish_id)
        .filter(BirthdayGreeting.birthday_date == Day, BirthdayGreeting.wish_id.isnot(None))
        .all()
    }


def _MakeGreeting(Db: Session, StudentRow: Student, UserRow: User, Dob: date, Day: date) -> BirthdayGreeting:
    Age = Day.year - Dob.year
    Level = LevelCode(Db, StudentRow)
    Wish = PickWish(Db, StudentId=StudentRow.id, Year=Day.year, Age=Age, HasLevel=bool(Level), TakenToday=_TakenOn(Db, Day))
    if Wish is not None:
        Text = RenderWish(Wish.text, Name=FirstName(UserRow.full_name), Age=Age, Level=Level)
    else:  # every wish switched off: still say something kind
        Text = f"We hope today is full of happy moments, {FirstName(UserRow.full_name)}."
    Greeting = BirthdayGreeting(
        student_id=StudentRow.id,
        year=Day.year,
        birthday_date=Day,
        wish_id=Wish.id if Wish else None,
        rendered_text=Text,
        age=Age,
    )
    Db.add(Greeting)
    Db.flush()
    return Greeting


def _Existing(Db: Session, StudentId: str, Year: int) -> BirthdayGreeting | None:
    return (
        Db.query(BirthdayGreeting)
        .filter(BirthdayGreeting.student_id == StudentId, BirthdayGreeting.year == Year)
        .first()
    )


def GreetingFor(Db: Session, StudentRow: Student, Today: date | None = None) -> BirthdayGreeting | None:
    """Today's greeting for this student, made the first time it is asked
    for (the dashboard may open before the morning job has run). None if
    it isn't their birthday."""
    Today = Today or TodayIndia()
    if not IsBirthdayToday(StudentRow, Today):
        return None
    Found = _Existing(Db, StudentRow.id, Today.year)
    if Found is not None:
        return Found
    UserRow = Db.query(User).filter(User.id == StudentRow.user_id).first()
    _LockForPicking(Db)
    Found = _Existing(Db, StudentRow.id, Today.year)  # made while we waited
    if Found is not None:
        return Found
    Greeting = _MakeGreeting(Db, StudentRow, UserRow, ParseDob(StudentRow.dob), Today)
    Db.commit()
    return Greeting


def SignedBy(Db: Session, StudentRow: Student) -> str:
    """'Meera Iyer and everyone at MathPath', or just 'Everyone at MathPath'."""
    if StudentRow.teacher_id:
        TeacherRow = Db.query(Teacher).filter(Teacher.id == StudentRow.teacher_id).first()
        if TeacherRow is not None and TeacherRow.is_active and TeacherRow.user is not None:
            return f"{TeacherRow.user.full_name} and everyone at MathPath"
    return "Everyone at MathPath"


def GreetingPayload(Db: Session, StudentRow: Student, Greeting: BirthdayGreeting) -> dict:
    UserRow = Db.query(User).filter(User.id == StudentRow.user_id).first()
    Wish = Db.query(BirthdayWish).filter(BirthdayWish.id == Greeting.wish_id).first() if Greeting.wish_id else None
    return {
        "id": Greeting.id,
        "date": Greeting.birthday_date.isoformat(),
        "firstName": FirstName(UserRow.full_name if UserRow else None),
        "age": Greeting.age,
        "text": Greeting.rendered_text,
        "style": Wish.style if Wish else "WARM",
        "signedBy": SignedBy(Db, StudentRow),
        "seen": Greeting.seen_at is not None,
        "dismissed": Greeting.dismissed_at is not None,
    }


# ---------- the morning job --------------------------------------------------

def _NotifyStudent(Db: Session, StudentRow: Student, UserRow: User, Greeting: BirthdayGreeting) -> None:
    CreateNotification(
        Db,
        recipient_user_id=UserRow.id,
        recipient_role="STUDENT",
        type="BIRTHDAY_GREETING",
        category="BIRTHDAY",
        title=f"Happy Birthday, {FirstName(UserRow.full_name)}!",
        message=Greeting.rendered_text,
        student_id=StudentRow.id,
        target_route="/student/dashboard?birthday=1",
        color_variant="ROSE",
        metadata={"greetingId": Greeting.id, "age": Greeting.age, "date": Greeting.birthday_date.isoformat()},
    )
    Greeting.notified_student_at = datetime.now(timezone.utc)


def EnsureBirthdayGreetings(Db: Session, Now: datetime | None = None) -> int:
    """Make today's greetings and send each student their notification.
    Nothing is sent before 07:00 India time. A greeting already made (by an
    earlier run, or when the student opened their dashboard early) is not
    made again, and a notification already sent is not sent again. Returns
    how many notifications were sent."""
    Now = (Now or datetime.now(timezone.utc)).astimezone(INDIA)
    Today = Now.date()
    if Now.time() < SEND_FROM:
        return 0
    Rows = BirthdayStudentsOn(Db, Today, IncludeDemo=True)
    if not Rows:
        return 0
    _LockForPicking(Db)
    Sent = 0
    for StudentRow, UserRow, Dob, _Age in Rows:
        Greeting = _Existing(Db, StudentRow.id, Today.year) or _MakeGreeting(Db, StudentRow, UserRow, Dob, Today)
        if Greeting.notified_student_at is None:
            _NotifyStudent(Db, StudentRow, UserRow, Greeting)
            Sent += 1
        if Greeting.notified_teacher_at is None and not StudentRow.is_demo:
            _NotifyTeacher(Db, StudentRow, UserRow, Greeting)
    _NotifyAdmins(Db, Today, [(StudentRow, UserRow, Today.year - Dob.year) for StudentRow, UserRow, Dob, _ in Rows if not StudentRow.is_demo])
    Db.commit()
    return Sent


def _NotifyTeacher(Db: Session, StudentRow: Student, UserRow: User, Greeting: BirthdayGreeting) -> None:
    """The student's teacher hears about their own student's birthday, once.
    Demo students are left out (the morning job has no Show Demo switch)."""
    from app.models import Notification

    Stamp = datetime.now(timezone.utc)
    if not StudentRow.teacher_id:
        Greeting.notified_teacher_at = Stamp  # nobody to tell
        return
    TeacherRow = Db.query(Teacher).filter(Teacher.id == StudentRow.teacher_id).first()
    TeacherUser = TeacherRow.user if TeacherRow is not None else None
    if TeacherRow is None or not TeacherRow.is_active or TeacherUser is None or not TeacherUser.is_active:
        Greeting.notified_teacher_at = Stamp
        return
    Id = f"bday-t-{Greeting.id}"
    if Db.query(Notification).filter(Notification.id == Id).first() is None:
        CreateNotification(
            Db,
            notification_id=Id,
            recipient_user_id=TeacherUser.id,
            recipient_role="TEACHER",
            type="STUDENT_BIRTHDAY",
            category="BIRTHDAY",
            title=f"{UserRow.full_name} Turns {Greeting.age} Today",
            message=f"It's {FirstName(UserRow.full_name)}'s birthday. Their birthday wish has gone out in the app.",
            student_id=StudentRow.id,
            teacher_id=TeacherRow.id,
            target_route="/teacher/birthdays",
            color_variant="ROSE",
            metadata={"date": Greeting.birthday_date.isoformat(), "age": Greeting.age, "studentCode": StudentRow.student_code},
        )
    Greeting.notified_teacher_at = Stamp


def AdminSummaryId(UserId: str, Day: date) -> str:
    return f"bday-{Day.isoformat()}-{UserId}"


def _NotifyAdmins(Db: Session, Day: date, People: list[tuple[Student, User, int]]) -> None:
    """One notification a day for each admin: who has a birthday today
    (demo accounts left out). If a birthday is added later in the day (a
    date of birth fixed), the same notification is updated, not repeated."""
    from app.models import Notification
    from app.services.notification_service import ActiveAdminUsers

    if not People:
        return
    People = sorted(People, key=lambda Item: (Item[1].full_name or "").lower())
    Count = len(People)
    Title = f"{Count} Birthday{'' if Count == 1 else 's'} Today"
    Names = [f"{UserRow.full_name} (turns {Age})" for _, UserRow, Age in People]
    Message = (", ".join(Names[:6]) + (f" and {Count - 6} more" if Count > 6 else "")) + (
        ". Their birthday wish has gone out in the app." if Count == 1 else ". Their birthday wishes have gone out in the app."
    )
    for Admin in ActiveAdminUsers(Db):
        Id = AdminSummaryId(Admin.id, Day)
        Existing = Db.query(Notification).filter(Notification.id == Id).first()
        if Existing is not None:
            if Existing.title != Title or Existing.message != Message:
                Existing.title, Existing.message = Title, Message
            continue
        CreateNotification(
            Db,
            notification_id=Id,
            recipient_user_id=Admin.id,
            recipient_role=Admin.role,
            type="BIRTHDAYS_TODAY",
            category="BIRTHDAY",
            title=Title,
            message=Message,
            target_route="/admin/birthdays",
            color_variant="ROSE",
            metadata={"date": Day.isoformat(), "count": Count},
        )


def MarkGreeting(Db: Session, StudentRow: Student, GreetingId: str, *, Seen: bool = False, Dismissed: bool = False) -> BirthdayGreeting | None:
    Greeting = (
        Db.query(BirthdayGreeting)
        .filter(BirthdayGreeting.id == GreetingId, BirthdayGreeting.student_id == StudentRow.id)
        .first()
    )
    if Greeting is None:
        return None
    Stamp = datetime.now(timezone.utc)
    if Seen and Greeting.seen_at is None:
        Greeting.seen_at = Stamp
    if Dismissed:
        if Greeting.seen_at is None:
            Greeting.seen_at = Stamp
        if Greeting.dismissed_at is None:
            Greeting.dismissed_at = Stamp
    Db.commit()
    return Greeting


# ---------- staff views (admin now; teacher in Part 4) -----------------------

def _Maps(Db: Session) -> tuple[dict, dict, dict]:
    from app.models import PaymentCentre

    Levels = {Row.id: Row.level_code for Row in Db.query(Level.id, Level.level_code).all()}
    Teachers = {
        TeacherRow.id: UserRow.full_name
        for TeacherRow, UserRow in Db.query(Teacher, User).join(User, User.id == Teacher.user_id).all()
    }
    Centres = {Row.id: Row.name for Row in Db.query(PaymentCentre.id, PaymentCentre.name).all()}
    return Levels, Teachers, Centres


def _StaffStudents(Db: Session, *, TeacherId: str | None = None, LevelId: str | None = None, CentreId: str | None = None, Search: str | None = None, OnlyTeacherId: str | None = None):
    """Active students for a staff view, demo accounts following the
    request's Show Demo switch. OnlyTeacherId limits it to one teacher's
    students (the teacher's own view), whatever the filters say."""
    from app.services.demo_students import RealStudentsClause

    Query = (
        Db.query(Student, User)
        .join(User, User.id == Student.user_id)
        .filter(Student.is_active.is_(True), User.is_active.is_(True), RealStudentsClause(Db))
    )
    if OnlyTeacherId:
        Query = Query.filter(Student.teacher_id == OnlyTeacherId)
    elif TeacherId:
        Query = Query.filter(Student.teacher_id == TeacherId) if TeacherId != "NONE" else Query.filter(Student.teacher_id.is_(None))
    if LevelId:
        Query = Query.filter(Student.current_level_id == LevelId)
    if CentreId:
        Query = Query.filter(Student.centre_id == CentreId) if CentreId != "NONE" else Query.filter(Student.centre_id.is_(None))
    if Search and Search.strip():
        Term = f"%{Search.strip().lower()}%"
        Query = Query.filter(func.lower(User.full_name).like(Term) | func.lower(Student.student_code).like(Term))
    return Query.all()


def _GreetingStatus(Greeting: BirthdayGreeting | None, Day: date, Now: datetime) -> str:
    """SEEN, SENT, WAITING (made, not yet sent), SCHEDULED (today before
    07:00, or a day still to come) or NOT_SENT (a day that has passed with
    no greeting, e.g. the server was down that morning)."""
    Today = Now.date()
    if Greeting is not None:
        if Greeting.seen_at is not None:
            return "SEEN"
        if Greeting.notified_student_at is not None:
            return "SENT"
        return "WAITING" if Day >= Today else "NOT_SENT"
    if Day > Today or (Day == Today and Now.time() < SEND_FROM):
        return "SCHEDULED"
    return "NOT_SENT"


def _Person(StudentRow: Student, UserRow: User, Levels: dict, Teachers: dict, Centres: dict) -> dict:
    return {
        "studentId": StudentRow.id,
        "studentCode": StudentRow.student_code,
        "name": UserRow.full_name,
        "photoUrl": StudentRow.photo_url or UserRow.photo_url,
        "levelCode": Levels.get(StudentRow.current_level_id),
        "teacherName": Teachers.get(StudentRow.teacher_id) or (StudentRow.teacher or None),
        "centreName": Centres.get(StudentRow.centre_id),
        "isDemo": bool(StudentRow.is_demo),
    }


def StaffBirthdays(
    Db: Session,
    *,
    Start: date,
    End: date,
    TeacherId: str | None = None,
    LevelId: str | None = None,
    CentreId: str | None = None,
    Search: str | None = None,
    OnlyTeacherId: str | None = None,
    Now: datetime | None = None,
) -> dict:
    """Every birthday celebrated from Start to End (inclusive, at most a
    year), with the counts for the tiles. Ordered by date, then name."""
    Now = (Now or datetime.now(timezone.utc)).astimezone(INDIA)
    Today = Now.date()
    if End < Start:
        Start, End = End, Start
    End = min(End, Start + timedelta(days=366))
    Levels, Teachers, Centres = _Maps(Db)
    Rows = _StaffStudents(Db, TeacherId=TeacherId, LevelId=LevelId, CentreId=CentreId, Search=Search, OnlyTeacherId=OnlyTeacherId)

    WeekEnd = Today + timedelta(days=6)
    MonthStart = Today.replace(day=1)
    MonthEnd = (MonthStart.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    Counts = {"today": 0, "thisWeek": 0, "thisMonth": 0, "missingDob": 0}

    Hits: list[tuple[date, Student, User, date]] = []
    for StudentRow, UserRow in Rows:
        if DobStatus(StudentRow.dob, Today) != "OK":
            Counts["missingDob"] += 1
            continue
        Dob = ParseDob(StudentRow.dob)
        This = BirthdayOn(Dob, Today.year)
        Next = This if This >= Today else BirthdayOn(Dob, Today.year + 1)
        Counts["today"] += Next == Today
        Counts["thisWeek"] += Today <= Next <= WeekEnd
        Counts["thisMonth"] += MonthStart <= This <= MonthEnd
        for Year in range(Start.year, End.year + 1):
            Day = BirthdayOn(Dob, Year)
            if Start <= Day <= End and Day.year - Dob.year >= 1:
                Hits.append((Day, StudentRow, UserRow, Dob))

    Ids = list({StudentRow.id for _, StudentRow, _, _ in Hits})
    Greetings = {}
    if Ids:
        for Greeting in Db.query(BirthdayGreeting).filter(
            BirthdayGreeting.student_id.in_(Ids),
            BirthdayGreeting.year >= Start.year,
            BirthdayGreeting.year <= End.year,
        ).all():
            Greetings[(Greeting.student_id, Greeting.year)] = Greeting

    Hits.sort(key=lambda Hit: (Hit[0], (Hit[2].full_name or "").lower()))
    Entries = []
    for Day, StudentRow, UserRow, Dob in Hits:
        Greeting = Greetings.get((StudentRow.id, Day.year))
        Entries.append({
            **_Person(StudentRow, UserRow, Levels, Teachers, Centres),
            "date": Day.isoformat(),
            "age": Day.year - Dob.year,
            "isToday": Day == Today,
            "status": _GreetingStatus(Greeting, Day, Now),
            "wish": Greeting.rendered_text if Greeting else None,
            "sentAt": Greeting.notified_student_at.isoformat() if Greeting and Greeting.notified_student_at else None,
            "seenAt": Greeting.seen_at.isoformat() if Greeting and Greeting.seen_at else None,
        })
    return {
        "today": Today.isoformat(),
        "start": Start.isoformat(),
        "end": End.isoformat(),
        "sendTime": SEND_FROM.strftime("%H:%M"),
        "counts": Counts,
        "entries": Entries,
    }


def MissingDob(Db: Session, *, TeacherId: str | None = None, LevelId: str | None = None, CentreId: str | None = None, Search: str | None = None) -> list[dict]:
    """Active students whose date of birth is missing, can't be read or is
    unlikely, so it can be fixed."""
    Today = TodayIndia()
    Levels, Teachers, Centres = _Maps(Db)
    Out = []
    for StudentRow, UserRow in _StaffStudents(Db, TeacherId=TeacherId, LevelId=LevelId, CentreId=CentreId, Search=Search):
        Status = DobStatus(StudentRow.dob, Today)
        if Status == "OK":
            continue
        Out.append({**_Person(StudentRow, UserRow, Levels, Teachers, Centres), "dob": (StudentRow.dob or "").strip() or None, "problem": Status})
    Out.sort(key=lambda Row: (Row["name"] or "").lower())
    return Out


def BirthdayFilterOptions(Db: Session) -> dict:
    from app.models import PaymentCentre

    Teachers = sorted(
        ({"id": TeacherRow.id, "name": UserRow.full_name} for TeacherRow, UserRow in Db.query(Teacher, User).join(User, User.id == Teacher.user_id).filter(Teacher.is_active.is_(True)).all()),
        key=lambda Row: Row["name"].lower(),
    )
    from app.models import Module

    Levels = [
        {"id": Row.id, "code": Row.level_code}
        for Row in Db.query(Level).join(Module, Module.id == Level.module_id)
        .filter(Level.is_active.is_(True))
        .order_by(Module.display_order, Level.display_order, Level.level_code)
        .all()
    ]
    Centres = [
        {"id": Row.id, "name": Row.name}
        for Row in Db.query(PaymentCentre).filter(PaymentCentre.is_active.is_(True)).order_by(PaymentCentre.display_order, PaymentCentre.name).all()
    ]
    return {"teachers": Teachers, "levels": Levels, "centres": Centres}


# ---------- managing wishes (admin, Part 3) ----------------------------------

PLACEHOLDERS = ("{name}", "{age}", "{level}")
MAX_WISH_LENGTH = 280
MIN_PER_BAND = 10


def _UsageMaps(Db: Session) -> tuple[dict, dict]:
    Rows = (
        Db.query(BirthdayGreeting.wish_id, func.count(BirthdayGreeting.id), func.max(BirthdayGreeting.birthday_date))
        .filter(BirthdayGreeting.wish_id.isnot(None))
        .group_by(BirthdayGreeting.wish_id)
        .all()
    )
    return {Row[0]: Row[1] for Row in Rows}, {Row[0]: Row[2] for Row in Rows}


def ActiveWishCounts(Db: Session) -> dict[str, int]:
    """How many active wishes each age group can draw from (its own band
    plus "any age")."""
    Rows = Db.query(BirthdayWish.age_band, func.count(BirthdayWish.id)).filter(BirthdayWish.is_active.is_(True)).group_by(BirthdayWish.age_band).all()
    ByBand = dict(Rows)
    Any = ByBand.get("ALL", 0)
    return {Band: Any + ByBand.get(Band, 0) for Band in ("YOUNG", "MIDDLE", "OLDER")}


def WishPayload(Wish: BirthdayWish, Uses: dict, Last: dict) -> dict:
    return {
        "id": Wish.id,
        "text": Wish.text,
        "style": Wish.style,
        "ageBand": Wish.age_band,
        "needsLevel": bool(Wish.needs_level),
        "isActive": bool(Wish.is_active),
        "isStarter": bool(Wish.seed_key),
        "uses": int(Uses.get(Wish.id, 0)),
        "lastUsed": Last[Wish.id].isoformat() if Last.get(Wish.id) else None,
        "updatedAt": Wish.updated_at.isoformat() if Wish.updated_at else None,
    }


def ListWishes(Db: Session) -> dict:
    Uses, Last = _UsageMaps(Db)
    Order = {Style: Index for Index, Style in enumerate(STYLES)}
    Wishes = sorted(Db.query(BirthdayWish).all(), key=lambda Wish: (Order.get(Wish.style, 99), Wish.seed_key or "~", Wish.created_at or datetime.min.replace(tzinfo=timezone.utc)))
    return {"wishes": [WishPayload(Wish, Uses, Last) for Wish in Wishes], "activeByAge": ActiveWishCounts(Db), "minimumPerAge": MIN_PER_BAND}


class WishError(ValueError):
    pass


def CleanWishText(Text: str | None) -> str:
    Value = " ".join(str(Text or "").split())
    if not Value:
        raise WishError("Write the wish.")
    if len(Value) > MAX_WISH_LENGTH:
        raise WishError(f"Keep the wish to {MAX_WISH_LENGTH} characters or fewer (it has {len(Value)}).")
    Unknown = [Token for Token in re.findall(r"\{[^{}]*\}", Value) if Token not in PLACEHOLDERS]
    if Unknown:
        raise WishError(f"{', '.join(sorted(set(Unknown)))} isn't something the wish can fill in. Use {{name}}, {{age}} or {{level}}.")
    if "{" in re.sub(r"\{(name|age|level)\}", "", Value) or "}" in re.sub(r"\{(name|age|level)\}", "", Value):
        raise WishError("A curly bracket is left open. Use {name}, {age} or {level} exactly.")
    return Value


def _Check(Style: str | None, Band: str | None) -> tuple[str, str]:
    StyleValue = str(Style or "").upper()
    BandValue = str(Band or "").upper()
    if StyleValue not in STYLES:
        raise WishError("Choose a style.")
    if BandValue not in AGE_BANDS:
        raise WishError("Choose who the wish is for.")
    return StyleValue, BandValue


def CreateWish(Db: Session, *, Text: str, Style: str, AgeBand: str, UserId: str | None) -> BirthdayWish:
    Clean = CleanWishText(Text)
    StyleValue, BandValue = _Check(Style, AgeBand)
    if Db.query(BirthdayWish).filter(func.lower(BirthdayWish.text) == Clean.lower()).first():
        raise WishError("That wish is already in the set.")
    Wish = BirthdayWish(text=Clean, style=StyleValue, age_band=BandValue, needs_level="{level}" in Clean, is_active=True, updated_by_user_id=UserId)
    Db.add(Wish)
    Db.commit()
    return Wish


def UpdateWish(Db: Session, WishId: str, *, Text: str | None = None, Style: str | None = None, AgeBand: str | None = None, IsActive: bool | None = None, UserId: str | None = None) -> BirthdayWish:
    """Change a wish. Greetings already given keep the words the student
    read. Switching a wish off never leaves an age group with fewer than
    10 wishes to choose from."""
    Wish = Db.query(BirthdayWish).filter(BirthdayWish.id == WishId).first()
    if Wish is None:
        raise LookupError("Wish not found.")
    if Text is not None:
        Clean = CleanWishText(Text)
        Clash = Db.query(BirthdayWish).filter(func.lower(BirthdayWish.text) == Clean.lower(), BirthdayWish.id != Wish.id).first()
        if Clash:
            raise WishError("That wish is already in the set.")
        Wish.text = Clean
        Wish.needs_level = "{level}" in Clean
    if Style is not None or AgeBand is not None:
        Wish.style, Wish.age_band = _Check(Style or Wish.style, AgeBand or Wish.age_band)
    if IsActive is not None:
        Wish.is_active = bool(IsActive)
    Db.flush()
    Short = [Band for Band, Count in ActiveWishCounts(Db).items() if Count < MIN_PER_BAND]
    if Short and (IsActive is False or AgeBand is not None):
        Db.rollback()
        Names = {"YOUNG": "ages 3 to 8", "MIDDLE": "ages 9 to 12", "OLDER": "ages 13 and over"}
        raise WishError(f"This would leave fewer than {MIN_PER_BAND} wishes for {', '.join(Names[Band] for Band in Short)}. Add or switch on another wish for them first.")
    Wish.updated_by_user_id = UserId
    Db.commit()
    return Wish


def PreviewWish(Text: str) -> list[dict]:
    """The wish as three sample students would read it."""
    Clean = CleanWishText(Text)
    return [
        {"name": "Aarav", "age": 7, "level": "MM-L1", "text": RenderWish(Clean, Name="Aarav", Age=7, Level="MM-L1")},
        {"name": "Diya", "age": 11, "level": "IM-L2", "text": RenderWish(Clean, Name="Diya", Age=11, Level="IM-L2")},
        {"name": "Kabir", "age": 14, "level": "PM-L3", "text": RenderWish(Clean, Name="Kabir", Age=14, Level="PM-L3")},
    ]


def TeacherLevelOptions(Db: Session, TeacherId: str) -> list[dict]:
    """The levels a teacher's active students are on (for their filter)."""
    from app.models import Module

    from app.services.demo_students import RealStudentsClause

    Ids = {
        Row[0]
        for Row in Db.query(Student.current_level_id)
        .filter(Student.teacher_id == TeacherId, Student.is_active.is_(True), Student.current_level_id.isnot(None), RealStudentsClause(Db))
        .all()
    }
    if not Ids:
        return []
    return [
        {"id": Row.id, "code": Row.level_code}
        for Row in Db.query(Level).join(Module, Module.id == Level.module_id).filter(Level.id.in_(Ids)).order_by(Module.display_order, Level.display_order, Level.level_code).all()
    ]
