import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models.models import User, Notification

db = SessionLocal()

try:
    users = db.query(User).filter(User.full_name.ilike('%Nishant%')).all()
    if not users:
        print("No users found matching 'Nishant'. Trying to fetch all users:")
        all_users = db.query(User).all()
        for u in all_users:
            print(f"- {u.full_name} ({u.id})")
    else:
        user = users[0]
        print(f"Found user: {user.full_name} ({user.id})")
        deleted = db.query(Notification).filter(Notification.user_id == user.id).delete()
        db.commit()
        print(f"Deleted {deleted} notifications.")
finally:
    db.close()
