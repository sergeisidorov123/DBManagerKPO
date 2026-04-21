from datetime import datetime
from .db import SessionLocal
from .models import ActionLog


def log_action(user_id, action, target_type=None, target_id=None):
    db = SessionLocal()
    try:
        al = ActionLog(user_id=user_id, action=action, target_type=target_type, target_id=target_id, timestamp=datetime.utcnow().isoformat())
        db.add(al)
        db.commit()
    finally:
        db.close()
