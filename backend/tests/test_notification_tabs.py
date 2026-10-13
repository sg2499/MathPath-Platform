"""Notification tabs, counts, search, dates and paging (2026-10-13)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Notification, User
from app.services import notification_tabs as tabs
from app.services.notification_service import ListNotifications, MarkAllNotificationsRead, NotificationTabCounts

T0 = datetime(2026, 10, 10, 6, 0, tzinfo=timezone.utc)

SAMPLES = [
    # (category, type, expected tab)
    ("ANNUAL_COMPETITION_PRACTICE", "ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT", tabs.TAB_ANNUAL),
    ("ANNUAL_COMPETITION_PRACTICE", "ANNUAL_PRACTICE_ASSIGNED_BY_ADMIN", tabs.TAB_ANNUAL),
    ("LEADERBOARD", "TEACHER_DPS_LEADERBOARD_PODIUM", tabs.TAB_ACHIEVEMENTS),
    ("LEADERBOARD", "TEACHER_MOCK_LEADERBOARD_PODIUM", tabs.TAB_ACHIEVEMENTS),
    ("PRACTICE", "DPS_CLEARED", tabs.TAB_DPS),
    ("PRACTICE", "DPS_NEEDS_REATTEMPT", tabs.TAB_DPS),
    ("PRACTICE", "DPS_REATTEMPT_ASSIGNED_BY_TEACHER", tabs.TAB_DPS),
    ("PRACTICE", "DPS_REATTEMPT_APPROVAL_NEEDED", tabs.TAB_DPS),
    ("PRACTICE", "LESSON_CLEARED", tabs.TAB_DPS),
    ("REATTEMPT", "DPS_FRESH_PRACTICE_ASSIGNED", tabs.TAB_DPS),
    ("REATTEMPT", "STUDENT_ASSESSMENT_NEEDS_REATTEMPT", tabs.TAB_ASSESSMENTS),
    ("COMPETITION_MOCK", "STUDENT_MOCK_ASSIGNED", tabs.TAB_ASSESSMENTS),
    ("COMPETITION_MOCK", "STUDENT_MOCK_SUBMITTED", tabs.TAB_ASSESSMENTS),
    ("RESULT", "STUDENT_ASSESSMENT_CLEARED", tabs.TAB_ASSESSMENTS),
    ("ASSESSMENT_FEEDBACK", "ASSESSMENT_FEEDBACK_SAVED", tabs.TAB_ASSESSMENTS),
    ("PROMOTION", "STUDENT_PROMOTED", tabs.TAB_ACHIEVEMENTS),
    ("XP_RANK", "STUDENT_XP_RANK_TIER_UP", tabs.TAB_ACHIEVEMENTS),
    ("GAMIFICATION", "BADGE_UNLOCKED", tabs.TAB_ACHIEVEMENTS),
    ("PARENT_REPORT", "PARENT_REPORT_FAILED", tabs.TAB_ACCOUNT),
    ("FEES", "FEES_INVOICE_RAISED", tabs.TAB_ACCOUNT),
    ("SYSTEM", "SOMETHING_NEW", tabs.TAB_OTHER),
]


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    session.add(User(id="admin", full_name="Admin", email="a@x.test", password_hash="x", role="ADMIN", is_active=True))
    session.add(User(id="other", full_name="Other", email="o@x.test", password_hash="x", role="ADMIN", is_active=True))
    session.commit()
    yield session
    session.close()


def _seed(db, user="admin"):
    for index, (category, type_, _tab) in enumerate(SAMPLES):
        db.add(Notification(
            id=f"{user}-{index}", recipient_user_id=user, recipient_role="ADMIN", category=category, type=type_,
            title=f"Item {index} {type_}", message=f"Message about {type_.lower()}", is_read=index % 3 == 0,
            created_at=T0 + timedelta(hours=index),
        ))
    db.commit()


@pytest.mark.parametrize("category,type_,expected", SAMPLES)
def test_every_known_notification_lands_in_one_tab(category, type_, expected):
    assert tabs.TabFor(category, type_) == expected


def test_sql_and_python_rules_agree_and_counts_add_up(db):
    _seed(db)
    _seed(db, "other")  # someone else's notifications never count
    counts = NotificationTabCounts(db, recipient_user_id="admin", role="ADMIN")
    expected: dict[str, list[int]] = {}
    for index, (_c, _t, tab) in enumerate(SAMPLES):
        expected.setdefault(tab, [0, 0])
        expected[tab][0] += 1
        expected[tab][1] += 0 if index % 3 == 0 else 1
    for tab, (total, unread) in expected.items():
        assert counts[tab] == {"total": total, "unread": unread}
    assert counts[tabs.TAB_ALL]["total"] == len(SAMPLES)
    assert counts[tabs.TAB_ALL]["unread"] == sum(1 for index in range(len(SAMPLES)) if index % 3)
    # Admin's Needs Action: the approval and the failed parent report.
    assert counts[tabs.TAB_ACTION]["total"] == 2
    for tab in tabs.CONTENT_TABS:
        listed = ListNotifications(db, recipient_user_id="admin", role="ADMIN", tab=tab, limit=100)
        assert listed["total"] == counts.get(tab, {"total": 0})["total"]
        assert all(item["tab"] == tab for item in listed["items"])


def test_paging_reaches_every_notification(db):
    _seed(db)
    seen = []
    offset = 0
    while True:
        page = ListNotifications(db, recipient_user_id="admin", role="ADMIN", limit=5, offset=offset)
        seen += [item["id"] for item in page["items"]]
        if not page["hasMore"]:
            break
        offset += 5
    assert len(seen) == len(set(seen)) == len(SAMPLES)


def test_search_dates_unread_and_mark_one_tab_read(db):
    _seed(db)
    found = ListNotifications(db, recipient_user_id="admin", role="ADMIN", search="podium")
    assert found["total"] == 2
    one_day = ListNotifications(db, recipient_user_id="admin", role="ADMIN", date_from="2026-10-10", date_to="2026-10-10", limit=100)
    # 06:00 UTC + 0..17 h is 11:30 IST on the 10th up to 23:30 IST.
    assert one_day["total"] == 13
    tabbed = ListNotifications(db, recipient_user_id="admin", role="ADMIN", tab=tabs.TAB_DPS, unread_only=True)
    assert tabbed["total"] > 0
    changed = MarkAllNotificationsRead(db, recipient_user_id="admin", role="ADMIN", tab=tabs.TAB_DPS)
    db.commit()
    assert changed == tabbed["total"]
    counts = NotificationTabCounts(db, recipient_user_id="admin", role="ADMIN")
    assert counts[tabs.TAB_DPS]["unread"] == 0
    assert counts[tabs.TAB_ANNUAL]["unread"] > 0


def test_tab_list_per_role_hides_empty_tabs():
    counts = {tabs.TAB_ALL: {"total": 3, "unread": 1}, tabs.TAB_ACTION: {"total": 0, "unread": 0}, tabs.TAB_ANNUAL: {"total": 3, "unread": 1}}
    keys = [tab["key"] for tab in tabs.TabList("TEACHER", counts)]
    assert keys == ["ALL", "ACTION", "DPS", "ANNUAL"]
    student = {tab["key"]: tab["label"] for tab in tabs.TabList("STUDENT", {**counts, tabs.TAB_ACCOUNT: {"total": 1, "unread": 1}})}
    assert student["ACCOUNT"] == "Fees"
