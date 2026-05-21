import json
from sqlalchemy.orm import Session
from app.models import AuditLog

def log_event(db: Session, event_type: str, user_id=None, student_id=None, attempt_id=None, data=None):
    log = AuditLog(
        event_type=event_type,
        user_id=user_id,
        student_id=student_id,
        attempt_id=attempt_id,
        event_data_json=json.dumps(data or {}),
    )
    db.add(log)
