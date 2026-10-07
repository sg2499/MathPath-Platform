"""2026-10-07 (Shailesh): readiness is a guide, not a gate, and the screens
say so.

The readiness gate has been bypassed in production since launch. Every
screen described that as a temporary testing mode ("Testing Bypass Active",
"for QA", "demo verification", "until the owner explicitly restores strict
readiness"). On 7 Oct 2026 Shailesh decided it is the policy: students who
joined mid-level can never have every sheet of that level, and others will
not finish every sheet either, so the teacher decides when a student sits
the level assessment and readiness is shown for their judgement.

Words only. The last test here pins that the behaviour did NOT change.
"""

from app.api.routes_admin import AssessmentReadinessGateAuditPayload
from app.api.routes_teacher import (
    AssessmentAssignmentReadinessMessage,
    AssessmentAssignmentReadinessMode,
    AssessmentGateModePayload,
    AssessmentReadinessGateOpen,
)
from app.core import config

NOT_READY = {"eligible": False, "status": "PRACTICE_INCOMPLETE", "message": "Some DPS sheets in this level are not completed yet."}
OLD_WORDS = ("testing", "bypass", " qa", "demo", "verification", "before live deployment")


def _no_old_words(text: str):
    lowered = f" {text.lower()}"
    assert not [word for word in OLD_WORDS if word in lowered], text


def test_this_suite_runs_in_the_live_configuration():
    # Live has no ASSESSMENT_READINESS_FORCE_STRICT set, which means the
    # gate is open for everyone. These tests describe that configuration.
    assert config.TEMPORARY_ASSESSMENT_READINESS_BYPASS is True


def test_the_gate_labels_say_guide_not_testing():
    assert config.ASSESSMENT_READINESS_GATE_LABEL == "Readiness: Guide Only"
    assert AssessmentGateModePayload([])["assignmentGateLabel"] == "Readiness: Guide Only"
    _no_old_words(config.ASSESSMENT_READINESS_GATE_LABEL)


def test_the_teachers_line_for_a_student_who_is_not_ready():
    message = AssessmentAssignmentReadinessMessage(NOT_READY, None)
    assert message == "Can be assigned. Readiness is a guide; the teacher decides."
    _no_old_words(message)


def test_the_admin_readiness_banner_text():
    audit = AssessmentReadinessGateAuditPayload([NOT_READY])
    assert audit["label"] == "Readiness: Guide Only"
    assert audit["assignmentImpactLabel"] == "Teachers can assign a level assessment to any student in that level."
    for key in ("label", "assignmentImpactLabel", "nextPhaseNote"):
        _no_old_words(audit[key])
    assert audit["notReadyStudentsImpacted"] == 1


def test_the_missing_sheets_message_no_longer_says_must_and_is_fit_for_the_student_to_read():
    # Built by the eligibility service for a student with sheets missing; the
    # same line is shown to the student, the teacher and the admin.
    import inspect

    from app.services import assessment_eligibility_service as service

    source = inspect.getsource(service.assessment_eligibility_payload)
    assert 'message = "Some DPS sheets in this level are not completed yet."' in source
    assert 'message = "The student must complete all DPS sheets' not in source


def test_nothing_about_the_behaviour_changed():
    # A student who is not ready can still be assigned, exactly as before...
    assert AssessmentReadinessGateOpen(NOT_READY, None) is True
    # ...and the machine-readable mode the screens switch on is untouched.
    assert AssessmentAssignmentReadinessMode(NOT_READY, None) == "TEMPORARY_BYPASS"
    assert AssessmentGateModePayload([])["assignmentGateMode"] == "GLOBAL_TESTING_BYPASS"
    assert AssessmentGateModePayload([])["strictReadinessMode"] is False
    assert AssessmentReadinessGateAuditPayload([])["temporaryBypassEnabled"] is True
    # A ready student is still simply ready.
    assert AssessmentAssignmentReadinessMode({"eligible": True}, None) == "READY"
    assert AssessmentAssignmentReadinessMessage({"eligible": True}, None) == "Ready for original assessment assignment."
