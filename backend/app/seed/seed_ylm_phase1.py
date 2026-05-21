import json
from sqlalchemy.orm import Session
from app.core.security import hash_password
from app.models import User, Student, Teacher, Batch, StudentBatch, Module, Level, Lesson, DPS, DPSSection, Assignment

LESSON_DATA = {
    1: [
        ("Bead Recognition & Single Digit Addition-Subtraction", "BEAD_RECOGNITION", "ADD_LESS", None, [], "ONES", "1D"),
        ("Bead Recognition & Double Digit Addition-Subtraction", "BEAD_RECOGNITION", "ADD_LESS", None, [], "MIXED", "2D"),
        ("Bead Recognition & Double Digit Addition-Subtraction", "BEAD_RECOGNITION", "ADD_LESS", None, [], "MIXED", "2D"),
        ("Bead Recognition & Double Digit Addition-Subtraction", "BEAD_RECOGNITION", "ADD_LESS", None, [], "MIXED", "2D"),
        ("Bead Recognition & Double Digit Addition-Subtraction", "BEAD_RECOGNITION", "ADD_LESS", None, [], "MIXED", "2D"),
    ],
    2: [
        ("Number 5 & Direct Add-Less Using 5", "DIRECT_ADD_LESS", "ADD_LESS", None, [5], "ONES", "1D"),
        ("Numbers 6, 7, 8, 9 Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [6,7,8,9], "ONES", "1D"),
        ("50, 60, 70, 80, 90 Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [50,60,70,80,90], "TENS", "2D_TENS"),
        ("Single & Double Digit Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"),
        ("Number 50 Double Digit Direct Add-Less", "DIRECT_ADD_LESS", "ADD_LESS", None, [50], "TENS", "2D_TENS"),
    ],
    3: [("Addition of 1 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_4", [1], "ONES", "1D"), ("Addition of 1 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_4", [1], "ONES", "1D"), ("Addition of 1 & 10", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_4", [1,10], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 1 & 10 using Small Boss Concept", "SMALL_BOSS", "ADDITION", "ADD_5_LESS_4", [1,10], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 1 & 10 using Small Boss Concept", "SMALL_BOSS", "ADDITION", "ADD_5_LESS_4", [1,10], "ONES_AND_TENS", "1D_AND_2D")],
    4: [("Addition of 2 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2], "ONES", "1D"), ("Addition of 2 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2], "ONES", "1D"), ("Addition of 2 & 20 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2,20], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 2 & 20 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2,20], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 2 & 20 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_3", [2,20], "ONES_AND_TENS", "1D_AND_2D")],
    5: [("Addition of 3 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3], "ONES", "1D"), ("Addition of 3 & 30 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3,30], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 3 & 30 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3,30], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 3 & 30 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3,30], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 3 & 30 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_2", [3,30], "ONES_AND_TENS", "1D_AND_2D")],
    6: [("Addition of 4 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4], "ONES", "1D"), ("Addition of 4 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4], "ONES", "1D"), ("Addition of 4 & 40 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4,40], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 4 & 40 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4,40], "ONES_AND_TENS", "1D_AND_2D"), ("Addition of 4 & 40 using complement of 5", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_1", [4,40], "ONES_AND_TENS", "1D_AND_2D")],
    7: [("Revision: Direct Add-Less and Complement of 5", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"), ("Revision: Direct Add-Less", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"), ("Revision: Direct and Small Boss Add-Less", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"), ("Revision: Direct and Small Boss Add-Less", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"), ("Revision: Direct and Small Boss Add-Less", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D")],
    8: [("Subtraction of 1 using complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1], "ONES", "1D"), ("Subtraction of 1 using complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1], "ONES", "1D"), ("Subtraction of 1 & 10 using complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1,10], "ONES_AND_TENS", "1D_AND_2D"), ("Subtraction of 1 & 10 using complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1,10], "ONES_AND_TENS", "1D_AND_2D"), ("Subtraction of 1 & 10 using complement of 5", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1,10], "ONES_AND_TENS", "1D_AND_2D")],
}

LESSON_TITLES = {
    1: "Bead Recognition and Basic Add-Less",
    2: "Direct Add-Less and Number Recognition",
    3: "Addition of 1 using Complement of 5",
    4: "Addition of 2 using Complement of 5",
    5: "Addition of 3 using Complement of 5",
    6: "Addition of 4 using Complement of 5",
    7: "Revision of Direct Add-Less and Complement of 5",
    8: "Subtraction of 1 using Complement of 5",
}

