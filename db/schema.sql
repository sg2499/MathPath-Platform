CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name VARCHAR(150) NOT NULL,
 email VARCHAR(150) UNIQUE,
 phone VARCHAR(20) UNIQUE,
 photo_url TEXT,
 password_hash TEXT NOT NULL,
 role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','TEACHER','STUDENT','PARENT')),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 module_code VARCHAR(20) NOT NULL UNIQUE,
 module_name VARCHAR(150) NOT NULL,
 description TEXT,
 display_order INTEGER NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS levels (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
 level_code VARCHAR(50) NOT NULL,
 level_name VARCHAR(150) NOT NULL,
 internal_level_number INTEGER,
 display_order INTEGER NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(module_id, level_code)
);

CREATE TABLE IF NOT EXISTS students (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 student_code VARCHAR(50) UNIQUE,
 class_name VARCHAR(50),
 current_module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
 current_level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
 parent_contact VARCHAR(20),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 teacher_code VARCHAR(50) UNIQUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_name VARCHAR(150) NOT NULL,
 batch_code VARCHAR(50) UNIQUE,
 teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS student_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(student_id, batch_id)
);

CREATE TABLE IF NOT EXISTS lessons (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
 lesson_number INTEGER NOT NULL,
 lesson_title VARCHAR(255) NOT NULL,
 description TEXT,
 display_order INTEGER NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(level_id, lesson_number)
);

CREATE TABLE IF NOT EXISTS dps (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 dps_number INTEGER NOT NULL,
 dps_title VARCHAR(255) NOT NULL,
 default_question_count INTEGER NOT NULL DEFAULT 10,
 default_duration_seconds INTEGER NOT NULL DEFAULT 300,
 marks_per_question NUMERIC(5,2) NOT NULL DEFAULT 1,
 label_style VARCHAR(30) NOT NULL DEFAULT 'NUMERIC' CHECK (label_style IN ('NUMERIC')),
 answer_type VARCHAR(30) NOT NULL DEFAULT 'MCQ' CHECK (answer_type IN ('MCQ')),
 options_per_question INTEGER NOT NULL DEFAULT 4 CHECK (options_per_question = 4),
 layout_template VARCHAR(100) NOT NULL DEFAULT 'VERTICAL_3_ROW_ADDLESS',
 publication_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN ('DRAFT','PUBLISHED','ARCHIVED')),
 published_at TIMESTAMPTZ,
 published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(lesson_id, dps_number)
);

CREATE TABLE IF NOT EXISTS dps_sections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 dps_id UUID NOT NULL REFERENCES dps(id) ON DELETE CASCADE,
 section_number INTEGER NOT NULL DEFAULT 1,
 section_title VARCHAR(255),
 question_count INTEGER NOT NULL DEFAULT 10,
 concept_family VARCHAR(100) NOT NULL,
 operation_focus VARCHAR(100),
 abacus_rule VARCHAR(100),
 target_numbers_json JSONB,
 place_value VARCHAR(50),
 digit_pattern VARCHAR(100),
 rows_count INTEGER,
 allow_negative_operands BOOLEAN NOT NULL DEFAULT TRUE,
 allow_negative_answer BOOLEAN NOT NULL DEFAULT FALSE,
 generator_config_json JSONB,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(dps_id, section_number)
);

CREATE TABLE IF NOT EXISTS assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_type VARCHAR(30) NOT NULL CHECK (assignment_type IN ('PRACTICE','ASSESSMENT','COMPETITION')),
 dps_id UUID REFERENCES dps(id) ON DELETE CASCADE,
 assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 assigned_to_type VARCHAR(30) NOT NULL CHECK (assigned_to_type IN ('STUDENT','BATCH','LEVEL')),
 assigned_to_id UUID NOT NULL,
 title VARCHAR(255) NOT NULL,
 instructions TEXT,
 start_time TIMESTAMPTZ,
 end_time TIMESTAMPTZ,
 allow_reattempt BOOLEAN NOT NULL DEFAULT FALSE,
 show_result_immediately BOOLEAN NOT NULL DEFAULT TRUE,
 show_correct_answers_after_submit BOOLEAN NOT NULL DEFAULT TRUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS generated_question_sets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
 dps_id UUID NOT NULL REFERENCES dps(id) ON DELETE CASCADE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 mode VARCHAR(30) NOT NULL CHECK (mode IN ('PRACTICE','ASSESSMENT','COMPETITION')),
 seed TEXT NOT NULL,
 generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 metadata_json JSONB
);

