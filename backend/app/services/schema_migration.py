from sqlalchemy import inspect, text
from app.database import engine

USER_COLUMNS = {
    "photo_url": "TEXT",
    "failed_login_attempts": "INTEGER DEFAULT 0 NOT NULL",
    "locked_until": "TIMESTAMP",
    "password_changed_at": "TIMESTAMP",
    "last_active_at": "TIMESTAMP",
}


def ensure_user_columns() -> None:
    """SQLite-safe user table migration for account-level profile photos."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("users")}
    missing = [(name, ddl) for name, ddl in USER_COLUMNS.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))


STUDENT_COLUMNS = {
    "custom_id": "VARCHAR(80)",
    "teacher": "VARCHAR(150)",
    "admission_date": "VARCHAR(30)",
    "dob": "VARCHAR(30)",
    "gender": "VARCHAR(30)",
    "blood_group": "VARCHAR(30)",
    "interest": "VARCHAR(255)",
    "photo_url": "TEXT",
    "signature_url": "TEXT",
    "present_address": "TEXT",
    "permanent_address": "TEXT",
    "school_name": "VARCHAR(255)",
    "school_area": "VARCHAR(255)",
    "section": "VARCHAR(50)",
    "father_name": "VARCHAR(150)",
    "father_occupation": "VARCHAR(150)",
    "father_mobile": "VARCHAR(30)",
    "father_email": "VARCHAR(150)",
    "father_whatsapp": "VARCHAR(30)",
    "mother_name": "VARCHAR(150)",
    "mother_occupation": "VARCHAR(150)",
    "mother_mobile": "VARCHAR(30)",
    "mother_email": "VARCHAR(150)",
    "mother_whatsapp": "VARCHAR(30)",
}


def ensure_student_profile_columns() -> None:
    """Small SQLite-safe migration for local development.

    Base.metadata.create_all creates new tables but does not alter existing ones.
    This helper adds the Phase 2A.1 student-profile columns to an existing
    local SQLite DB without requiring Alembic yet.
    """
    inspector = inspect(engine)
    if "students" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("students")}
    missing = [(name, ddl) for name, ddl in STUDENT_COLUMNS.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE students ADD COLUMN {name} {ddl}"))


TEACHER_COLUMNS = {
    "teacher_code": "VARCHAR(50)",
    "designation": "VARCHAR(120)",
    "subject_specialization": "VARCHAR(150)",
    "qualification": "VARCHAR(150)",
    "joining_date": "VARCHAR(30)",
    "address": "TEXT",
    "notes": "TEXT",
    "photo_url": "TEXT",
    "signature_url": "TEXT",
}


def ensure_teacher_columns() -> None:
    """SQLite-safe teacher table migration for Phase 2B."""
    inspector = inspect(engine)
    if "teachers" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("teachers")}
    missing = [(name, ddl) for name, ddl in TEACHER_COLUMNS.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE teachers ADD COLUMN {name} {ddl}"))


def ensure_student_teacher_id_column() -> None:
    """Add teacher_id mapping to existing students table."""
    inspector = inspect(engine)
    if "students" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("students")}
    if "teacher_id" in existing:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE students ADD COLUMN teacher_id VARCHAR"))

def ensure_user_economy_columns() -> None:
    """Ensure quantum_fragments is added to user_economy if it exists."""
    inspector = inspect(engine)
    if "user_economy" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("user_economy")}
    if "quantum_fragments" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE user_economy ADD COLUMN quantum_fragments INTEGER NOT NULL DEFAULT 0"))


def ensure_competition_mock_attempt_gamification_column() -> None:
    """Self-heal safety net for gamification_processed_at (see matching Alembic migration).

    Renders/deploys don't always run `alembic upgrade head` reliably, so this
    project's convention is to also defensively add new columns at startup.
    This one specifically gates the mock-completion side-effects (student /
    teacher / admin notifications, XP + coin award, badge evaluation) so they
    run exactly once per attempt no matter which code path first completes it.
    """
    inspector = inspect(engine)
    if "competition_mock_attempts" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("competition_mock_attempts")}
    if "gamification_processed_at" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE competition_mock_attempts ADD COLUMN gamification_processed_at TIMESTAMP"))


def ensure_attempt_notification_processed_column() -> None:
    """Self-heal safety net for attempts.notification_processed_at (see matching
    Alembic migration bfa28b9fc380).

    Same convention as ensure_competition_mock_attempt_gamification_column()
    above. This one gates the practice/DPS attempt completion notification
    (and its retry-assignment notification, if any) so it runs exactly once
    per attempt no matter which code path first completes it -- including
    the lazy-auto-submit fallback triggered by a plain GET after the timer's
    already expired server-side, which previously never notified anyone.
    """
    inspector = inspect(engine)
    if "attempts" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("attempts")}
    if "notification_processed_at" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE attempts ADD COLUMN notification_processed_at TIMESTAMP"))


def ensure_assessment_attempt_notification_processed_column() -> None:
    """Self-heal safety net for assessment_attempts.notification_processed_at
    (see matching Alembic migration a1e6838c5ea3).

    Same convention as the two functions above. Also backs the new
    lazy-auto-submit safety net on assessment attempts, which previously had
    none at all -- an assessment whose auto-submit call never reached the
    server (tab closed at time-up, crash, dropped network) would stay
    IN_PROGRESS forever with no way to self-heal.
    """
    inspector = inspect(engine)
    if "assessment_attempts" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("assessment_attempts")}
    if "notification_processed_at" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN notification_processed_at TIMESTAMP"))


def ensure_attempt_gamification_processed_column() -> None:
    """Self-heal safety net for attempts.gamification_processed_at (see matching
    Alembic migration c2f7a9d3e451).

    Same convention as the other ensure_*_column() functions in this file.
    Gates the practice/DPS attempt's XP + coin award (EconomyService.
    evaluate_activity_performance) so it runs exactly once per attempt,
    independently of the notification claim above -- see the migration
    docstring for why these are two separate columns.
    """
    inspector = inspect(engine)
    if "attempts" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("attempts")}
    if "gamification_processed_at" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE attempts ADD COLUMN gamification_processed_at TIMESTAMP"))


def ensure_assessment_attempt_gamification_processed_column() -> None:
    """Self-heal safety net for assessment_attempts.gamification_processed_at
    (see matching Alembic migration d4a1b8e6f723).

    Same convention as the other ensure_*_column() functions in this file.
    Gates the assessment attempt's XP + coin award, independently of the
    notification claim above.
    """
    inspector = inspect(engine)
    if "assessment_attempts" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("assessment_attempts")}
    if "gamification_processed_at" not in existing:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN gamification_processed_at TIMESTAMP"))


DPS_COLUMNS = {
    "publication_status": "VARCHAR(30) DEFAULT 'DRAFT'",
    "last_preview_seed": "TEXT",
    "published_seed": "TEXT",
    "published_at": "TIMESTAMP",
    "published_by_user_id": "VARCHAR",
}


def ensure_dps_publication_columns() -> None:
    """SQLite-safe DPS publication migration for Admin publishing governance."""
    inspector = inspect(engine)
    if "dps" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("dps")}
    missing = [(name, ddl) for name, ddl in DPS_COLUMNS.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE dps ADD COLUMN {name} {ddl}"))
        if "publication_status" not in existing:
            connection.execute(text("UPDATE dps SET publication_status = 'DRAFT' WHERE publication_status IS NULL"))



ASSESSMENT_ASSIGNMENT_COLUMNS = {
    "assessment_assignment_type": "VARCHAR(30) DEFAULT 'ORIGINAL'",
    "source_assignment_id": "VARCHAR",
    "reattempt_approval_id": "VARCHAR",
}

ASSESSMENT_REATTEMPT_APPROVAL_COLUMNS = {
    "requested_by_user_id": "VARCHAR",
    "approved_by_user_id": "VARCHAR",
    "assessment_attempt_id": "VARCHAR",
    "reason": "TEXT",
    "admin_note": "TEXT",
    "next_attempt_number": "INTEGER",
    "approved_at": "TIMESTAMP",
    "used_at": "TIMESTAMP",
}


def ensure_assessment_reattempt_columns() -> None:
    """SQLite-safe migration for assessment re-attempt approval governance."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "assessment_assignments" in tables:
        existing = {column["name"] for column in inspector.get_columns("assessment_assignments")}
        missing = [(name, ddl) for name, ddl in ASSESSMENT_ASSIGNMENT_COLUMNS.items() if name not in existing]
        with engine.begin() as connection:
            for name, ddl in missing:
                connection.execute(text(f"ALTER TABLE assessment_assignments ADD COLUMN {name} {ddl}"))
            if "assessment_assignment_type" in existing or any(name == "assessment_assignment_type" for name, _ in missing):
                connection.execute(text("UPDATE assessment_assignments SET assessment_assignment_type = 'ORIGINAL' WHERE assessment_assignment_type IS NULL"))

    if "assessment_reattempt_approvals" in tables:
        existing = {column["name"] for column in inspector.get_columns("assessment_reattempt_approvals")}
        missing = [(name, ddl) for name, ddl in ASSESSMENT_REATTEMPT_APPROVAL_COLUMNS.items() if name not in existing]
        if missing:
            with engine.begin() as connection:
                for name, ddl in missing:
                    connection.execute(text(f"ALTER TABLE assessment_reattempt_approvals ADD COLUMN {name} {ddl}"))


