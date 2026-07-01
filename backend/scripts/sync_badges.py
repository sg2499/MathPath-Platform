import sys
import os
sys.path.insert(0, os.getcwd())

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.models import CompetitionMockResultSummary, StudentAchievementStat, StudentBadge
from app.services.achievements import AchievementEngine

def sync_all_badges():
    db: Session = SessionLocal()
    try:
        print("Starting Gamification Sync...")
        
        # 1. Wipe all existing badge data
        print("Wiping existing StudentBadge and StudentAchievementStat records...")
        db.query(StudentBadge).delete()
        db.query(StudentAchievementStat).delete()
        db.commit()
        
        # 2. Fetch all completed summaries in chronological order
        print("Fetching all mock result summaries...")
        summaries = db.query(CompetitionMockResultSummary).filter(
            CompetitionMockResultSummary.completed_at != None
        ).order_by(CompetitionMockResultSummary.completed_at.asc()).all()
        
        print(f"Found {len(summaries)} mock exam submissions to re-evaluate.")
        
        # 3. Evaluate each one
        for summary in summaries:
            print(f"Evaluating submission for student {summary.student_id} (Attempt: {summary.mock_attempt_id})")
            unlocked = AchievementEngine.evaluate_mock_exam_submission(db, summary.student_id, summary)
            if unlocked:
                print(f"  -> Unlocked {len(unlocked)} badges!")
                for b in unlocked:
                    print(f"     - {b['name']} ({b['tier']})")
        
        print("Gamification Sync Complete!")
        
    except Exception as e:
        db.rollback()
        print(f"Error during gamification sync: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_all_badges()