CREATE TABLE IF NOT EXISTS generated_questions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 question_set_id UUID NOT NULL REFERENCES generated_question_sets(id) ON DELETE CASCADE,
 dps_section_id UUID REFERENCES dps_sections(id) ON DELETE SET NULL,
 question_number INTEGER NOT NULL,
 display_type VARCHAR(50) NOT NULL DEFAULT 'VERTICAL',
 question_text TEXT,
 operands_json JSONB,
 operators_json JSONB,
 correct_answer TEXT NOT NULL,
 seed TEXT NOT NULL,
 metadata_json JSONB,
 UNIQUE(question_set_id, question_number)
);

CREATE TABLE IF NOT EXISTS question_options (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 question_id UUID NOT NULL REFERENCES generated_questions(id) ON DELETE CASCADE,
 option_label CHAR(1) NOT NULL CHECK (option_label IN ('A','B','C','D')),
 option_value TEXT NOT NULL,
 is_correct BOOLEAN NOT NULL DEFAULT FALSE,
 display_order INTEGER NOT NULL,
 UNIQUE(question_id, option_label),
 UNIQUE(question_id, display_order)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_correct_option_per_question ON question_options(question_id) WHERE is_correct = TRUE;

CREATE TABLE IF NOT EXISTS attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
 dps_id UUID NOT NULL REFERENCES dps(id) ON DELETE CASCADE,
 question_set_id UUID UNIQUE REFERENCES generated_question_sets(id) ON DELETE SET NULL,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 mode VARCHAR(30) NOT NULL CHECK (mode IN ('PRACTICE','ASSESSMENT','COMPETITION')),
 status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED','EXPIRED','LOCKED')),
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 submitted_at TIMESTAMPTZ,
 duration_seconds INTEGER NOT NULL,
 total_questions INTEGER NOT NULL DEFAULT 0,
 attempted_count INTEGER NOT NULL DEFAULT 0,
 correct_count INTEGER NOT NULL DEFAULT 0,
 wrong_count INTEGER NOT NULL DEFAULT 0,
 unanswered_count INTEGER NOT NULL DEFAULT 0,
 total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
 max_score NUMERIC(8,2) NOT NULL DEFAULT 0,
 accuracy_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
 time_taken_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS attempt_answers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
 question_id UUID NOT NULL REFERENCES generated_questions(id) ON DELETE CASCADE,
 selected_option_id UUID REFERENCES question_options(id) ON DELETE SET NULL,
 selected_value TEXT,
 is_correct BOOLEAN,
 marks_awarded NUMERIC(5,2) NOT NULL DEFAULT 0,
 answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 student_id UUID REFERENCES students(id) ON DELETE SET NULL,
 attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
 event_type VARCHAR(100) NOT NULL,
 event_data_json JSONB,
 ip_address VARCHAR(100),
 user_agent TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 8.1 Assessment Engine Foundation
CREATE TABLE IF NOT EXISTS assessment_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 blueprint_id UUID NOT NULL REFERENCES assessment_blueprints(id) ON DELETE CASCADE,
 version_number INTEGER NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
 generation_mode VARCHAR(50) NOT NULL DEFAULT 'BLUEPRINT_LOCKED',
 seed TEXT,
 total_questions INTEGER NOT NULL,
 total_marks NUMERIC(8,2) NOT NULL DEFAULT 100,
 marks_per_question NUMERIC(8,4) NOT NULL,
 duration_seconds INTEGER NOT NULL,
 generated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 generated_at TIMESTAMPTZ,
 published_at TIMESTAMPTZ,
 archived_at TIMESTAMPTZ,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(blueprint_id, version_number)
);

CREATE TABLE IF NOT EXISTS assessment_questions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
 lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 question_number INTEGER NOT NULL,
 lesson_question_number INTEGER NOT NULL,
 display_type VARCHAR(50) NOT NULL DEFAULT 'VERTICAL',
 question_text TEXT,
 operands_json JSONB,
 operators_json JSONB,
 correct_answer TEXT NOT NULL,
 explanation TEXT,
 difficulty VARCHAR(50),
 concept_tag VARCHAR(100),
 source_type VARCHAR(50) NOT NULL DEFAULT 'ASSESSMENT_ENGINE',
 source_reference_id UUID,
 seed TEXT NOT NULL,
 metadata_json JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(assessment_version_id, question_number)
);

