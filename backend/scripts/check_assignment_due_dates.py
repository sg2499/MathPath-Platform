#!/usr/bin/env python3
"""
READ-ONLY, one-off. Confirms whether historical CompetitionMockAssignment
rows have due_at populated at all -- explains why last_minute_hero_mocks
showed 0 tracked students after sync_badges.py (that badge family's
detection logic requires due_at + assigned_at both set).

Usage:
    python scripts/check_assignment_due_dates.py
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.getcwd())
from app.database import SessionLocal
from app.models.models import CompetitionMockAssignment

def main():
    db = SessionLocal()
    try:
        total = db.query(CompetitionMockAssignment).count()
        with_due = db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.due_at.isnot(None)).count()
        with_both = db.query(CompetitionMockAssignment).filter(
            CompetitionMockAssignment.due_at.isnot(None),
            CompetitionMockAssignment.assigned_at.isnot(None),
        ).count()
        print(f"Total CompetitionMockAssignment rows: {total}")
        print(f"Rows with due_at set: {with_due}")
        print(f"Rows with both due_at and assigned_at set: {with_both}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
