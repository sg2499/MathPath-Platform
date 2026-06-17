from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionMockAssignment,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    Teacher,
    User,
)
from app.services.competition_mock_generation_service import CompetitionMockExamPayload


def _IsoDateTime(Value: Any) -> datetime | None:
    if not Value:
        return None
    if isinstance(Value, datetime):
        return Value
    try:
        NormalizedValue = str(Value).replace("Z", "+00:00")
        return datetime.fromisoformat(NormalizedValue)
    except Exception:
        api_error(400, "INVALID_DUE_DATE", "Due date must be a valid ISO date-time value.")


def _StudentPayload(StudentRecord: Student) -> dict[str, Any]:
    UserRecord = StudentRecord.user
    return {
        "studentId": StudentRecord.id,
        "studentCode": StudentRecord.student_code,
        "studentName": UserRecord.full_name if UserRecord else None,
        "currentModuleId": StudentRecord.current_module_id,
        "currentLevelId": StudentRecord.current_level_id,
        "teacherId": StudentRecord.teacher_id,
    }


def _AssignmentPayload(db: Session, AssignmentRecord: CompetitionMockAssignment, IncludeExam: bool = True) -> dict[str, Any]:
    StudentRecord = db.get(Student, AssignmentRecord.student_id)
    TeacherRecord = db.get(Teacher, AssignmentRecord.teacher_id) if AssignmentRecord.teacher_id else None
    AssignedByRecord = db.get(User, AssignmentRecord.assigned_by_user_id) if AssignmentRecord.assigned_by_user_id else None
    Payload = {
        "assignmentId": AssignmentRecord.id,
        "mockExamId": AssignmentRecord.mock_exam_id,
        "studentId": AssignmentRecord.student_id,
        "student": _StudentPayload(StudentRecord) if StudentRecord else None,
        "teacherId": AssignmentRecord.teacher_id,
        "teacherCode": TeacherRecord.teacher_code if TeacherRecord else None,
        "assignedByUserId": AssignmentRecord.assigned_by_user_id,
        "assignedByName": AssignedByRecord.full_name if AssignedByRecord else None,
        "status": AssignmentRecord.status,
        "currentAttemptNumber": AssignmentRecord.current_attempt_number,
        "maxAttempts": AssignmentRecord.max_attempts,
        "assignedAt": AssignmentRecord.assigned_at.isoformat() if AssignmentRecord.assigned_at else None,
        "dueAt": AssignmentRecord.due_at.isoformat() if AssignmentRecord.due_at else None,
        "instructions": AssignmentRecord.instructions,
        "isActive": AssignmentRecord.is_active,
    }
    if IncludeExam and AssignmentRecord.mock_exam:
        Payload["mockExam"] = CompetitionMockExamPayload(db, AssignmentRecord.mock_exam, IncludeQuestions=False)
    return Payload


def _ValidatedMockExams(db: Session, MockExamIds: list[str]) -> list[CompetitionMockExam]:
    UniqueIds = [MockExamId for MockExamId in dict.fromkeys([str(Item or "").strip() for Item in MockExamIds]) if MockExamId]
    if not UniqueIds:
        api_error(400, "NO_MOCK_EXAMS_SELECTED", "Select at least one competition mock exam.")

    Exams = (
        db.query(CompetitionMockExam)
        .filter(CompetitionMockExam.id.in_(UniqueIds), CompetitionMockExam.is_active == True, CompetitionMockExam.status != "ARCHIVED")
        .all()
    )
    ExamById = {Exam.id: Exam for Exam in Exams}
    MissingIds = [MockExamId for MockExamId in UniqueIds if MockExamId not in ExamById]
    if MissingIds:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "One or more selected competition mock exams were not found.", {"missingMockExamIds": MissingIds})
    return [ExamById[MockExamId] for MockExamId in UniqueIds]


def _StudentsForAssignment(
    db: Session,
    *,
    LevelId: str,
    StudentIds: list[str] | None,
    AssignToAllInLevel: bool,
) -> list[Student]:
    LevelRecord = db.get(Level, LevelId)
    if not LevelRecord or not LevelRecord.is_active:
        api_error(404, "LEVEL_NOT_FOUND", "The selected level was not found or is inactive.")

    Query = db.query(Student).filter(
        Student.is_active == True,
        Student.current_module_id == LevelRecord.module_id,
        Student.current_level_id == LevelId,
    )
    if AssignToAllInLevel:
        Students = Query.order_by(Student.student_code.asc()).all()
    else:
        UniqueStudentIds = [StudentId for StudentId in dict.fromkeys([str(Item or "").strip() for Item in (StudentIds or [])]) if StudentId]
        if not UniqueStudentIds:
            api_error(400, "NO_STUDENTS_SELECTED", "Select students or choose assign to all students in the level.")
        Students = Query.filter(Student.id.in_(UniqueStudentIds)).order_by(Student.student_code.asc()).all()
        FoundIds = {StudentRecord.id for StudentRecord in Students}
        MissingOrWrongLevelIds = [StudentId for StudentId in UniqueStudentIds if StudentId not in FoundIds]
        if MissingOrWrongLevelIds:
            api_error(
                400,
                "INVALID_STUDENT_SELECTION",
                "One or more selected students are inactive or not eligible for the selected module and level.",
                {"studentIds": MissingOrWrongLevelIds},
            )

    if not Students:
        api_error(400, "NO_LEVEL_STUDENTS_FOUND", "No active students were found for the selected module and level.")
    return Students


