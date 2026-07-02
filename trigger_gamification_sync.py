import os
import sys

# Add the backend directory to python path so we can import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from backend.app.database import SessionLocal
from backend.app.services.achievements import AchievementEngine
from backend.app.models.models import CompetitionMockResultSummary, StudentAchievementStat, StudentBadge

def sync_gamification():
    db = SessionLocal()
    try:
        # Clear stats and student badges
        print("Clearing existing badges and stats...")
        db.query(StudentBadge).delete()
        db.query(StudentAchievementStat).delete()
        db.commit()

        # Seed badges
        print("Seeding badge definitions...")
        AchievementEngine.seed_badges(db)

        # Iterate all results and evaluate
        summaries = db.query(CompetitionMockResultSummary).order_by(CompetitionMockResultSummary.completed_at.asc()).all()
        print(f"Found {len(summaries)} mock exam submissions. Re-evaluating...")
        
        success_count = 0
        for s in summaries:
            try:
                AchievementEngine.evaluate_mock_exam_submission(db, s.student_id, s)
                success_count += 1
            except Exception as e:
                db.rollback()
                print(f"Error evaluating submission {s.id}: {e}")
                
        print(f"Successfully synced {success_count}/{len(summaries)} submissions!")
    except Exception as e:
        db.rollback()
        print(f"Failed to sync: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_gamification()
