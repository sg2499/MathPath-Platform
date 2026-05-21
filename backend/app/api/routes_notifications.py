from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models import User
from app.services.notification_service import (
    CreateNotification,
    ListNotifications,
    MarkAllNotificationsRead,
    MarkNotificationRead,
    NotificationPayload,
    UnreadNotificationCount,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
admin_dep = require_roles("SUPER_ADMIN", "ADMIN")


class CreateNotificationRequest(BaseModel):
    recipientUserId: str
    recipientRole: str
    type: str
    category: str
    title: str
    message: str | None = None
    studentId: str | None = None
    teacherId: str | None = None
    moduleId: str | None = None
    levelId: str | None = None
    lessonId: str | None = None
    dpsId: str | None = None
    assessmentId: str | None = None
    attemptId: str | None = None
    reportDeliveryId: str | None = None
    targetRoute: str | None = None
    targetTab: str | None = None
    targetSubTab: str | None = None
    colorVariant: str | None = None
    metadata: dict[str, Any] | None = None


@router.get("")
def list_my_notifications(
    unreadOnly: bool = False,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ListNotifications(
        db,
        recipient_user_id=user.id,
        unread_only=unreadOnly,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"unreadCount": UnreadNotificationCount(db, recipient_user_id=user.id)}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = MarkAllNotificationsRead(db, recipient_user_id=user.id)
    db.commit()
    return {"updatedCount": count, "unreadCount": 0}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notification = MarkNotificationRead(db, notification_id=notification_id, recipient_user_id=user.id)
    if not notification:
        api_error(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.")
    db.commit()
    return NotificationPayload(notification)


@router.post("/admin/create")
def admin_create_notification(
    payload: CreateNotificationRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_dep),
):
    recipient = db.get(User, payload.recipientUserId)
    if not recipient or not recipient.is_active:
        api_error(404, "RECIPIENT_NOT_FOUND", "Notification recipient was not found or is inactive.")

    notification = CreateNotification(
        db,
        recipient_user_id=recipient.id,
        recipient_role=payload.recipientRole or recipient.role,
        actor_user_id=actor.id,
        actor_role=actor.role,
        type=payload.type,
        category=payload.category,
        title=payload.title,
        message=payload.message,
        student_id=payload.studentId,
        teacher_id=payload.teacherId,
        module_id=payload.moduleId,
        level_id=payload.levelId,
        lesson_id=payload.lessonId,
        dps_id=payload.dpsId,
        assessment_id=payload.assessmentId,
        attempt_id=payload.attemptId,
        report_delivery_id=payload.reportDeliveryId,
        target_route=payload.targetRoute,
        target_tab=payload.targetTab,
        target_sub_tab=payload.targetSubTab,
        color_variant=payload.colorVariant,
        metadata=payload.metadata,
    )
    db.commit()
    db.refresh(notification)
    return NotificationPayload(notification)
