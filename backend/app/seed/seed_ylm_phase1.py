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
    if db.query(User).filter(User.email == "admin@mathpath.local").first():
        return
    admin = User(full_name="MathPath Admin", email="admin@mathpath.local", password_hash=hash_password("Admin@123"), role="SUPER_ADMIN")
    teacher_user = User(full_name="Demo Teacher", email="teacher@mathpath.local", password_hash=hash_password("Teacher@123"), role="TEACHER")
    student_user = User(full_name="Demo Student", email="student@mathpath.local", password_hash=hash_password("Student@123"), role="STUDENT")
    db.add_all([admin, teacher_user, student_user]); db.flush()
    teacher = Teacher(user_id=teacher_user.id, teacher_code="T001"); db.add(teacher); db.flush()
    ylm = Module(module_code="YLM", module_name="Young Learners Module", display_order=1); db.add(ylm); db.flush()
    level = Level(module_id=ylm.id, level_code="YLM-L1", level_name="Young Learners Level 1", internal_level_number=1, display_order=1); db.add(level); db.flush()
    student = Student(user_id=student_user.id, student_code="YLM001", class_name="UKG", current_module_id=ylm.id, current_level_id=level.id); db.add(student); db.flush()
    batch = Batch(batch_name="YLM Level 1 Batch", batch_code="YLM-L1-B1", teacher_id=teacher.id); db.add(batch); db.flush()
    db.add(StudentBatch(student_id=student.id, batch_id=batch.id))

    first_dps_id = None
    for lesson_num in range(1, 9):
        lesson = Lesson(level_id=level.id, lesson_number=lesson_num, lesson_title=LESSON_TITLES[lesson_num], display_order=lesson_num)
        db.add(lesson); db.flush()
        for dps_number, row in enumerate(LESSON_DATA[lesson_num], start=1):
            title, concept, operation, rule, targets, place, digit = row
            dps = DPS(lesson_id=lesson.id, dps_number=dps_number, dps_title=title, default_question_count=10, default_duration_seconds=300, marks_per_question=1)
            db.add(dps); db.flush()
            if first_dps_id is None:
                first_dps_id = dps.id
            section = DPSSection(
                dps_id=dps.id,
                section_number=1,
                section_title=title,
                question_count=10,
                concept_family=concept,
                operation_focus=operation,
                abacus_rule=rule,
                target_numbers_json=json.dumps(targets),
                place_value=place,
                digit_pattern=digit,
                rows_count=3,
                allow_negative_operands=True,
                allow_negative_answer=False,
            )
            db.add(section)
    db.flush()
    db.add(Assignment(assignment_type="PRACTICE", dps_id=first_dps_id, assigned_by_user_id=admin.id, assigned_to_type="BATCH", assigned_to_id=batch.id, title="YLM Lesson 1 - DPS 1 Practice", instructions="Complete this practice within 5 minutes."))
    db.commit()
