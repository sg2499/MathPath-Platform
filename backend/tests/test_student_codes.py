"""Student Code / Custom ID series (2026-11-23, Shailesh): a new student
takes the next number (MP-ST-0168 / MP-2026-0168); inactive students keep
theirs; a deleted student's number is free again; demo accounts never count;
the year is this year in India and the number never restarts."""
from datetime import datetime, timezone
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

from app.models import Student, User
from app.services import student_codes
from tests.test_phase2_demo_students import db, world  # noqa: F401  (fixtures)


@pytest.fixture()
def series(world, monkeypatch):
    """Real students 0001..0003 (0003 inactive), a legacy short custom id,
    and a demo account with a 3-digit code."""
    monkeypatch.setattr(student_codes, "StudentCodeYear", lambda Now=None: 2026)
    import app.api.routes_admin as routes_admin

    monkeypatch.setattr(routes_admin, "StudentCodeYear", lambda Now=None: 2026)
    world.get(Student, "real").student_code = "MP-ST-0001"
    world.get(Student, "real").custom_id = "MP-2026-0001"
    world.get(Student, "demo").student_code = "MP-ST-009"
    world.get(Student, "demo").custom_id = "MP-IM-ST"
    for number, active, custom in ((2, True, "MP-2026-002"), (3, False, "MP-2026-0003")):
        world.add(User(id=f"u{number}", full_name=f"S{number}", password_hash="x", role="STUDENT", is_active=active))
        world.flush()
        world.add(Student(id=f"s{number}", user_id=f"u{number}", student_code=f"MP-ST-{number:04d}", custom_id=custom,
                          is_active=active, current_level_id="l", current_module_id="m"))
    world.commit()
    return world


def _payload(code, custom, **extra):
    from app.api.routes_admin import StudentCreateRequest

    values = dict(
        customId=custom, teacher="Teacher One", teacherCode="MP-T-1", studentName="New Student", dob="2018-01-01",
        gender="Female", schoolName="School", fatherName="F", fatherMobile="9", fatherWhatsapp="9", motherName="M",
        motherMobile="8", motherWhatsapp="8", studentCode=code, password="secret1", moduleCode="IM", levelCode="IM-L1",
    )
    values.update(extra)
    return StudentCreateRequest(**values)


def _create(db, code, custom):
    from app.api.routes_admin import create_student_route

    return create_student_route(_payload(code, custom), db=db, user=db.get(User, "admin"))


def _error(call):
    with pytest.raises(HTTPException) as caught:
        call()
    return caught.value.status_code, caught.value.detail["code"], caught.value.detail


def test_year_is_india_time():
    # 31 Dec 2026 20:00 UTC is already 1 Jan 2027 in India.
    assert student_codes.StudentCodeYear(datetime(2026, 12, 31, 20, 0, tzinfo=timezone.utc)) == 2027
    assert student_codes.StudentCodeYear(datetime(2026, 12, 31, 18, 0, tzinfo=timezone.utc)) == 2026


def test_next_codes_follow_the_highest_real_number_including_inactive(series):
    from app.api.routes_admin import next_student_codes_route

    reply = next_student_codes_route(db=series, user=series.get(User, "admin"))
    assert reply == {"number": 4, "year": 2026, "studentCode": "MP-ST-0004", "customId": "MP-2026-0004"}


def test_inactive_keeps_its_number_and_deleting_the_newest_frees_it(series):
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0004"
    series.delete(series.get(Student, "s3"))
    series.commit()
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0003"


def test_a_gap_in_the_middle_stays_a_gap(series):
    series.delete(series.get(Student, "s2"))
    series.commit()
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0004"


def test_demo_accounts_never_count(series):
    series.get(Student, "demo").student_code = "MP-ST-0500"
    series.commit()
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0004"


def test_number_continues_into_a_new_year(series, monkeypatch):
    monkeypatch.setattr(student_codes, "StudentCodeYear", lambda Now=None: 2027)
    assert student_codes.NextStudentCodes(series) == {
        "number": 4, "year": 2027, "studentCode": "MP-ST-0004", "customId": "MP-2027-0004",
    }


def test_create_with_the_next_codes(series):
    reply = _create(series, "MP-ST-0004", "MP-2026-0004")
    assert reply["student"]["studentCode"] == "MP-ST-0004" and reply["student"]["customId"] == "MP-2026-0004"
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0005"


@pytest.mark.parametrize(
    "code, custom, status, error",
    [
        ("MP-ST-0003", "MP-2026-0003", 409, "STUDENT_CODE_TAKEN"),  # inactive student's number
        ("MP-ST-0005", "MP-2026-0005", 400, "STUDENT_CODE_NOT_NEXT"),  # skips 0004
        ("MP-ST-0004", "MP-2026-0005", 400, "STUDENT_CODE_MISMATCH"),
        ("MP-ST-0004", "MP-2025-0004", 400, "INVALID_CUSTOM_ID"),  # not this year
        ("MP-ST-004", "MP-2026-0004", 400, "INVALID_STUDENT_CODE"),
        ("MP-ST-00004", "MP-2026-0004", 400, "INVALID_STUDENT_CODE"),
        ("MP-RIYA-4821", "MP-2026-0004", 400, "INVALID_STUDENT_CODE"),
        ("mp-st-0004", "MP-2026-0004", 400, "INVALID_STUDENT_CODE"),
        ("MP-ST-0004", "11030100225187", 400, "INVALID_CUSTOM_ID"),
        ("MP-ST-0004", "MP-2026-004", 400, "INVALID_CUSTOM_ID"),
    ],
)
def test_create_rejects_codes_off_the_series(series, code, custom, status, error):
    got_status, got_code, detail = _error(lambda: _create(series, code, custom))
    assert (got_status, got_code) == (status, error)
    assert series.query(Student).count() == 4


