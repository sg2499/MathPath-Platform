import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Notification, User

NOTIFICATION_COLOR_BY_CATEGORY = {
    "PRACTICE": "BLUE",
    "ASSESSMENT": "PURPLE",
    "RESULT": "GREEN",
    "REATTEMPT": "AMBER",
    "PROMOTION": "INDIGO",
    "PARENT_REPORT": "TEAL",
    "FAILURE": "RED",
    "SYSTEM": "GRAY",
}


def _json_dumps(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value, default=str)


def _json_loads(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def NotificationPayload(notification: Notification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "recipientUserId": notification.recipient_user_id,
        "recipientRole": notification.recipient_role,
        "actorUserId": notification.actor_user_id,
        "actorRole": notification.actor_role,
        "studentId": notification.student_id,
        "teacherId": notification.teacher_id,
        "moduleId": notification.module_id,
        "levelId": notification.level_id,
        "lessonId": notification.lesson_id,
        "dpsId": notification.dps_id,
        "assessmentId": notification.assessment_id,
        "attemptId": notification.attempt_id,
        "reportDeliveryId": notification.report_delivery_id,
        "type": notification.type,
        "category": notification.category,
        "title": notification.title,
        "message": notification.message,
        "targetRoute": notification.target_route,
        "targetTab": notification.target_tab,
        "targetSubTab": notification.target_sub_tab,
        "colorVariant": notification.color_variant,
        "isRead": bool(notification.is_read),
        "readAt": notification.read_at.isoformat() if notification.read_at else None,
        "createdAt": notification.created_at.isoformat() if notification.created_at else None,
        "metadata": _json_loads(notification.metadata_json),
    }


def CreateNotification(
    db: Session,
    *,
    recipient_user_id: str,
    recipient_role: str,
    type: str,
    category: str,
    title: str,
    message: str | None = None,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
    student_id: str | None = None,
    teacher_id: str | None = None,
    module_id: str | None = None,
    level_id: str | None = None,
    lesson_id: str | None = None,
    dps_id: str | None = None,
    assessment_id: str | None = None,
    attempt_id: str | None = None,
    report_delivery_id: str | None = None,
    target_route: str | None = None,
    target_tab: str | None = None,
    target_sub_tab: str | None = None,
    color_variant: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Notification:
    normalized_category = (category or "SYSTEM").upper()
    notification = Notification(
        recipient_user_id=recipient_user_id,
        recipient_role=(recipient_role or "").upper(),
        actor_user_id=actor_user_id,
        actor_role=(actor_role or "").upper() if actor_role else None,
        student_id=student_id,
        teacher_id=teacher_id,
        module_id=module_id,
        level_id=level_id,
        lesson_id=lesson_id,
        dps_id=dps_id,
        assessment_id=assessment_id,
        attempt_id=attempt_id,
        report_delivery_id=report_delivery_id,
        type=(type or "SYSTEM_INFO").upper(),
        category=normalized_category,
        title=title,
        message=message,
        target_route=target_route,
        target_tab=target_tab,
        target_sub_tab=target_sub_tab,
        color_variant=(color_variant or NOTIFICATION_COLOR_BY_CATEGORY.get(normalized_category) or "INFO").upper(),
        metadata_json=_json_dumps(metadata),
    )
    db.add(notification)
    db.flush()
    return notification


def ListNotifications(
    db: Session,
    *,
    recipient_user_id: str,
    unread_only: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 20), 100))
    safe_offset = max(0, int(offset or 0))
    query = db.query(Notification).filter(Notification.recipient_user_id == recipient_user_id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    total = query.count()
    unread_count = db.query(Notification).filter(
        Notification.recipient_user_id == recipient_user_id,
        Notification.is_read.is_(False),
    ).count()
    rows = query.order_by(Notification.created_at.desc()).offset(safe_offset).limit(safe_limit).all()
    return {
        "items": [NotificationPayload(row) for row in rows],
        "total": total,
        "unreadCount": unread_count,
        "limit": safe_limit,
        "offset": safe_offset,
    }


def MarkNotificationRead(db: Session, *, notification_id: str, recipient_user_id: str) -> Notification | None:
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.recipient_user_id == recipient_user_id,
    ).first()
    if not notification:
        return None
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.flush()
    return notification


def MarkAllNotificationsRead(db: Session, *, recipient_user_id: str) -> int:
    rows = db.query(Notification).filter(
        Notification.recipient_user_id == recipient_user_id,
        Notification.is_read.is_(False),
    ).all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.is_read = True
        row.read_at = now
    db.flush()
    return len(rows)


def UnreadNotificationCount(db: Session, *, recipient_user_id: str) -> int:
    return db.query(Notification).filter(
        Notification.recipient_user_id == recipient_user_id,
        Notification.is_read.is_(False),
    ).count()


def ActiveAdminUsers(db: Session) -> list[User]:
    return db.query(User).filter(User.role.in_(["SUPER_ADMIN", "ADMIN"]), User.is_active.is_(True)).all()
