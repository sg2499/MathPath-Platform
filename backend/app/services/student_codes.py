"""Student Code and Custom ID numbering (2026-11-23, Shailesh).

Every new student gets the next number in one series, written two ways:

    Student Code  MP-ST-0168
    Custom ID     MP-2026-0168

- The number is one more than the highest number any existing student has,
  active or inactive. Demo accounts (MP-ST-001..009) are never counted.
- Inactive students keep their number, so it is never handed out again.
  A deleted student's number is free again: deleting the newest student
  means the next one gets that number. Gaps in the middle stay gaps.
- The year in the Custom ID is the year the student is added, in India
  time. The number never restarts: 2027 carries on from 2026
  (MP-ST-0200 / MP-2027-0200).
- No two students ever share a number.

Students added before this rule keep their codes as they are. The rule is
checked whenever a student is added, and whenever an admin changes a
student's codes.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import Student

INDIA = ZoneInfo("Asia/Kolkata")
STUDENT_CODE_PATTERN = re.compile(r"^MP-ST-(\d{4,})$")
CUSTOM_ID_PATTERN = re.compile(r"^MP-(\d{4})-(\d{4,})$")


def StudentCodeYear(Now: datetime | None = None) -> int:
    """The year that goes into a new Custom ID: today's year in India."""
    Moment = Now or datetime.now(timezone.utc)
    if Moment.tzinfo is None:
        Moment = Moment.replace(tzinfo=timezone.utc)
    return Moment.astimezone(INDIA).year


def StudentCodeFor(Number: int) -> str:
    return f"MP-ST-{Number:04d}"


def CustomIdFor(Number: int, Year: int) -> str:
    return f"MP-{Year}-{Number:04d}"


def StudentCodeNumber(Code: str | None) -> int | None:
    Found = STUDENT_CODE_PATTERN.match(Code or "")
    return int(Found.group(1)) if Found else None


def CustomIdNumber(Value: str | None) -> int | None:
    """The series number in a Custom ID. Also reads older short ones like
    MP-2026-151, so their number still counts as taken."""
    Found = re.match(r"^MP-\d{4}-(\d+)$", Value or "")
    return int(Found.group(1)) if Found else None


def _RealStudentNumbers(Db: Session, ExcludeStudentId: str | None = None) -> set[int]:
    """Every number held by a real (not demo) student, from either code."""
    Query = Db.query(Student.id, Student.student_code, Student.custom_id).filter(Student.is_demo == False)  # noqa: E712
    Numbers: set[int] = set()
    for StudentId, Code, CustomId in Query.all():
        if ExcludeStudentId and StudentId == ExcludeStudentId:
            continue
        for Number in (StudentCodeNumber(Code), CustomIdNumber(CustomId)):
            if Number is not None:
                Numbers.add(Number)
    return Numbers


def NextStudentNumber(Db: Session) -> int:
    """One more than the highest number any real student holds. Skips on
    past a number whose code is somehow already used (by any account)."""
    Numbers = _RealStudentNumbers(Db)
    Number = (max(Numbers) if Numbers else 0) + 1
    UsedCodes = {Code for (Code,) in Db.query(Student.student_code).all()}
    UsedCustomIds = {Value for (Value,) in Db.query(Student.custom_id).all() if Value}
    Year = StudentCodeYear()
    while StudentCodeFor(Number) in UsedCodes or CustomIdFor(Number, Year) in UsedCustomIds:
        Number += 1
    return Number


def NextStudentCodes(Db: Session) -> dict:
    Number = NextStudentNumber(Db)
    Year = StudentCodeYear()
    return {
        "number": Number,
        "year": Year,
        "studentCode": StudentCodeFor(Number),
        "customId": CustomIdFor(Number, Year),
    }


def _FormatProblems(StudentCode: str, CustomId: str) -> tuple[int, int, int]:
    """Checks both codes are written the agreed way and carry the same
    number. Returns (student number, custom id year, custom id number)."""
    CodeMatch = STUDENT_CODE_PATTERN.match(StudentCode)
    if not CodeMatch:
        api_error(400, "INVALID_STUDENT_CODE", f"Student Code must look like MP-ST-0168 (MP-ST- and a 4-digit number). Got {StudentCode}.")
    CustomMatch = CUSTOM_ID_PATTERN.match(CustomId)
    if not CustomMatch:
        api_error(400, "INVALID_CUSTOM_ID", f"Custom ID must look like MP-2026-0168 (MP-, the year, and a 4-digit number). Got {CustomId}.")
    Number = int(CodeMatch.group(1))
    CustomYear, CustomNumber = int(CustomMatch.group(1)), int(CustomMatch.group(2))
    if StudentCodeFor(Number) != StudentCode or CustomIdFor(CustomNumber, CustomYear) != CustomId:
        api_error(400, "INVALID_STUDENT_CODE", "Write the number with 4 digits, with no extra leading zeros, e.g. 0168.")
    if Number != CustomNumber:
        api_error(400, "STUDENT_CODE_MISMATCH", f"Student Code and Custom ID must carry the same number: {StudentCode} goes with MP-{CustomYear}-{Number:04d}.")
    return Number, CustomYear, CustomNumber


def CheckNewStudentCodes(Db: Session, StudentCode: str, CustomId: str) -> None:
    """A new student must take exactly the next codes."""
    Number, CustomYear, _ = _FormatProblems(StudentCode, CustomId)
    Next = NextStudentCodes(Db)
    if CustomYear != Next["year"]:
        api_error(400, "INVALID_CUSTOM_ID", f"The Custom ID year must be this year: {Next['customId']}.", {"next": Next})
    if Number != Next["number"]:
        if Number < Next["number"]:
            api_error(
                409,
                "STUDENT_CODE_TAKEN",
                f"{StudentCode} is already taken. The next available codes are {Next['studentCode']} and {Next['customId']}.",
                {"next": Next},
            )
        api_error(
            400,
            "STUDENT_CODE_NOT_NEXT",
            f"Numbers cannot be skipped. The next available codes are {Next['studentCode']} and {Next['customId']}.",
            {"next": Next},
        )


def CheckChangedStudentCodes(Db: Session, StudentItem: Student, StudentCode: str, CustomId: str | None) -> None:
    """An admin changed a student's codes: they must follow the format and
    the number must not belong to another student."""
    if StudentCode == StudentItem.student_code and (CustomId or "") == (StudentItem.custom_id or ""):
        return
    if getattr(StudentItem, "is_demo", False):
        # Demo accounts sit outside the series (MP-ST-001..009).
        return
    Number, CustomYear, _ = _FormatProblems(StudentCode, CustomId or "")
    if CustomYear < 2000 or CustomYear > StudentCodeYear():
        api_error(400, "INVALID_CUSTOM_ID", f"The year in {CustomId} is not a valid year.")
    if Number in _RealStudentNumbers(Db, ExcludeStudentId=StudentItem.id):
        api_error(409, "STUDENT_CODE_TAKEN", f"Number {Number:04d} already belongs to another student.")
