import uuid
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


def uuid_str() -> str:
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=uuid_str)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    phone = Column(String(20), unique=True, nullable=True)
    photo_url = Column(Text, nullable=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(30), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Student(Base):
    __tablename__ = "students"
    id = Column(String, primary_key=True, default=uuid_str)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # MathPath login and assignment mapping
    student_code = Column(String(50), unique=True, nullable=False)
    current_module_id = Column(String, ForeignKey("modules.id"), nullable=True)
    current_level_id = Column(String, ForeignKey("levels.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Student profile information
    custom_id = Column(String(80), unique=True, nullable=True)
    teacher = Column(String(150), nullable=True)
    teacher_id = Column(String, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    admission_date = Column(String(30), nullable=True)
    dob = Column(String(30), nullable=True)
    gender = Column(String(30), nullable=True)
    blood_group = Column(String(30), nullable=True)
    interest = Column(String(255), nullable=True)
    photo_url = Column(Text, nullable=True)
    signature_url = Column(Text, nullable=True)

    # Address and school information
    present_address = Column(Text, nullable=True)
    permanent_address = Column(Text, nullable=True)
    school_name = Column(String(255), nullable=True)
    school_area = Column(String(255), nullable=True)
    class_name = Column(String(50), nullable=True)
    section = Column(String(50), nullable=True)

    # Parent information
    father_name = Column(String(150), nullable=True)
    father_occupation = Column(String(150), nullable=True)
    father_mobile = Column(String(30), nullable=True)
    father_email = Column(String(150), nullable=True)
    father_whatsapp = Column(String(30), nullable=True)
    mother_name = Column(String(150), nullable=True)
    mother_occupation = Column(String(150), nullable=True)
    mother_mobile = Column(String(30), nullable=True)
    mother_email = Column(String(150), nullable=True)
    mother_whatsapp = Column(String(30), nullable=True)

    # Kept for backward compatibility with earlier Phase 2A builds
    parent_contact = Column(String(20), nullable=True)

    user = relationship("User")
    assigned_teacher = relationship("Teacher", foreign_keys=[teacher_id])

class Teacher(Base):
    __tablename__ = "teachers"
    id = Column(String, primary_key=True, default=uuid_str)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    teacher_code = Column(String(50), unique=True, nullable=False)
    designation = Column(String(120), nullable=True)
    subject_specialization = Column(String(150), nullable=True)
    qualification = Column(String(150), nullable=True)
    joining_date = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    photo_url = Column(Text, nullable=True)
    signature_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    user = relationship("User")


class Batch(Base):
    __tablename__ = "batches"
    id = Column(String, primary_key=True, default=uuid_str)
    batch_name = Column(String(150), nullable=False)
    batch_code = Column(String(50), unique=True)
    teacher_id = Column(String, ForeignKey("teachers.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

class StudentBatch(Base):
    __tablename__ = "student_batches"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    batch_id = Column(String, ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    __table_args__ = (UniqueConstraint("student_id", "batch_id", name="uq_student_batch"),)

class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True, default=uuid_str)
    module_code = Column(String(20), unique=True, nullable=False)
    module_name = Column(String(150), nullable=False)
    description = Column(Text)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

class Level(Base):
    __tablename__ = "levels"
    id = Column(String, primary_key=True, default=uuid_str)
    module_id = Column(String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    level_code = Column(String(50), nullable=False)
    level_name = Column(String(150), nullable=False)
    internal_level_number = Column(Integer)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    module = relationship("Module")
    __table_args__ = (UniqueConstraint("module_id", "level_code", name="uq_module_level"),)

class Lesson(Base):
    __tablename__ = "lessons"
    id = Column(String, primary_key=True, default=uuid_str)
    level_id = Column(String, ForeignKey("levels.id", ondelete="CASCADE"), nullable=False)
    lesson_number = Column(Integer, nullable=False)
    lesson_title = Column(String(255), nullable=False)
    description = Column(Text)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    level = relationship("Level")
    __table_args__ = (UniqueConstraint("level_id", "lesson_number", name="uq_level_lesson"),)

class DPS(Base):
    __tablename__ = "dps"
    id = Column(String, primary_key=True, default=uuid_str)
    lesson_id = Column(String, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    dps_number = Column(Integer, nullable=False)
    dps_title = Column(String(255), nullable=False)
    default_question_count = Column(Integer, default=10, nullable=False)
    default_duration_seconds = Column(Integer, default=300, nullable=False)
    marks_per_question = Column(Float, default=1, nullable=False)
    label_style = Column(String(30), default="NUMERIC", nullable=False)
    answer_type = Column(String(30), default="MCQ", nullable=False)
    options_per_question = Column(Integer, default=4, nullable=False)
    layout_template = Column(String(100), default="VERTICAL_3_ROW_ADDLESS", nullable=False)
    publication_status = Column(String(30), default="DRAFT", nullable=False)
    last_preview_seed = Column(Text, nullable=True)
    published_seed = Column(Text, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    lesson = relationship("Lesson")
    __table_args__ = (UniqueConstraint("lesson_id", "dps_number", name="uq_lesson_dps"),)

class DPSSection(Base):
    __tablename__ = "dps_sections"
    id = Column(String, primary_key=True, default=uuid_str)
    dps_id = Column(String, ForeignKey("dps.id", ondelete="CASCADE"), nullable=False)
    section_number = Column(Integer, default=1, nullable=False)
    section_title = Column(String(255))
    question_count = Column(Integer, default=10, nullable=False)
    concept_family = Column(String(100), nullable=False)
    operation_focus = Column(String(100))
    abacus_rule = Column(String(100))
    target_numbers_json = Column(Text)
    place_value = Column(String(50))
    digit_pattern = Column(String(100))
    rows_count = Column(Integer, default=3)
    difficulty = Column(String(50))
    allow_negative_operands = Column(Boolean, default=True, nullable=False)
    allow_negative_answer = Column(Boolean, default=False, nullable=False)
    generator_config_json = Column(Text)
    dps = relationship("DPS")
    __table_args__ = (UniqueConstraint("dps_id", "section_number", name="uq_dps_section"),)



class CompetitionMockExam(Base):
    __tablename__ = "competition_mock_exams"
    id = Column(String, primary_key=True, default=uuid_str)
    title = Column(String(255), nullable=False)
    mock_code = Column(String(80), nullable=True)
    module_id = Column(String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    level_id = Column(String, ForeignKey("levels.id", ondelete="CASCADE"), nullable=False)
    competition_scope = Column(String(50), default="GENERAL", nullable=False)
    difficulty_band = Column(String(50), default="COMPETITION", nullable=False)
    total_questions = Column(Integer, nullable=False)
    total_marks = Column(Float, default=100, nullable=False)
    marks_per_question = Column(Float, default=1, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    status = Column(String(30), default="DRAFT", nullable=False)
    instructions = Column(Text, nullable=True)
    syllabus_coverage_json = Column(Text, nullable=True)
    generation_config_json = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    published_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    module = relationship("Module")
    level = relationship("Level")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    published_by = relationship("User", foreign_keys=[published_by_user_id])

    __table_args__ = (UniqueConstraint("level_id", "mock_code", name="uq_competition_mock_level_code"),)


class CompetitionMockQuestion(Base):
    __tablename__ = "competition_mock_questions"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_exam_id = Column(String, ForeignKey("competition_mock_exams.id", ondelete="CASCADE"), nullable=False)
    section_number = Column(Integer, default=1, nullable=False)
    section_title = Column(String(255), nullable=True)
    question_number = Column(Integer, nullable=False)
    display_type = Column(String(50), default="VERTICAL", nullable=False)
    question_text = Column(Text, nullable=True)
    operands_json = Column(Text, nullable=True)
    operators_json = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    difficulty = Column(String(50), nullable=True)
    concept_family = Column(String(100), nullable=True)
    concept_tag = Column(String(100), nullable=True)
    source_type = Column(String(50), default="COMPETITION_MOCK_ENGINE", nullable=False)
    source_reference_id = Column(String, nullable=True)
    seed = Column(Text, nullable=True)
    marks = Column(Float, default=1, nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    mock_exam = relationship("CompetitionMockExam")

    __table_args__ = (UniqueConstraint("mock_exam_id", "question_number", name="uq_competition_mock_question_number"),)


class CompetitionMockQuestionOption(Base):
    __tablename__ = "competition_mock_question_options"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_question_id = Column(String, ForeignKey("competition_mock_questions.id", ondelete="CASCADE"), nullable=False)
    option_label = Column(String(1), nullable=False)
    option_value = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    display_order = Column(Integer, nullable=False)

    mock_question = relationship("CompetitionMockQuestion")

    __table_args__ = (UniqueConstraint("mock_question_id", "option_label", name="uq_competition_mock_option_label"),)


class CompetitionMockAssignment(Base):
    __tablename__ = "competition_mock_assignments"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_exam_id = Column(String, ForeignKey("competition_mock_exams.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(String, ForeignKey("teachers.id"), nullable=True)
    assigned_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="ASSIGNED", nullable=False)
    current_attempt_number = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=1, nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    due_at = Column(DateTime(timezone=True), nullable=True)
    instructions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    mock_exam = relationship("CompetitionMockExam")
    student = relationship("Student")
    teacher = relationship("Teacher")
    assigned_by = relationship("User")

    __table_args__ = (UniqueConstraint("mock_exam_id", "student_id", name="uq_competition_mock_assignment_student"),)


class CompetitionMockAttempt(Base):
    __tablename__ = "competition_mock_attempts"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_assignment_id = Column(String, ForeignKey("competition_mock_assignments.id", ondelete="CASCADE"), nullable=False)
    mock_exam_id = Column(String, ForeignKey("competition_mock_exams.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    status = Column(String(30), default="IN_PROGRESS", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=False)
    total_questions = Column(Integer, default=0, nullable=False)
    attempted_count = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    unanswered_count = Column(Integer, default=0, nullable=False)
    total_score = Column(Float, default=0, nullable=False)
    max_score = Column(Float, default=0, nullable=False)
    percentage = Column(Float, default=0, nullable=False)
    performance_band = Column(String(50), nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    time_utilization_percentage = Column(Float, nullable=True)

    mock_assignment = relationship("CompetitionMockAssignment")
    mock_exam = relationship("CompetitionMockExam")
    student = relationship("Student")

    __table_args__ = (UniqueConstraint("mock_assignment_id", "attempt_number", name="uq_competition_mock_attempt_number"),)


class CompetitionMockAttemptAnswer(Base):
    __tablename__ = "competition_mock_attempt_answers"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_attempt_id = Column(String, ForeignKey("competition_mock_attempts.id", ondelete="CASCADE"), nullable=False)
    mock_question_id = Column(String, ForeignKey("competition_mock_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option_id = Column(String, ForeignKey("competition_mock_question_options.id"), nullable=True)
    selected_value = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Float, default=0, nullable=False)
    answered_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    mock_attempt = relationship("CompetitionMockAttempt")
    mock_question = relationship("CompetitionMockQuestion")
    selected_option = relationship("CompetitionMockQuestionOption")

    __table_args__ = (UniqueConstraint("mock_attempt_id", "mock_question_id", name="uq_competition_mock_attempt_question_answer"),)


class CompetitionMockResultSummary(Base):
    __tablename__ = "competition_mock_result_summaries"
    id = Column(String, primary_key=True, default=uuid_str)
    mock_attempt_id = Column(String, ForeignKey("competition_mock_attempts.id", ondelete="CASCADE"), unique=True, nullable=False)
    mock_assignment_id = Column(String, ForeignKey("competition_mock_assignments.id"), nullable=False)
    mock_exam_id = Column(String, ForeignKey("competition_mock_exams.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, default=0, nullable=False)
    max_score = Column(Float, default=100, nullable=False)
    percentage = Column(Float, default=0, nullable=False)
    accuracy_percentage = Column(Float, default=0, nullable=False)
    time_taken_seconds = Column(Integer, nullable=True)
    time_utilization_percentage = Column(Float, nullable=True)
    performance_band = Column(String(50), nullable=False)
    concept_strengths_json = Column(Text, nullable=True)
    concept_weaknesses_json = Column(Text, nullable=True)
    concept_performance_json = Column(Text, nullable=True)
    recommendation_json = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    mock_attempt = relationship("CompetitionMockAttempt")
    mock_assignment = relationship("CompetitionMockAssignment")
    mock_exam = relationship("CompetitionMockExam")
    student = relationship("Student")


class AssessmentBlueprint(Base):
    __tablename__ = "assessment_blueprints"
    id = Column(String, primary_key=True, default=uuid_str)
    title = Column(String(255), nullable=False)
    module_id = Column(String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    level_id = Column(String, ForeignKey("levels.id", ondelete="CASCADE"), nullable=False)
    total_questions = Column(Integer, nullable=False)
    total_marks = Column(Float, default=100, nullable=False)
    marks_per_question = Column(Float, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    passing_percentage = Column(Float, default=70, nullable=False)
    instructions = Column(Text, nullable=True)
    status = Column(String(30), default="DRAFT", nullable=False)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    module = relationship("Module")
    level = relationship("Level")
    created_by = relationship("User")


class AssessmentBlueprintLesson(Base):
    __tablename__ = "assessment_blueprint_lessons"
    id = Column(String, primary_key=True, default=uuid_str)
    blueprint_id = Column(String, ForeignKey("assessment_blueprints.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(String, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    question_count = Column(Integer, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    concept_rule_json = Column(Text, nullable=True)

    blueprint = relationship("AssessmentBlueprint")
    lesson = relationship("Lesson")

    __table_args__ = (UniqueConstraint("blueprint_id", "lesson_id", name="uq_assessment_blueprint_lesson"),)




class AssessmentVersion(Base):
    __tablename__ = "assessment_versions"
    id = Column(String, primary_key=True, default=uuid_str)
    blueprint_id = Column(String, ForeignKey("assessment_blueprints.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    status = Column(String(30), default="DRAFT", nullable=False)
    generation_mode = Column(String(50), default="BLUEPRINT_LOCKED", nullable=False)
    seed = Column(Text, nullable=True)
    total_questions = Column(Integer, nullable=False)
    total_marks = Column(Float, default=100, nullable=False)
    marks_per_question = Column(Float, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    generated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    published_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    blueprint = relationship("AssessmentBlueprint")
    generated_by = relationship("User", foreign_keys=[generated_by_user_id])
    published_by = relationship("User", foreign_keys=[published_by_user_id])

    __table_args__ = (UniqueConstraint("blueprint_id", "version_number", name="uq_assessment_version_number"),)


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_version_id = Column(String, ForeignKey("assessment_versions.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(String, ForeignKey("lessons.id"), nullable=False)
    question_number = Column(Integer, nullable=False)
    lesson_question_number = Column(Integer, nullable=False)
    display_type = Column(String(50), default="VERTICAL", nullable=False)
    question_text = Column(Text, nullable=True)
    operands_json = Column(Text, nullable=True)
    operators_json = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    difficulty = Column(String(50), nullable=True)
    concept_tag = Column(String(100), nullable=True)
    source_type = Column(String(50), default="ASSESSMENT_ENGINE", nullable=False)
    source_reference_id = Column(String, nullable=True)
    seed = Column(Text, nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    assessment_version = relationship("AssessmentVersion")
    lesson = relationship("Lesson")

    __table_args__ = (UniqueConstraint("assessment_version_id", "question_number", name="uq_assessment_version_question_number"),)


class AssessmentQuestionOption(Base):
    __tablename__ = "assessment_question_options"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_question_id = Column(String, ForeignKey("assessment_questions.id", ondelete="CASCADE"), nullable=False)
    option_label = Column(String(1), nullable=False)
    option_value = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    display_order = Column(Integer, nullable=False)

    assessment_question = relationship("AssessmentQuestion")

    __table_args__ = (UniqueConstraint("assessment_question_id", "option_label", name="uq_assessment_question_option_label"),)


class AssessmentAssignment(Base):
    __tablename__ = "assessment_assignments"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_version_id = Column(String, ForeignKey("assessment_versions.id"), nullable=False)
    blueprint_id = Column(String, ForeignKey("assessment_blueprints.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(String, ForeignKey("teachers.id"), nullable=True)
    assigned_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="ASSIGNED", nullable=False)
    assessment_assignment_type = Column(String(30), default="ORIGINAL", nullable=False)
    source_assignment_id = Column(String, ForeignKey("assessment_assignments.id"), nullable=True)
    reattempt_approval_id = Column(String, nullable=True)
    current_attempt_number = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=1, nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    due_at = Column(DateTime(timezone=True), nullable=True)
    instructions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    assessment_version = relationship("AssessmentVersion")
    blueprint = relationship("AssessmentBlueprint")
    student = relationship("Student")
    teacher = relationship("Teacher")
    assigned_by = relationship("User")
    source_assignment = relationship("AssessmentAssignment", remote_side=[id], foreign_keys=[source_assignment_id])

    __table_args__ = (UniqueConstraint("assessment_version_id", "student_id", name="uq_assessment_assignment_student_version"),)


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_assignment_id = Column(String, ForeignKey("assessment_assignments.id", ondelete="CASCADE"), nullable=False)
    assessment_version_id = Column(String, ForeignKey("assessment_versions.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    attempt_type = Column(String(30), default="ORIGINAL", nullable=False)
    status = Column(String(30), default="IN_PROGRESS", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=False)
    total_questions = Column(Integer, default=0, nullable=False)
    attempted_count = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    unanswered_count = Column(Integer, default=0, nullable=False)
    total_score = Column(Float, default=0, nullable=False)
    max_score = Column(Float, default=0, nullable=False)
    percentage = Column(Float, default=0, nullable=False)
    performance_band = Column(String(50), nullable=True)
    result_status = Column(String(50), nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)

    assessment_assignment = relationship("AssessmentAssignment")
    assessment_version = relationship("AssessmentVersion")
    student = relationship("Student")

    __table_args__ = (UniqueConstraint("assessment_assignment_id", "attempt_number", name="uq_assessment_attempt_number"),)


class AssessmentAttemptAnswer(Base):
    __tablename__ = "assessment_attempt_answers"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_attempt_id = Column(String, ForeignKey("assessment_attempts.id", ondelete="CASCADE"), nullable=False)
    assessment_question_id = Column(String, ForeignKey("assessment_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option_id = Column(String, ForeignKey("assessment_question_options.id"), nullable=True)
    selected_value = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Float, default=0, nullable=False)
    answered_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assessment_attempt = relationship("AssessmentAttempt")
    assessment_question = relationship("AssessmentQuestion")
    selected_option = relationship("AssessmentQuestionOption")

    __table_args__ = (UniqueConstraint("assessment_attempt_id", "assessment_question_id", name="uq_assessment_attempt_question_answer"),)


class AssessmentResult(Base):
    __tablename__ = "assessment_results"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_attempt_id = Column(String, ForeignKey("assessment_attempts.id", ondelete="CASCADE"), unique=True, nullable=False)
    assessment_assignment_id = Column(String, ForeignKey("assessment_assignments.id"), nullable=False)
    assessment_version_id = Column(String, ForeignKey("assessment_versions.id"), nullable=False)
    blueprint_id = Column(String, ForeignKey("assessment_blueprints.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, default=0, nullable=False)
    max_score = Column(Float, default=100, nullable=False)
    percentage = Column(Float, default=0, nullable=False)
    performance_band = Column(String(50), nullable=False)
    result_status = Column(String(50), nullable=False)
    cleared = Column(Boolean, default=False, nullable=False)
    level_cleared = Column(Boolean, default=False, nullable=False)
    completion_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    assessment_attempt = relationship("AssessmentAttempt")
    assessment_assignment = relationship("AssessmentAssignment")
    assessment_version = relationship("AssessmentVersion")
    blueprint = relationship("AssessmentBlueprint")
    student = relationship("Student")



class AssessmentAttemptRemark(Base):
    __tablename__ = "assessment_attempt_remarks"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_attempt_id = Column(String, ForeignKey("assessment_attempts.id", ondelete="CASCADE"), nullable=False)
    remark_text = Column(Text, nullable=False)
    feedback_category = Column(String(80), nullable=False)
    feedback_variant = Column(String(80), nullable=False)
    feedback_tone = Column(String(80), nullable=False)
    score_band = Column(String(80), nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_role = Column(String(30), nullable=False)
    updated_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deleted_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assessment_attempt = relationship("AssessmentAttempt")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
    deleted_by = relationship("User", foreign_keys=[deleted_by_user_id])




class StudentLevelPromotion(Base):
    __tablename__ = "student_level_promotions"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    student_code = Column(String(50), nullable=True)
    from_module_id = Column(String, ForeignKey("modules.id"), nullable=True)
    from_module_code = Column(String(20), nullable=True)
    from_level_id = Column(String, ForeignKey("levels.id"), nullable=False)
    from_level_code = Column(String(50), nullable=True)
    to_module_id = Column(String, ForeignKey("modules.id"), nullable=True)
    to_module_code = Column(String(20), nullable=True)
    to_level_id = Column(String, ForeignKey("levels.id"), nullable=False)
    to_level_code = Column(String(50), nullable=True)
    assessment_assignment_id = Column(String, ForeignKey("assessment_assignments.id", ondelete="CASCADE"), nullable=False)
    assessment_attempt_id = Column(String, ForeignKey("assessment_attempts.id", ondelete="SET NULL"), nullable=True)
    assessment_result_id = Column(String, ForeignKey("assessment_results.id", ondelete="SET NULL"), nullable=True)
    score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)
    percentage = Column(Float, nullable=True)
    status = Column(String(30), default="PROMOTED", nullable=False)
    promoted_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    promoted_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student")
    from_level = relationship("Level", foreign_keys=[from_level_id])
    to_level = relationship("Level", foreign_keys=[to_level_id])
    assessment_assignment = relationship("AssessmentAssignment")
    assessment_attempt = relationship("AssessmentAttempt")
    assessment_result = relationship("AssessmentResult")
    promoted_by = relationship("User")

    __table_args__ = (
        UniqueConstraint("student_id", "assessment_assignment_id", "from_level_id", name="uq_student_level_promotion_assignment"),
    )


class AssessmentReattemptApproval(Base):
    __tablename__ = "assessment_reattempt_approvals"
    id = Column(String, primary_key=True, default=uuid_str)
    assessment_assignment_id = Column(String, ForeignKey("assessment_assignments.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    assessment_attempt_id = Column(String, ForeignKey("assessment_attempts.id"), nullable=True)
    requested_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    approved_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="PENDING", nullable=False)
    reason = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    next_attempt_number = Column(Integer, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)

    assessment_assignment = relationship("AssessmentAssignment", foreign_keys=[assessment_assignment_id])
    student = relationship("Student")
    assessment_attempt = relationship("AssessmentAttempt")
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(String, primary_key=True, default=uuid_str)
    assignment_type = Column(String(30), nullable=False)
    dps_id = Column(String, ForeignKey("dps.id", ondelete="CASCADE"), nullable=False)
    assigned_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    assigned_to_type = Column(String(30), nullable=False)
    assigned_to_id = Column(String, nullable=False)
    title = Column(String(255), nullable=False)
    instructions = Column(Text)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    allow_reattempt = Column(Boolean, default=False, nullable=False)
    show_result_immediately = Column(Boolean, default=True, nullable=False)
    show_correct_answers_after_submit = Column(Boolean, default=True, nullable=False)
    attempt_group_id = Column(String, nullable=True, index=True)
    source_assignment_id = Column(String, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True)
    retry_attempt_number = Column(Integer, default=0, nullable=False)
    assignment_source = Column(String(30), default="ORIGINAL", nullable=False)
    auto_retry_limit = Column(Integer, default=2, nullable=False)
    requires_manual_intervention = Column(Boolean, default=False, nullable=False)
    manual_intervention_reason = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    dps = relationship("DPS")
    source_assignment = relationship("Assignment", remote_side=[id], foreign_keys=[source_assignment_id])


class AssignmentReattemptPermission(Base):
    __tablename__ = "assignment_reattempt_permissions"
    id = Column(String, primary_key=True, default=uuid_str)
    assignment_id = Column(String, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    dps_id = Column(String, ForeignKey("dps.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    allowed_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(30), default="APPROVED", nullable=False)
    used_assignment_id = Column(String, ForeignKey("assignments.id"), nullable=True)
    allowed_at = Column(DateTime(timezone=True), server_default=func.now())
    used_at = Column(DateTime(timezone=True), nullable=True)


class GeneratedQuestionSet(Base):
    __tablename__ = "generated_question_sets"
    id = Column(String, primary_key=True, default=uuid_str)
    assignment_id = Column(String, ForeignKey("assignments.id"), nullable=True)
    dps_id = Column(String, ForeignKey("dps.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String(30), nullable=False)
    seed = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

class GeneratedQuestion(Base):
    __tablename__ = "generated_questions"
    id = Column(String, primary_key=True, default=uuid_str)
    question_set_id = Column(String, ForeignKey("generated_question_sets.id", ondelete="CASCADE"), nullable=False)
    dps_section_id = Column(String, ForeignKey("dps_sections.id"), nullable=True)
    question_number = Column(Integer, nullable=False)
    display_type = Column(String(50), default="VERTICAL", nullable=False)
    question_text = Column(Text)
    operands_json = Column(Text)
    operators_json = Column(Text)
    correct_answer = Column(Text, nullable=False)
    seed = Column(Text, nullable=False)
    metadata_json = Column(Text)
    __table_args__ = (UniqueConstraint("question_set_id", "question_number", name="uq_set_question_number"),)

class QuestionOption(Base):
    __tablename__ = "question_options"
    id = Column(String, primary_key=True, default=uuid_str)
    question_id = Column(String, ForeignKey("generated_questions.id", ondelete="CASCADE"), nullable=False)
    option_label = Column(String(1), nullable=False)
    option_value = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    display_order = Column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("question_id", "option_label", name="uq_question_option_label"),)

class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(String, primary_key=True, default=uuid_str)
    assignment_id = Column(String, ForeignKey("assignments.id"), nullable=True)
    dps_id = Column(String, ForeignKey("dps.id", ondelete="CASCADE"), nullable=False)
    question_set_id = Column(String, ForeignKey("generated_question_sets.id"), unique=True, nullable=True)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String(30), nullable=False)
    status = Column(String(30), default="IN_PROGRESS", nullable=False)
    attempt_group_id = Column(String, nullable=True, index=True)
    attempt_number = Column(Integer, default=0, nullable=False)
    attempt_source = Column(String(30), default="ORIGINAL", nullable=False)
    requires_manual_intervention = Column(Boolean, default=False, nullable=False)
    cleared_at_attempt = Column(Boolean, default=False, nullable=False)
    benchmark_status = Column(String(30), default="PENDING", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=False)
    total_questions = Column(Integer, default=0, nullable=False)
    attempted_count = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    unanswered_count = Column(Integer, default=0, nullable=False)
    total_score = Column(Float, default=0, nullable=False)
    max_score = Column(Float, default=0, nullable=False)
    accuracy_percentage = Column(Float, default=0, nullable=False)
    time_taken_seconds = Column(Integer, nullable=True)

class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"
    id = Column(String, primary_key=True, default=uuid_str)
    attempt_id = Column(String, ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String, ForeignKey("generated_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option_id = Column(String, ForeignKey("question_options.id"), nullable=True)
    selected_value = Column(Text)
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Float, default=0, nullable=False)
    answered_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question_answer"),)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=uuid_str)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=True)
    attempt_id = Column(String, ForeignKey("attempts.id"), nullable=True)
    event_type = Column(String(100), nullable=False)
    event_data_json = Column(Text)
    ip_address = Column(String(100))
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AssessmentReadinessTestingOverride(Base):
    __tablename__ = "assessment_readiness_testing_overrides"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    student_code = Column(String(50), nullable=True)
    module_id = Column(String, ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    module_code = Column(String(50), nullable=True)
    module_name = Column(String(150), nullable=True)
    level_id = Column(String, ForeignKey("levels.id", ondelete="SET NULL"), nullable=False)
    level_code = Column(String(50), nullable=True)
    level_name = Column(String(150), nullable=True)
    status = Column(String(30), default="ACTIVE", nullable=False)
    reason = Column(Text, nullable=True)
    enabled_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    enabled_at = Column(DateTime(timezone=True), server_default=func.now())
    disabled_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    disabled_at = Column(DateTime(timezone=True), nullable=True)
    used_for_assessment_assignment_id = Column(String, ForeignKey("assessment_assignments.id", ondelete="SET NULL"), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    student = relationship("Student")
    module = relationship("Module")
    level = relationship("Level")
    enabled_by = relationship("User", foreign_keys=[enabled_by_user_id])
    disabled_by = relationship("User", foreign_keys=[disabled_by_user_id])


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=uuid_str)

    recipient_user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_role = Column(String(30), nullable=False)
    actor_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String(30), nullable=True)

    student_id = Column(String, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    teacher_id = Column(String, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    module_id = Column(String, ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    level_id = Column(String, ForeignKey("levels.id", ondelete="SET NULL"), nullable=True)
    lesson_id = Column(String, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    dps_id = Column(String, ForeignKey("dps.id", ondelete="SET NULL"), nullable=True)

    assessment_id = Column(String, nullable=True)
    attempt_id = Column(String, nullable=True)
    report_delivery_id = Column(String, nullable=True)

    type = Column(String(80), nullable=False)
    category = Column(String(40), nullable=False)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=True)

    target_route = Column(String(255), nullable=True)
    target_tab = Column(String(80), nullable=True)
    target_sub_tab = Column(String(80), nullable=True)
    color_variant = Column(String(40), default="INFO", nullable=False)

    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    metadata_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    recipient = relationship("User", foreign_keys=[recipient_user_id])
    actor = relationship("User", foreign_keys=[actor_user_id])
    student = relationship("Student")
    teacher = relationship("Teacher")
    module = relationship("Module")
    level = relationship("Level")
    lesson = relationship("Lesson")
    dps = relationship("DPS")


class ParentReportEmailLog(Base):
    __tablename__ = "parent_report_email_logs"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    student_code = Column(String(50), nullable=True)
    module_code = Column(String(50), nullable=True)
    level_code = Column(String(50), nullable=True)
    recipient_email = Column(String(150), nullable=False)
    recipient_type = Column(String(30), nullable=False)
    file_name = Column(String(255), nullable=True)
    status = Column(String(30), default="PENDING", nullable=False)
    delivery_status = Column(String(30), default="QUEUED", nullable=False)
    delivery_provider = Column(String(50), nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    provider_response = Column(Text, nullable=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    sent_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    bounced_at = Column(DateTime(timezone=True), nullable=True)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student")
    sent_by = relationship("User")


class ParentReportDeliveryEvent(Base):
    __tablename__ = "parent_report_delivery_events"
    id = Column(String, primary_key=True, default=uuid_str)
    delivery_log_id = Column(String, ForeignKey("parent_report_email_logs.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False)
    provider = Column(String(50), nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    provider_response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    delivery_log = relationship("ParentReportEmailLog")