def ensure_student_level_promotions_table() -> None:
    """SQLite-safe promotion history table for Admin-controlled level progression."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "student_level_promotions" in tables:
        return

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS student_level_promotions (
                id VARCHAR PRIMARY KEY,
                student_id VARCHAR NOT NULL,
                student_code VARCHAR(50),
                from_module_id VARCHAR,
                from_module_code VARCHAR(20),
                from_level_id VARCHAR NOT NULL,
                from_level_code VARCHAR(50),
                to_module_id VARCHAR,
                to_module_code VARCHAR(20),
                to_level_id VARCHAR NOT NULL,
                to_level_code VARCHAR(50),
                assessment_assignment_id VARCHAR NOT NULL,
                assessment_attempt_id VARCHAR,
                assessment_result_id VARCHAR,
                score FLOAT,
                max_score FLOAT,
                percentage FLOAT,
                status VARCHAR(30) DEFAULT 'PROMOTED' NOT NULL,
                promoted_by_user_id VARCHAR,
                promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_student_level_promotion_assignment UNIQUE (student_id, assessment_assignment_id, from_level_id)
            )
        """))



ASSIGNMENT_ATTEMPT_CHAIN_COLUMNS = {
    "attempt_group_id": "VARCHAR",
    "source_assignment_id": "VARCHAR",
    "retry_attempt_number": "INTEGER DEFAULT 0",
    "assignment_source": "VARCHAR(30) DEFAULT 'ORIGINAL'",
    "auto_retry_limit": "INTEGER DEFAULT 2",
    "requires_manual_intervention": "BOOLEAN DEFAULT false",
    "manual_intervention_reason": "TEXT",
}

