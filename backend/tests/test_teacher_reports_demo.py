"""Teacher revamp (2026-10): the teacher's Progress Reports list leaves demo /
test accounts out unless "Show Demo Accounts" is on. The Phase 2 demo work
missed this list, so the test account showed on live."""

from datetime import timedelta

from app.models import ParentReportEmailLog, Teacher
from app.services import demo_students
from tests.test_phase2_demo_students import T0, db, world  # noqa: F401  (fixtures)


def _publish(db, student_id):
    db.add(ParentReportEmailLog(
        id=f"log-{student_id}", student_id=student_id, student_code=f"MP-{student_id}", module_code="IM", level_code="IM-L1",
        recipient_email="p@x.test", recipient_type="PARENT", file_name=f"{student_id}.pdf",
        published_to_teacher_at=T0 + timedelta(days=1),
    ))
    db.commit()


def _listed(db):
    from app.api.routes_teacher_reports import teacher_list_parent_report_deliveries

    reply = teacher_list_parent_report_deliveries(studentCode=None, db=db, teacher=db.get(Teacher, "t1"))
    return sorted(Row["studentId"] for Row in reply["logs"])


def test_progress_reports_leave_out_demo_accounts(world):
    _publish(world, "real")
    _publish(world, "demo")
    assert _listed(world) == ["real"]


def test_progress_reports_show_demo_accounts_with_the_switch_on(world):
    _publish(world, "real")
    _publish(world, "demo")
    demo_students.SetIncludeDemo(world, True)
    assert _listed(world) == ["demo", "real"]