def test_taken_error_carries_the_next_codes(series):
    _, _, detail = _error(lambda: _create(series, "MP-ST-0003", "MP-2026-0003"))
    assert detail["details"]["next"]["studentCode"] == "MP-ST-0004"
    assert "MP-ST-0004" in detail["message"] and "MP-2026-0004" in detail["message"]


def test_two_admins_with_the_same_codes(series):
    _create(series, "MP-ST-0004", "MP-2026-0004")
    status, code, detail = _error(lambda: _create(series, "MP-ST-0004", "MP-2026-0004"))
    assert (status, code) == (409, "STUDENT_CODE_TAKEN")
    assert detail["details"]["next"]["customId"] == "MP-2026-0005"


def _update(db, student_id, **fields):
    from app.api.routes_admin import StudentUpdateRequest, update_student_route

    return update_student_route(student_id, StudentUpdateRequest(**fields), db=db, user=db.get(User, "admin"))


def test_editing_other_details_leaves_legacy_codes_alone(series):
    reply = _update(series, "s2", studentName="Renamed", studentCode="MP-ST-0002", customId="MP-2026-002")
    assert reply["student"]["customId"] == "MP-2026-002"
    _update(series, "demo", studentName="Demo renamed", studentCode="MP-ST-009", customId="MP-IM-ST")


def test_changing_codes_must_follow_the_format_and_stay_unique(series):
    assert _error(lambda: _update(series, "s2", studentCode="MP-ST-0002", customId="MP-2026-0003"))[1] == "STUDENT_CODE_MISMATCH"
    assert _error(lambda: _update(series, "s2", studentCode="MP-ST-0003", customId="MP-2026-0003"))[1] == "STUDENT_CODE_TAKEN"
    assert _error(lambda: _update(series, "s2", studentCode="MP-2", customId="MP-2026-002"))[1] == "INVALID_STUDENT_CODE"
    assert _error(lambda: _update(series, "s2", studentCode="MP-ST-0002", customId="MP-2099-0002"))[1] == "INVALID_CUSTOM_ID"
    reply = _update(series, "s2", studentCode="MP-ST-0002", customId="MP-2026-0002")
    assert reply["student"]["customId"] == "MP-2026-0002"


def _upload(db, rows):
    from app.api.routes_admin import TEMPLATE_FIELDS, bulk_upload_students

    book = Workbook()
    sheet = book.active
    sheet.append(TEMPLATE_FIELDS)
    for row in rows:
        values = dict(
            student_name="Bulk", dob="2018-01-01", gender="Male", school_name="S", father_name="F", father_mobile="9",
            father_whatsapp="9", mother_name="M", mother_mobile="8", mother_whatsapp="8", password="secret1",
            module_code="IM", level_code="IM-L1", status="ACTIVE", teacher_code="MP-T-1",
        )
        values.update(row)
        sheet.append([values.get(field, "") for field in TEMPLATE_FIELDS])
    buffer = BytesIO()
    book.save(buffer)
    buffer.seek(0)
    return bulk_upload_students(UploadFile(file=buffer, filename="s.xlsx"), db=db, user=db.get(User, "admin"))


def test_bulk_upload_takes_the_next_numbers_in_order(series):
    reply = _upload(series, [
        {"student_code": "MP-ST-0004", "custom_id": "MP-2026-0004"},
        {"student_code": "MP-ST-0005", "custom_id": "MP-2026-0005"},
        {"student_code": "MP-ST-0007", "custom_id": "MP-2026-0007"},
        {"student_code": "MP-DEMO-1001", "custom_id": "11030100225187"},
    ])
    assert reply["created"] == 2 and reply["failed"] == 2
    failed = [Row for Row in reply["results"] if Row["status"] == "FAILED"]
    assert all("MP-ST-0006" in Row["error"] and "MP-2026-0006" in Row["error"] for Row in failed)
    assert student_codes.NextStudentCodes(series)["studentCode"] == "MP-ST-0006"


def test_template_sample_row_uses_the_next_codes(series):
    from openpyxl import load_workbook

    from app.api.routes_admin import TEMPLATE_FIELDS, download_students_template

    response = download_students_template(db=series, user=series.get(User, "admin"))
    import asyncio

    async def read():
        return b"".join([chunk async for chunk in response.body_iterator])

    sample = list(load_workbook(BytesIO(asyncio.run(read()))).active.iter_rows(values_only=True))[1]
    row = dict(zip(TEMPLATE_FIELDS, sample))
    assert (row["student_code"], row["custom_id"]) == ("MP-ST-0004", "MP-2026-0004")


def test_same_moment_save_is_turned_away_by_the_database(series, monkeypatch):
    """Both admins passed the checks at the same instant: the second save
    hits the database's unique code and gets the next codes back."""
    import app.api.routes_admin as routes_admin

    _create(series, "MP-ST-0004", "MP-2026-0004")
    monkeypatch.setattr(routes_admin, "CheckNewStudentCodes", lambda *a, **k: None)
    monkeypatch.setattr(routes_admin, "ensure_unique_student", lambda *a, **k: None)
    status, code, detail = _error(lambda: _create(series, "MP-ST-0004", "MP-2026-0004"))
    assert (status, code) == (409, "STUDENT_CODE_TAKEN")
    assert detail["details"]["next"]["studentCode"] == "MP-ST-0005"
    assert series.query(Student).filter(Student.student_code == "MP-ST-0004").count() == 1