def AssignCompetitionMockExams(
    db: Session,
    *,
    LevelId: str,
    MockExamIds: list[str],
    AssignedBy: User,
    StudentIds: list[str] | None = None,
    AssignToAllInLevel: bool = False,
    MaxAttempts: int = 1,
    DueAt: Any = None,
    Instructions: str | None = None,
) -> dict[str, Any]:
    Exams = _ValidatedMockExams(db, MockExamIds)
    LevelRecord = db.get(Level, LevelId)
    if not LevelRecord or not LevelRecord.is_active:
        api_error(404, "LEVEL_NOT_FOUND", "The selected level was not found or is inactive.")

    InvalidExamIds = [
        Exam.id
        for Exam in Exams
        if Exam.level_id != LevelId or Exam.module_id != LevelRecord.module_id
    ]
    if InvalidExamIds:
        api_error(
            400,
            "MOCK_LEVEL_MISMATCH",
            "All selected mock exams must belong to the selected module and level.",
            {"mockExamIds": InvalidExamIds},
        )

    Students = _StudentsForAssignment(
        db,
        LevelId=LevelId,
        StudentIds=StudentIds,
        AssignToAllInLevel=AssignToAllInLevel,
    )
    SafeMaxAttempts = max(1, min(int(MaxAttempts or 1), 10))
    DueAtValue = _IsoDateTime(DueAt)
    CreatedAssignments: list[CompetitionMockAssignment] = []
    ExistingAssignments: list[CompetitionMockAssignment] = []

    ExistingRows = (
        db.query(CompetitionMockAssignment)
        .filter(
            CompetitionMockAssignment.mock_exam_id.in_([Exam.id for Exam in Exams]),
            CompetitionMockAssignment.student_id.in_([StudentRecord.id for StudentRecord in Students]),
        )
        .all()
    )
    ExistingByPair = {(Row.mock_exam_id, Row.student_id): Row for Row in ExistingRows}

    for Exam in Exams:
        for StudentRecord in Students:
            Existing = ExistingByPair.get((Exam.id, StudentRecord.id))
            if Existing:
                Existing.is_active = True
                Existing.max_attempts = SafeMaxAttempts
                Existing.due_at = DueAtValue
                Existing.instructions = Instructions
                if Existing.status in {"CANCELLED", "ARCHIVED"}:
                    Existing.status = "ASSIGNED"
                ExistingAssignments.append(Existing)
                continue

            AssignmentRecord = CompetitionMockAssignment(
                mock_exam_id=Exam.id,
                student_id=StudentRecord.id,
                teacher_id=StudentRecord.teacher_id,
                assigned_by_user_id=AssignedBy.id if AssignedBy else None,
                status="ASSIGNED",
                current_attempt_number=0,
                max_attempts=SafeMaxAttempts,
                due_at=DueAtValue,
                instructions=Instructions,
                is_active=True,
            )
            db.add(AssignmentRecord)
            CreatedAssignments.append(AssignmentRecord)

    db.commit()
    for AssignmentRecord in CreatedAssignments + ExistingAssignments:
        db.refresh(AssignmentRecord)

    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    return {
        "ok": True,
        "levelId": LevelId,
        "levelCode": LevelRecord.level_code if LevelRecord else None,
        "moduleId": ModuleRecord.id if ModuleRecord else None,
        "moduleCode": ModuleRecord.module_code if ModuleRecord else None,
        "mockExamCount": len(Exams),
        "studentCount": len(Students),
        "createdAssignmentCount": len(CreatedAssignments),
        "updatedExistingAssignmentCount": len(ExistingAssignments),
        "assignments": [_AssignmentPayload(db, AssignmentRecord, IncludeExam=True) for AssignmentRecord in CreatedAssignments + ExistingAssignments],
    }


def ListCompetitionMockAssignments(
    db: Session,
    *,
    LevelId: str | None = None,
    MockExamId: str | None = None,
    StudentId: str | None = None,
    Status: str | None = None,
    IncludeInactive: bool = False,
) -> list[dict[str, Any]]:
    Query = db.query(CompetitionMockAssignment).join(CompetitionMockExam, CompetitionMockAssignment.mock_exam_id == CompetitionMockExam.id)
    if not IncludeInactive:
        Query = Query.filter(CompetitionMockAssignment.is_active == True)
    if LevelId:
        Query = Query.filter(CompetitionMockExam.level_id == LevelId)
    if MockExamId:
        Query = Query.filter(CompetitionMockAssignment.mock_exam_id == MockExamId)
    if StudentId:
        Query = Query.filter(CompetitionMockAssignment.student_id == StudentId)
    if Status:
        Query = Query.filter(CompetitionMockAssignment.status == Status)

    Rows = Query.order_by(CompetitionMockAssignment.assigned_at.desc()).limit(500).all()
    return [_AssignmentPayload(db, Row, IncludeExam=True) for Row in Rows]


def ListStudentCompetitionMockAssignments(db: Session, StudentRecord: Student) -> list[dict[str, Any]]:
    Rows = (
        db.query(CompetitionMockAssignment)
        .join(CompetitionMockExam, CompetitionMockAssignment.mock_exam_id == CompetitionMockExam.id)
        .filter(
            CompetitionMockAssignment.student_id == StudentRecord.id,
            CompetitionMockAssignment.is_active == True,
            CompetitionMockExam.is_active == True,
        )
        .order_by(CompetitionMockAssignment.assigned_at.desc())
        .all()
    )
    return [_AssignmentPayload(db, Row, IncludeExam=True) for Row in Rows]
