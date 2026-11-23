"""Parent report publish flow (2026-11, Shailesh): a generated report reaches
the teacher only once it is published; Publish is now offered on the Generate
Reports row as well as in the Report Log, so publishing twice must not notify
the teacher twice or move the published date."""

from app.models import Notification, ParentReportEmailLog, Teacher, User
from tests.test_phase2_demo_students import db, world  # noqa: F401  (fixtures)


def _generated(db, student_id="real"):
    db.add(ParentReportEmailLog(
        id=f"log-{student_id}", student_id=student_id, student_code=f"MP-{student_id}", module_code="IM", level_code="IM-L1",
        recipient_email="", recipient_type="GENERATED", file_name=f"{student_id}.pdf", status="GENERATED",
        sent_by_user_id="admin",
    ))
    db.commit()


def _teacher_list(db):
    from app.api.routes_teacher_reports import teacher_list_parent_report_deliveries

    reply = teacher_list_parent_report_deliveries(studentCode=None, db=db, teacher=db.get(Teacher, "t1"))
    return [Row["id"] for Row in reply["logs"]]


def _publish(db, log_id="log-real"):
    from app.api.routes_admin import publish_parent_report_to_teacher

    return publish_parent_report_to_teacher(log_id, db=db, user=db.get(User, "admin"))


def _teacher_notifications(db):
    return db.query(Notification).filter(Notification.recipient_user_id == "tu").count()


def test_generated_report_stays_hidden_from_the_teacher_until_published(world):
    _generated(world)
    assert _teacher_list(world) == []

    reply = _publish(world)
    assert reply["published"] is True and not reply.get("alreadyPublished")
    assert _teacher_list(world) == ["log-real"]
    log = world.get(ParentReportEmailLog, "log-real")
    assert log.status == "PUBLISHED" and log.published_by_user_id == "admin"


def test_publishing_twice_keeps_the_first_date_and_notifies_once(world):
    _generated(world)
    _publish(world)
    first_date = world.get(ParentReportEmailLog, "log-real").published_to_teacher_at
    notified = _teacher_notifications(world)
    assert notified == 1

    again = _publish(world)
    assert again["published"] is True and again["alreadyPublished"] is True
    assert world.get(ParentReportEmailLog, "log-real").published_to_teacher_at == first_date
    assert _teacher_notifications(world) == notified