ATTEMPT_CHAIN_COLUMNS = {
    "attempt_group_id": "VARCHAR",
    "attempt_number": "INTEGER DEFAULT 0",
    "attempt_source": "VARCHAR(30) DEFAULT 'ORIGINAL'",
    "requires_manual_intervention": "BOOLEAN DEFAULT false",
    "cleared_at_attempt": "BOOLEAN DEFAULT false",
    "benchmark_status": "VARCHAR(30) DEFAULT 'PENDING'",
}


def ensure_assignment_attempt_chain_columns() -> None:
    """Add Phase 10.9.4A DPS attempt-chain fields to live databases safely."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        if "assignments" in tables:
            existing = {column["name"] for column in inspector.get_columns("assignments")}
            for name, ddl in ASSIGNMENT_ATTEMPT_CHAIN_COLUMNS.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE assignments ADD COLUMN {name} {ddl}"))

            connection.execute(text("UPDATE assignments SET attempt_group_id = id WHERE attempt_group_id IS NULL"))
            connection.execute(text("UPDATE assignments SET retry_attempt_number = 0 WHERE retry_attempt_number IS NULL"))
            connection.execute(text("UPDATE assignments SET assignment_source = 'ORIGINAL' WHERE assignment_source IS NULL"))
            connection.execute(text("UPDATE assignments SET auto_retry_limit = 2 WHERE auto_retry_limit IS NULL OR auto_retry_limit > 2"))
            connection.execute(text("UPDATE assignments SET requires_manual_intervention = false WHERE requires_manual_intervention IS NULL"))

        if "attempts" in tables:
            existing = {column["name"] for column in inspector.get_columns("attempts")}
            for name, ddl in ATTEMPT_CHAIN_COLUMNS.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE attempts ADD COLUMN {name} {ddl}"))

            connection.execute(text("UPDATE attempts SET attempt_group_id = assignment_id WHERE attempt_group_id IS NULL AND assignment_id IS NOT NULL"))
            connection.execute(text("UPDATE attempts SET attempt_number = 0 WHERE attempt_number IS NULL"))
            connection.execute(text("UPDATE attempts SET attempt_source = 'ORIGINAL' WHERE attempt_source IS NULL"))
            connection.execute(text("UPDATE attempts SET requires_manual_intervention = false WHERE requires_manual_intervention IS NULL"))
            connection.execute(text("UPDATE attempts SET cleared_at_attempt = false WHERE cleared_at_attempt IS NULL"))
            connection.execute(text("UPDATE attempts SET benchmark_status = 'PENDING' WHERE benchmark_status IS NULL"))

PARENT_REPORT_EMAIL_LOG_COLUMNS = {
    "delivery_status": "VARCHAR(30) DEFAULT 'QUEUED' NOT NULL",
    "delivery_provider": "VARCHAR(50)",
    "provider_message_id": "VARCHAR(255)",
    "provider_response": "TEXT",
    "attempt_count": "INTEGER DEFAULT 0 NOT NULL",
    "last_attempt_at": "TIMESTAMP",
    "delivered_at": "TIMESTAMP",
    "bounced_at": "TIMESTAMP",
    "opened_at": "TIMESTAMP",
}


def ensure_parent_report_email_logs_table() -> None:
    """SQLite-safe delivery log table for parent progress report emails."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        if "parent_report_email_logs" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS parent_report_email_logs (
                    id VARCHAR PRIMARY KEY,
                    student_id VARCHAR,
                    student_code VARCHAR(50),
                    module_code VARCHAR(50),
                    level_code VARCHAR(50),
                    recipient_email VARCHAR(150) NOT NULL,
                    recipient_type VARCHAR(30) NOT NULL,
                    file_name VARCHAR(255),
                    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
                    delivery_status VARCHAR(30) DEFAULT 'QUEUED' NOT NULL,
                    delivery_provider VARCHAR(50),
                    provider_message_id VARCHAR(255),
                    provider_response TEXT,
                    attempt_count INTEGER DEFAULT 0 NOT NULL,
                    sent_by_user_id VARCHAR,
                    sent_at TIMESTAMP,
                    last_attempt_at TIMESTAMP,
                    delivered_at TIMESTAMP,
                    bounced_at TIMESTAMP,
                    opened_at TIMESTAMP,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
        else:
            existing = {column["name"] for column in inspector.get_columns("parent_report_email_logs")}
            for name, ddl in PARENT_REPORT_EMAIL_LOG_COLUMNS.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE parent_report_email_logs ADD COLUMN {name} {ddl}"))

        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS parent_report_delivery_events (
                id VARCHAR PRIMARY KEY,
                delivery_log_id VARCHAR NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                status VARCHAR(30) NOT NULL,
                provider VARCHAR(50),
                provider_message_id VARCHAR(255),
                provider_response TEXT,
                error_message TEXT,
                metadata_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))