def seed(db: Session):
    """Idempotent demo seed for local and production demo databases.

    Production PostgreSQL can start empty, or it can contain only a partial
    dataset if an earlier deployment was interrupted. This seed therefore does
    not return early when the admin exists; it verifies and repairs the full
    minimum demo login/curriculum structure required for live verification.
    """

    def upsert_user(email: str, full_name: str, password: str, role: str, phone: str | None = None) -> User:
        ExistingUser = db.query(User).filter(User.email == email).first()
        if ExistingUser:
            ExistingUser.full_name = full_name
            ExistingUser.password_hash = hash_password(password)
            ExistingUser.role = role
            ExistingUser.is_active = True
            if phone and not ExistingUser.phone:
                ExistingUser.phone = phone
            return ExistingUser

        NewUser = User(
            full_name=full_name,
            email=email,
            phone=phone,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
        )
        db.add(NewUser)
        db.flush()
        return NewUser

    admin = upsert_user("admin@mathpath.local", "MathPath Admin", "Admin@123", "SUPER_ADMIN")
    teacher_user = upsert_user("teacher@mathpath.local", "Demo Teacher", "Teacher@123", "TEACHER")
    student_user = upsert_user("student@mathpath.local", "Demo Student", "Student@123", "STUDENT")
    db.flush()

    teacher = db.query(Teacher).filter(Teacher.teacher_code == "T001").first()
    if not teacher:
        teacher = db.query(Teacher).filter(Teacher.user_id == teacher_user.id).first()
    if not teacher:
        teacher = Teacher(user_id=teacher_user.id, teacher_code="T001")
        db.add(teacher)
        db.flush()
    teacher.user_id = teacher_user.id
    teacher.teacher_code = "T001"
    teacher.designation = teacher.designation or "MathPath Teacher"
    teacher.subject_specialization = teacher.subject_specialization or "Abacus Foundation"
    teacher.is_active = True

    ylm = db.query(Module).filter(Module.module_code == "YLM").first()
    if not ylm:
        ylm = Module(module_code="YLM", module_name="Young Learners Module", display_order=1)
        db.add(ylm)
        db.flush()
    ylm.module_name = "Young Learners Module"
    ylm.display_order = 1
    ylm.is_active = True

    level = db.query(Level).filter(Level.module_id == ylm.id, Level.level_code == "YLM-L1").first()
    if not level:
        level = Level(
            module_id=ylm.id,
            level_code="YLM-L1",
            level_name="Young Learners Level 1",
            internal_level_number=1,
            display_order=1,
        )
        db.add(level)
        db.flush()
    level.level_name = "Young Learners Level 1"
    level.internal_level_number = 1
    level.display_order = 1
    level.is_active = True

    student = db.query(Student).filter(Student.student_code == "YLM001").first()
    if not student:
        student = db.query(Student).filter(Student.user_id == student_user.id).first()
    if not student:
        student = Student(user_id=student_user.id, student_code="YLM001")
        db.add(student)
        db.flush()
    student.user_id = student_user.id
    student.student_code = "YLM001"
    student.class_name = student.class_name or "UKG"
    student.teacher = student.teacher or "Demo Teacher"
    student.current_module_id = ylm.id
    student.current_level_id = level.id
    student.is_active = True

    batch = db.query(Batch).filter(Batch.batch_code == "YLM-L1-B1").first()
    if not batch:
        batch = Batch(batch_name="YLM Level 1 Batch", batch_code="YLM-L1-B1", teacher_id=teacher.id)
        db.add(batch)
        db.flush()
    batch.batch_name = "YLM Level 1 Batch"
    batch.teacher_id = teacher.id
    batch.is_active = True

    StudentBatchLink = db.query(StudentBatch).filter(StudentBatch.student_id == student.id, StudentBatch.batch_id == batch.id).first()
    if not StudentBatchLink:
        db.add(StudentBatch(student_id=student.id, batch_id=batch.id, is_active=True))
    else:
        StudentBatchLink.is_active = True

    first_dps_id = None
    for lesson_num in range(1, 9):
        lesson = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_num).first()
        if not lesson:
            lesson = Lesson(
                level_id=level.id,
                lesson_number=lesson_num,
                lesson_title=LESSON_TITLES[lesson_num],
                display_order=lesson_num,
            )
            db.add(lesson)
            db.flush()
        lesson.lesson_title = LESSON_TITLES[lesson_num]
        lesson.display_order = lesson_num
        lesson.is_active = True

        for dps_number, row in enumerate(LESSON_DATA[lesson_num], start=1):
            title, concept, operation, rule, targets, place, digit = row
            dps = db.query(DPS).filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number).first()
            if not dps:
                dps = DPS(
                    lesson_id=lesson.id,
                    dps_number=dps_number,
                    dps_title=title,
                    default_question_count=10,
                    default_duration_seconds=300,
                    marks_per_question=1,
                )
                db.add(dps)
                db.flush()
            dps.dps_title = title
            dps.default_question_count = 10
            dps.default_duration_seconds = 300
            dps.marks_per_question = 1
            dps.is_active = True
            if first_dps_id is None:
                first_dps_id = dps.id

            section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == 1).first()
            if not section:
                section = DPSSection(dps_id=dps.id, section_number=1)
                db.add(section)
            section.section_title = title
            section.question_count = 10
            section.concept_family = concept
            section.operation_focus = operation
            section.abacus_rule = rule
            section.target_numbers_json = json.dumps(targets)
            section.place_value = place
            section.digit_pattern = digit
            section.rows_count = 3
            section.allow_negative_operands = True
            section.allow_negative_answer = False

    db.flush()

    ExistingAssignment = db.query(Assignment).filter(
        Assignment.assignment_type == "PRACTICE",
        Assignment.dps_id == first_dps_id,
        Assignment.assigned_to_type == "BATCH",
        Assignment.assigned_to_id == batch.id,
    ).first()
    if first_dps_id and not ExistingAssignment:
        db.add(
            Assignment(
                assignment_type="PRACTICE",
                dps_id=first_dps_id,
                assigned_by_user_id=admin.id,
                assigned_to_type="BATCH",
                assigned_to_id=batch.id,
                title="YLM Lesson 1 - DPS 1 Practice",
                instructions="Complete this practice within 5 minutes.",
            )
        )

    db.commit()
