"""Teacher-facing parent progress report access.

Split into its own file (rather than added to routes_teacher.py directly)
because it needs to reuse the PDF-regeneration logic that already lives in
routes_admin.py (_admin_regenerate_parent_report_from_log,
_admin_parent_report_file_name) -- routes_admin.py imports from
routes_teacher.py at module load time, so importing routes_admin.py *from*
routes_teacher.py would create a circular import. A separate module that
imports from routes_admin.py (one-directional, loaded after it in main.py)
avoids that entirely.

Admins generate a report and explicitly "publish" it to the student's
teacher (see publish_parent_report_to_teacher in routes_admin.py). Only
published reports are visible/downloadable here, and only for students
assigned to the requesting teacher.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.database import get_db
from app.dependencies import get_current_teacher
from app.models import ParentReportEmailLog, Student, Teacher, User
from app.api.routes_admin import (
    _admin_regenerate_parent_report_from_log,
    _admin_parent_report_file_name,
    _admin_parent_report_module_label,
    _admin_parent_report_level_label,
    BuildParentProgressPdfResponse,
)

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


def _teacher_owns_log(db: Session, teacher: Teacher, log: ParentReportEmailLog) -> bool:
    if not log.student_id:
        return False
    student = db.get(Student, log.student_id)
    return bool(student and student.teacher_id == teacher.id)


@router.get("/results/parent-report-deliveries")
def teacher_list_parent_report_deliveries(
    studentCode: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """List reports an admin has published to this teacher, optionally scoped to one student."""
    QueryValue = db.query(ParentReportEmailLog).filter(
        ParentReportEmailLog.published_to_teacher_at.isnot(None)
    )
    Logs = QueryValue.order_by(ParentReportEmailLog.published_to_teacher_at.desc()).all()
    Payload = []
    for LogValue in Logs:
        if not _teacher_owns_log(db, teacher, LogValue):
            continue
        StudentValue = db.get(Student, LogValue.student_id) if LogValue.student_id else None
        if studentCode and (not StudentValue or StudentValue.student_code != studentCode):
            continue
        StudentUser = db.get(User, StudentValue.user_id) if StudentValue and StudentValue.user_id else None
        StudentName = StudentUser.full_name if StudentUser and StudentUser.full_name else (LogValue.student_code or "Student")
        ModuleName, ModuleLabel = _admin_parent_report_module_label(db, LogValue.module_code)
        LevelName, LevelLabel = _admin_parent_report_level_label(db, LogValue.module_code, LogValue.level_code)
        Payload.append({
            "id": LogValue.id,
            "studentId": LogValue.student_id,
            "studentName": StudentName,
            "studentCode": LogValue.student_code or (StudentValue.student_code if StudentValue else "-"),
            "moduleCode": LogValue.module_code or "-",
            "moduleLabel": ModuleLabel,
            "levelCode": LogValue.level_code or "-",
            "levelLabel": LevelLabel,
            "fileName": LogValue.file_name,
            "publishedToTeacherAt": LogValue.published_to_teacher_at.isoformat() if LogValue.published_to_teacher_at else None,
        })
    return {"logs": Payload}


@router.get("/results/parent-report-deliveries/{delivery_id}/download")
def teacher_download_parent_report_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    ExistingLog = db.get(ParentReportEmailLog, delivery_id)
    if not ExistingLog:
        api_error(404, "DELIVERY_LOG_NOT_FOUND", "Parent report record not found.")
    if not _teacher_owns_log(db, teacher, ExistingLog):
        api_error(404, "DELIVERY_LOG_NOT_FOUND", "Parent report record not found.")
    if not ExistingLog.published_to_teacher_at:
        api_error(403, "REPORT_NOT_PUBLISHED", "This report has not been published to teachers yet.")

    _, _, ReportData, StudentName, ReportLevel = _admin_regenerate_parent_report_from_log(db, delivery_id)
    FileName = _admin_parent_report_file_name(StudentName, ReportLevel)
    return BuildParentProgressPdfResponse(FileName, ReportData)