def ensure_assessment_readiness_testing_overrides_table() -> None:
    """SQLite-safe Admin testing override table for assessment readiness gate restoration."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "assessment_readiness_testing_overrides" in tables:
        return

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS assessment_readiness_testing_overrides (
                id VARCHAR PRIMARY KEY,
                student_id VARCHAR NOT NULL,
                student_code VARCHAR(50),
                module_id VARCHAR,
                module_code VARCHAR(50),
                module_name VARCHAR(150),
                level_id VARCHAR NOT NULL,
                level_code VARCHAR(50),
                level_name VARCHAR(150),
                status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,
                reason TEXT,
                enabled_by_user_id VARCHAR,
                enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                disabled_by_user_id VARCHAR,
                disabled_at TIMESTAMP,
                used_for_assessment_assignment_id VARCHAR,
                used_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))



def ensure_assessment_attempt_remarks_table() -> None:
    """Create persisted assessment-attempt remarks table for Teacher/Admin feedback."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "assessment_attempt_remarks" in tables:
        return

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS assessment_attempt_remarks (
                id VARCHAR PRIMARY KEY,
                assessment_attempt_id VARCHAR NOT NULL,
                remark_text TEXT NOT NULL,
                feedback_category VARCHAR(80) NOT NULL,
                feedback_variant VARCHAR(80) NOT NULL,
                feedback_tone VARCHAR(80) NOT NULL,
                score_band VARCHAR(80),
                created_by_user_id VARCHAR,
                created_by_role VARCHAR(30) NOT NULL,
                updated_by_user_id VARCHAR,
                deleted_by_user_id VARCHAR,
                deleted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_assessment_attempt_remarks_attempt_active ON assessment_attempt_remarks (assessment_attempt_id, deleted_at)"))


def ensure_notifications_table() -> None:
    """SQLite-safe notification table for role-aware platform notifications."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "notifications" in tables:
        return

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR PRIMARY KEY,
                recipient_user_id VARCHAR NOT NULL,
                recipient_role VARCHAR(30) NOT NULL,
                actor_user_id VARCHAR,
                actor_role VARCHAR(30),
                student_id VARCHAR,
                teacher_id VARCHAR,
                module_id VARCHAR,
                level_id VARCHAR,
                lesson_id VARCHAR,
                dps_id VARCHAR,
                assessment_id VARCHAR,
                attempt_id VARCHAR,
                report_delivery_id VARCHAR,
                type VARCHAR(80) NOT NULL,
                category VARCHAR(40) NOT NULL,
                title VARCHAR(180) NOT NULL,
                message TEXT,
                target_route VARCHAR(255),
                target_tab VARCHAR(80),
                target_sub_tab VARCHAR(80),
                color_variant VARCHAR(40) DEFAULT 'INFO' NOT NULL,
                is_read BOOLEAN DEFAULT false NOT NULL,
                read_at TIMESTAMP,
                metadata_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created ON notifications (recipient_user_id, created_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_recipient_read ON notifications (recipient_user_id, is_read)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_category ON notifications (category)"))


def ensure_competition_mock_tables() -> None:
    """Create isolated Competition Mock Practice tables without touching DPS or Assessment tables."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        if "competition_mock_exams" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_exams (
                    id VARCHAR PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    mock_code VARCHAR(80),
                    module_id VARCHAR NOT NULL,
                    level_id VARCHAR NOT NULL,
                    competition_scope VARCHAR(50) DEFAULT 'GENERAL' NOT NULL,
                    difficulty_band VARCHAR(50) DEFAULT 'COMPETITION' NOT NULL,
                    total_questions INTEGER NOT NULL,
                    total_marks FLOAT DEFAULT 100 NOT NULL,
                    marks_per_question FLOAT DEFAULT 1 NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL,
                    instructions TEXT,
                    syllabus_coverage_json TEXT,
                    generation_config_json TEXT,
                    created_by_user_id VARCHAR,
                    published_by_user_id VARCHAR,
                    published_at TIMESTAMP,
                    archived_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT true NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_competition_mock_level_code UNIQUE (level_id, mock_code)
                )
            """))

        if "competition_mock_questions" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_questions (
                    id VARCHAR PRIMARY KEY,
                    mock_exam_id VARCHAR NOT NULL,
                    section_number INTEGER DEFAULT 1 NOT NULL,
                    section_title VARCHAR(255),
                    question_number INTEGER NOT NULL,
                    display_type VARCHAR(50) DEFAULT 'VERTICAL' NOT NULL,
                    question_text TEXT,
                    operands_json TEXT,
                    operators_json TEXT,
                    correct_answer TEXT NOT NULL,
                    explanation TEXT,
                    difficulty VARCHAR(50),
                    concept_family VARCHAR(100),
                    concept_tag VARCHAR(100),
                    source_type VARCHAR(50) DEFAULT 'COMPETITION_MOCK_ENGINE' NOT NULL,
                    source_reference_id VARCHAR,
                    seed TEXT,
                    marks FLOAT DEFAULT 1 NOT NULL,
                    metadata_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_competition_mock_question_number UNIQUE (mock_exam_id, question_number)
                )
            """))

        if "competition_mock_question_options" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_question_options (
                    id VARCHAR PRIMARY KEY,
                    mock_question_id VARCHAR NOT NULL,
                    option_label VARCHAR(1) NOT NULL,
                    option_value TEXT NOT NULL,
                    is_correct BOOLEAN DEFAULT false NOT NULL,
                    display_order INTEGER NOT NULL,
                    CONSTRAINT uq_competition_mock_option_label UNIQUE (mock_question_id, option_label)
                )
            """))

        if "competition_mock_assignments" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_assignments (
                    id VARCHAR PRIMARY KEY,
                    mock_exam_id VARCHAR NOT NULL,
                    student_id VARCHAR NOT NULL,
                    teacher_id VARCHAR,
                    assigned_by_user_id VARCHAR,
                    status VARCHAR(30) DEFAULT 'ASSIGNED' NOT NULL,
                    current_attempt_number INTEGER DEFAULT 0 NOT NULL,
                    max_attempts INTEGER DEFAULT 1 NOT NULL,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    due_at TIMESTAMP,
                    instructions TEXT,
                    is_active BOOLEAN DEFAULT true NOT NULL,
                    CONSTRAINT uq_competition_mock_assignment_student UNIQUE (mock_exam_id, student_id)
                )
            """))

        if "competition_mock_attempts" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_attempts (
                    id VARCHAR PRIMARY KEY,
                    mock_assignment_id VARCHAR NOT NULL,
                    mock_exam_id VARCHAR NOT NULL,
                    student_id VARCHAR NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    status VARCHAR(30) DEFAULT 'IN_PROGRESS' NOT NULL,
                    started_at TIMESTAMP NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    submitted_at TIMESTAMP,
                    duration_seconds INTEGER NOT NULL,
                    total_questions INTEGER DEFAULT 0 NOT NULL,
                    attempted_count INTEGER DEFAULT 0 NOT NULL,
                    correct_count INTEGER DEFAULT 0 NOT NULL,
                    wrong_count INTEGER DEFAULT 0 NOT NULL,
                    unanswered_count INTEGER DEFAULT 0 NOT NULL,
                    total_score FLOAT DEFAULT 0 NOT NULL,
                    max_score FLOAT DEFAULT 0 NOT NULL,
                    percentage FLOAT DEFAULT 0 NOT NULL,
                    performance_band VARCHAR(50),
                    time_taken_seconds INTEGER,
                    time_utilization_percentage FLOAT,
                    CONSTRAINT uq_competition_mock_attempt_number UNIQUE (mock_assignment_id, attempt_number)
                )
            """))

        if "competition_mock_attempt_answers" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_attempt_answers (
                    id VARCHAR PRIMARY KEY,
                    mock_attempt_id VARCHAR NOT NULL,
                    mock_question_id VARCHAR NOT NULL,
                    selected_option_id VARCHAR,
                    selected_value TEXT,
                    is_correct BOOLEAN,
                    marks_awarded FLOAT DEFAULT 0 NOT NULL,
                    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_competition_mock_attempt_question_answer UNIQUE (mock_attempt_id, mock_question_id)
                )
            """))

        if "competition_mock_result_summaries" not in tables:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS competition_mock_result_summaries (
                    id VARCHAR PRIMARY KEY,
                    mock_attempt_id VARCHAR NOT NULL UNIQUE,
                    mock_assignment_id VARCHAR NOT NULL,
                    mock_exam_id VARCHAR NOT NULL,
                    student_id VARCHAR NOT NULL,
                    score FLOAT DEFAULT 0 NOT NULL,
                    max_score FLOAT DEFAULT 100 NOT NULL,
                    percentage FLOAT DEFAULT 0 NOT NULL,
                    accuracy_percentage FLOAT DEFAULT 0 NOT NULL,
                    time_taken_seconds INTEGER,
                    time_utilization_percentage FLOAT,
                    performance_band VARCHAR(50) NOT NULL,
                    concept_strengths_json TEXT,
                    concept_weaknesses_json TEXT,
                    concept_performance_json TEXT,
                    recommendation_json TEXT,
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_exams_level_status ON competition_mock_exams (level_id, status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_questions_exam_section ON competition_mock_questions (mock_exam_id, section_number)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_assignments_student_status ON competition_mock_assignments (student_id, status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_assignments_exam ON competition_mock_assignments (mock_exam_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_attempts_student ON competition_mock_attempts (student_id, submitted_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_competition_mock_results_student ON competition_mock_result_summaries (student_id, completed_at)"))

def ensure_mock_notifications_fixed() -> None:
    import re
    from app.database import SessionLocal
    from app.models.models import Notification
    
    db = SessionLocal()
    try:
        notifications = db.query(Notification).filter(Notification.message.like('%Score:%')).all()
        pattern = re.compile(r"Score: (\d+(?:\.\d+)?)/(\d+(?:\.\d+)?) \((\d+(?:\.\d+)?)%\)")
        
        updated_count = 0
        for n in notifications:
            def replacer(match):
                score = int(round(float(match.group(1))))
                max_score = int(round(float(match.group(2))))
                pct = int(round(float(match.group(3))))
                return f"Score: {score}/{max_score} ({pct}%)"
            
            new_message, num_subs = pattern.subn(replacer, n.message)
            if num_subs > 0 and new_message != n.message:
                n.message = new_message
                updated_count += 1
                
        if updated_count > 0:
            db.commit()
            print(f"Fixed {updated_count} mock notifications.")
    except Exception as e:
        print(f"Error fixing mock notifications: {e}")
    finally:
        db.close()

def ensure_mock_accuracy_fixed() -> None:
    """Fixes the historical mock attempt accuracy percentages directly on startup."""
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                UPDATE competition_mock_result_summaries
                SET accuracy_percentage = (
                    SELECT ROUND((CAST(cma.correct_count AS FLOAT) / 
                        CASE 
                            WHEN cma.total_questions > 0 THEN cma.total_questions 
                            WHEN (COALESCE(cma.attempted_count, 0) + COALESCE(cma.unanswered_count, 0)) > 0 THEN (COALESCE(cma.attempted_count, 0) + COALESCE(cma.unanswered_count, 0))
                            ELSE 100 
                        END) * 100)
                    FROM competition_mock_attempts cma
                    WHERE cma.id = competition_mock_result_summaries.mock_attempt_id
                )
                WHERE EXISTS (
                    SELECT 1 FROM competition_mock_attempts cma WHERE cma.id = competition_mock_result_summaries.mock_attempt_id AND cma.correct_count IS NOT NULL
                )
            """))
    except Exception as e:
        print(f"Failed to fix mock accuracy: {e}")

def ensure_mock_gamification_tables() -> None:
    from app.models.models import AchievementBadge, StudentBadge, StudentAchievementStat
    from app.database import engine
    from sqlalchemy import text, inspect
    
    inspector = inspect(engine)
    if "achievement_badges" in inspector.get_table_names():
        with engine.connect() as connection:
            try:
                # To be 100% sure we don't have the bad unique=True constraint, we check for our new composite index.
                # If we can't find it, we just wipe the gamification tables and let create_all recreate them.
                # Gamification is a brand new feature so these tables are empty in production anyway.
                if engine.dialect.name == "sqlite":
                    res = connection.execute(text("PRAGMA index_list('achievement_badges')")).fetchall()
                    has_new_index = any("uix_badge_code_tier" in str(r) for r in res)
                else:
                    # PostgreSQL
                    res = connection.execute(text("SELECT indexname FROM pg_indexes WHERE tablename = 'achievement_badges'")).fetchall()
                    has_new_index = any("uix_badge_code_tier" in str(r) for r in res)
                
                if not has_new_index:
                    with connection.begin():
                        connection.execute(text("DROP TABLE IF EXISTS student_badges CASCADE" if engine.dialect.name != "sqlite" else "DROP TABLE IF EXISTS student_badges"))
                        connection.execute(text("DROP TABLE IF EXISTS student_achievement_stats CASCADE" if engine.dialect.name != "sqlite" else "DROP TABLE IF EXISTS student_achievement_stats"))
                        connection.execute(text("DROP TABLE IF EXISTS achievement_badges CASCADE" if engine.dialect.name != "sqlite" else "DROP TABLE IF EXISTS achievement_badges"))
            except Exception as e:
                print(f"Error checking/dropping gamification tables: {e}")
            
    AchievementBadge.metadata.create_all(bind=engine, tables=[
        AchievementBadge.__table__,
        StudentBadge.__table__,
        StudentAchievementStat.__table__
    ])


def ensure_mock_gamification_rewards_retroactive() -> None:
    """Retroactively award XP, Coins, and Badges for existing mock submissions."""
    try:
        from app.database import SessionLocal
        from app.models.models import CompetitionMockResultSummary, Student, EconomyTransaction, UserEconomy, AchievementBadge
        from app.services.economy_service import EconomyService
        from app.services.achievements import AchievementEngine
        from app.services.notification_service import CreateNotification
        from sqlalchemy.orm import joinedload
        
        db = SessionLocal()
        try:
            # Check all existing summaries
            summaries = db.query(CompetitionMockResultSummary).options(joinedload(CompetitionMockResultSummary.mock_assignment)).all()
            for summary in summaries:
                # Check if XP was already awarded for this attempt
                existing_tx = db.query(EconomyTransaction).filter(
                    EconomyTransaction.source_action == f"MOCK_EXAM_SUBMISSION_{summary.mock_attempt_id}"
                ).first()
                
                student = db.query(Student).filter_by(id=summary.student_id).first()
                if not student or not student.user_id:
                    continue
                
                if not existing_tx:
                    # Award missing XP and Coins
                    try:
                        econ_result = EconomyService.evaluate_assignment_performance(
                            db=db,
                            user_id=student.user_id,
                            accuracy_percent=summary.percentage or 0.0,
                            base_xp=500,
                            assignment_id=summary.mock_assignment_id or "MOCK"
                        )
                    except Exception as e:
                        import logging
                        logging.error(f"Failed to retroactive award XP for {summary.id}: {e}")
                
                # Retroactively evaluate badges
                try:
                    # We pass the db session and it will check what badges they already have, and award new ones if needed
                    unlocked_badges = AchievementEngine.evaluate_mock_exam_submission(db, student.id, summary)
                    
                    for b in unlocked_badges:
                        try:
                            badge_id = b.get("id")
                            code = b.get("code")
                            tier = b.get("tier")
                            name = b.get("name")
                            description = b.get("description")
                            icon_name = b.get("icon_name", "Target")
                            
                            CreateNotification(
                                db,
                                recipient_user_id=student.user_id,
                                recipient_role="STUDENT",
                                type="BADGE_UNLOCKED",
                                category="GAMIFICATION",
                                title=f"New Badge Unlocked: {name}",
                                message=f"You unlocked the {tier} tier '{name}' badge for: {description}!",
                                target_route=f"/student/achievements?badge={code}_{tier}",
                                color_variant="PURPLE",
                                metadata={"badgeId": badge_id, "tier": tier, "code": code, "icon": icon_name}
                            )
                        except Exception as ne:
                            import logging
                            logging.error(f"Failed retroactive badge notif: {ne}")
                except Exception as e:
                    import logging
                    logging.error(f"Failed to retroactive gamify {summary.id}: {e}")
                    
            db.commit()
        except Exception as inner_e:
            db.rollback()
            import logging
            logging.error(f"Retroactive gamification failed: {inner_e}")
        finally:
            db.close()
    except Exception as e:
        import logging
        logging.error(f"Failed in ensure_mock_gamification_rewards_retroactive: {e}")
