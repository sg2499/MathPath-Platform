import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CompetitionMockExam, Level, Module, Student, User
from app.services.competition_mock_assignment_service import AssignCompetitionMockExams


def _testing_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _user(user_id: str, name: str, role: str = "STUDENT") -> User:
    return User(
        id=user_id,
        full_name=name,
        email=f"{user_id}@example.test",
        password_hash="test",
        role=role,
        is_active=True,
    )


def _seed_assignment_scope(db):
    module = Module(id="module-mm", module_code="MM", module_name="Master Module", is_active=True)
    other_module = Module(id="module-ab", module_code="AB", module_name="Abacus Basics", is_active=True)
    level = Level(id="level-mm-1", module_id=module.id, level_code="MM-L1", level_name="MM Level 1", is_active=True)
    other_level = Level(id="level-mm-2", module_id=module.id, level_code="MM-L2", level_name="MM Level 2", is_active=True)
    admin = _user("user-admin", "Admin", "ADMIN")
    valid_user = _user("user-valid", "Valid Student")
    wrong_module_user = _user("user-wrong-module", "Wrong Module Student")
    wrong_level_user = _user("user-wrong-level", "Wrong Level Student")
    valid_student = Student(
        id="student-valid",
        user_id=valid_user.id,
        student_code="MP-ST-001",
        current_module_id=module.id,
        current_level_id=level.id,
        is_active=True,
    )
    wrong_module_student = Student(
        id="student-wrong-module",
        user_id=wrong_module_user.id,
        student_code="MP-ST-002",
        current_module_id=other_module.id,
        current_level_id=level.id,
        is_active=True,
    )
    wrong_level_student = Student(
        id="student-wrong-level",
        user_id=wrong_level_user.id,
        student_code="MP-ST-003",
        current_module_id=module.id,
        current_level_id=other_level.id,
        is_active=True,
    )
    exam = CompetitionMockExam(
        id="mock-mm-l1",
        title="MM L1 Mock",
        mock_code="MM-L1-TEST",
        module_id=module.id,
        level_id=level.id,
        total_questions=20,
        duration_seconds=3600,
        is_active=True,
    )
    db.add_all([
        module,
        other_module,
        level,
        other_level,
        admin,
        valid_user,
        wrong_module_user,
        wrong_level_user,
        valid_student,
        wrong_module_student,
        wrong_level_student,
        exam,
    ])
    db.commit()
    return admin


def test_assign_all_competition_mocks_uses_module_and_level_eligible_students_only():
    TestingSession = _testing_session()
    with TestingSession() as db:
        admin = _seed_assignment_scope(db)

        result = AssignCompetitionMockExams(
            db,
            LevelId="level-mm-1",
            MockExamIds=["mock-mm-l1"],
            AssignedBy=admin,
            AssignToAllInLevel=True,
        )

    assert result["studentCount"] == 1
    assert result["createdAssignmentCount"] == 1
    assert result["assignments"][0]["studentId"] == "student-valid"


def test_selected_competition_mock_students_must_match_module_and_level():
    TestingSession = _testing_session()
    with TestingSession() as db:
        admin = _seed_assignment_scope(db)

        with pytest.raises(HTTPException) as exc:
            AssignCompetitionMockExams(
                db,
                LevelId="level-mm-1",
                MockExamIds=["mock-mm-l1"],
                AssignedBy=admin,
                StudentIds=["student-wrong-module"],
                AssignToAllInLevel=False,
            )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_STUDENT_SELECTION"