CREATE TABLE IF NOT EXISTS assessment_question_options (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
 option_label CHAR(1) NOT NULL,
 option_value TEXT NOT NULL,
 is_correct BOOLEAN NOT NULL DEFAULT FALSE,
 display_order INTEGER NOT NULL,
 UNIQUE(assessment_question_id, option_label)
);

CREATE TABLE IF NOT EXISTS assessment_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
 blueprint_id UUID NOT NULL REFERENCES assessment_blueprints(id) ON DELETE CASCADE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
 assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
 current_attempt_number INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 1,
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 due_at TIMESTAMPTZ,
 instructions TEXT,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(assessment_version_id, student_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_assignment_id UUID NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
 assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 attempt_number INTEGER NOT NULL,
 attempt_type VARCHAR(30) NOT NULL DEFAULT 'ORIGINAL',
 status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
 started_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 submitted_at TIMESTAMPTZ,
 duration_seconds INTEGER NOT NULL,
 total_questions INTEGER NOT NULL DEFAULT 0,
 attempted_count INTEGER NOT NULL DEFAULT 0,
 correct_count INTEGER NOT NULL DEFAULT 0,
 wrong_count INTEGER NOT NULL DEFAULT 0,
 unanswered_count INTEGER NOT NULL DEFAULT 0,
 total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
 max_score NUMERIC(8,2) NOT NULL DEFAULT 0,
 percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
 performance_band VARCHAR(50),
 result_status VARCHAR(50),
 time_taken_seconds INTEGER,
 UNIQUE(assessment_assignment_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS assessment_attempt_answers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
 assessment_question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
 selected_option_id UUID REFERENCES assessment_question_options(id) ON DELETE SET NULL,
 selected_value TEXT,
 is_correct BOOLEAN,
 marks_awarded NUMERIC(5,2) NOT NULL DEFAULT 0,
 answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(assessment_attempt_id, assessment_question_id)
);

CREATE TABLE IF NOT EXISTS assessment_results (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_attempt_id UUID UNIQUE NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
 assessment_assignment_id UUID NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
 assessment_version_id UUID NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
 blueprint_id UUID NOT NULL REFERENCES assessment_blueprints(id) ON DELETE CASCADE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 score NUMERIC(8,2) NOT NULL DEFAULT 0,
 max_score NUMERIC(8,2) NOT NULL DEFAULT 100,
 percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
 performance_band VARCHAR(50) NOT NULL,
 result_status VARCHAR(50) NOT NULL,
 cleared BOOLEAN NOT NULL DEFAULT FALSE,
 level_cleared BOOLEAN NOT NULL DEFAULT FALSE,
 completion_date TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_reattempt_approvals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_assignment_id UUID NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 assessment_attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE SET NULL,
 requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
 reason TEXT,
 admin_note TEXT,
 next_attempt_number INTEGER,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 approved_at TIMESTAMPTZ,
 used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS student_level_promotions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 student_code VARCHAR(50),
 from_module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
 from_module_code VARCHAR(20),
 from_level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
 from_level_code VARCHAR(50),
 to_module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
 to_module_code VARCHAR(20),
 to_level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
 to_level_code VARCHAR(50),
 assessment_assignment_id UUID NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
 assessment_attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE SET NULL,
 assessment_result_id UUID REFERENCES assessment_results(id) ON DELETE SET NULL,
 score NUMERIC(8,2),
 max_score NUMERIC(8,2),
 percentage NUMERIC(5,2),
 status VARCHAR(30) NOT NULL DEFAULT 'PROMOTED',
 promoted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(student_id, assessment_assignment_id, from_level_id)
);

-- Phase 9.1.1 — Platform-Wide Notification Backend Foundation
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
    is_read BOOLEAN DEFAULT 0 NOT NULL,
    read_at TIMESTAMP,
    metadata_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created ON notifications (recipient_user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_read ON notifications (recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS ix_notifications_category ON notifications (category);
