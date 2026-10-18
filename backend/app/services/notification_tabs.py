"""Notification tabs (2026-10-13).

Shailesh: the bell showed only the latest 20 in one long list, with more
than 99 unread that could not be reached. Every notification now belongs to
one tab, worked out from its category and type -- in SQL, so existing
notifications are sorted too and every count comes straight from the
database:

  DPS             DPS practice, re-attempts, lesson progress
  ASSESSMENTS     Mock exams, level assessments, results, feedback
  ANNUAL          Annual Competition practice and the official event
  ACHIEVEMENTS    leaderboards, podiums, XP ranks, badges, promotions, rewards
  ACCOUNT         fees and parent reports
  OTHER           anything else (shown only when there is something)

"Needs Action" is a view across the tabs: the notifications this person is
expected to act on (an approval to give, a sheet to start, a fee due).
"""

from __future__ import annotations

from sqlalchemy import case, func, literal, or_

from app.models import Notification

TAB_DPS = "DPS"
TAB_ASSESSMENTS = "ASSESSMENTS"
TAB_ANNUAL = "ANNUAL"
TAB_ACHIEVEMENTS = "ACHIEVEMENTS"
TAB_ACCOUNT = "ACCOUNT"
TAB_OTHER = "OTHER"
TAB_ACTION = "ACTION"
TAB_ALL = "ALL"

CONTENT_TABS = [TAB_DPS, TAB_ASSESSMENTS, TAB_ANNUAL, TAB_ACHIEVEMENTS, TAB_ACCOUNT, TAB_OTHER]

TAB_LABELS = {
    "ADMIN": {TAB_DPS: "DPS Practice", TAB_ASSESSMENTS: "Mock & Assessments", TAB_ANNUAL: "Annual Competition", TAB_ACHIEVEMENTS: "Leaderboards & Achievements", TAB_ACCOUNT: "Reports & Fees", TAB_OTHER: "Other"},
    "TEACHER": {TAB_DPS: "DPS Practice", TAB_ASSESSMENTS: "Mock & Assessments", TAB_ANNUAL: "Annual Competition", TAB_ACHIEVEMENTS: "Leaderboards & Achievements", TAB_ACCOUNT: "Reports", TAB_OTHER: "Other"},
    "STUDENT": {TAB_DPS: "DPS Practice", TAB_ASSESSMENTS: "Mock & Assessments", TAB_ANNUAL: "Annual Competition", TAB_ACHIEVEMENTS: "Achievements & Leaderboards", TAB_ACCOUNT: "Fees", TAB_OTHER: "Other"},
}

# Notification types each role is expected to act on.
ACTION_TYPES = {
    "ADMIN": ["DPS_REATTEMPT_APPROVAL_NEEDED", "ASSESSMENT_REATTEMPT_REQUEST_CREATED", "PARENT_REPORT_FAILED", "REWARD_TO_PREPARE"],
    "TEACHER": ["DPS_REATTEMPT_APPROVAL_NEEDED", "ASSESSMENT_REATTEMPT_REQUEST_CREATED", "STUDENT_ASSESSMENT_NEEDS_REATTEMPT"],
    "STUDENT": [
        "DPS_ASSIGNED", "DPS_ASSIGNED_BULK", "DPS_REATTEMPT_ASSIGNED", "DPS_FRESH_PRACTICE_ASSIGNED", "DPS_UNLOCKED",
        "MOCK_ASSIGNED", "STUDENT_MOCK_ASSIGNED", "ASSESSMENT_ASSIGNED", "ASSESSMENT_REATTEMPT_ASSIGNED", "ASSESSMENT_REATTEMPT_APPROVED",
        "ANNUAL_PRACTICE_ASSIGNED", "FEES_INVOICE_RAISED", "FEES_REMINDER", "FEES_ONLINE_FAILED",
        # 2026-10-18 (Rewards): go and collect it; you can now unlock your goal
        "REWARD_READY", "REWARD_GOAL_REACHED",
    ],
}


def RoleKey(Role: str | None) -> str:
    Value = str(Role or "").upper()
    if Value in ("ADMIN", "SUPER_ADMIN"):
        return "ADMIN"
    if Value == "TEACHER":
        return "TEACHER"
    return "STUDENT"


def TabExpression():
    """SQL CASE giving each notification's tab (checked in this order)."""
    T = func.upper(func.coalesce(Notification.type, ""))
    C = func.upper(func.coalesce(Notification.category, ""))
    return case(
        (or_(C.like("ANNUAL_COMPETITION%"), T.like("%ANNUAL%")), literal(TAB_ANNUAL)),
        (or_(C.in_(["FEES", "PARENT_REPORT"]), T.like("FEES%"), T.like("%PARENT_REPORT%")), literal(TAB_ACCOUNT)),
        (
            or_(
                C.in_(["LEADERBOARD", "GAMIFICATION", "XP_RANK", "PROMOTION", "REWARD"]),
                T.like("%PODIUM%"), T.like("%BADGE%"), T.like("%XP_RANK%"), T.like("%PROMOTED%"), T.like("%LEADERBOARD%"),
            ),
            literal(TAB_ACHIEVEMENTS),
        ),
        (or_(T.like("%ASSESSMENT%"), T.like("%MOCK%"), C.in_(["COMPETITION_MOCK", "ASSESSMENT", "ASSESSMENT_FEEDBACK", "RESULT"])), literal(TAB_ASSESSMENTS)),
        (or_(C.in_(["PRACTICE", "REATTEMPT"]), T.like("%DPS%"), T.like("%LESSON%"), T.like("%PRACTICE%")), literal(TAB_DPS)),
        else_=literal(TAB_OTHER),
    )


def TabFor(Category: str | None, Type: str | None) -> str:
    """The same rule in Python (for payloads and tests)."""
    T = str(Type or "").upper()
    C = str(Category or "").upper()
    if C.startswith("ANNUAL_COMPETITION") or "ANNUAL" in T:
        return TAB_ANNUAL
    if C in ("FEES", "PARENT_REPORT") or T.startswith("FEES") or "PARENT_REPORT" in T:
        return TAB_ACCOUNT
    if C in ("LEADERBOARD", "GAMIFICATION", "XP_RANK", "PROMOTION", "REWARD") or any(Key in T for Key in ("PODIUM", "BADGE", "XP_RANK", "PROMOTED", "LEADERBOARD")):
        return TAB_ACHIEVEMENTS
    if "ASSESSMENT" in T or "MOCK" in T or C in ("COMPETITION_MOCK", "ASSESSMENT", "ASSESSMENT_FEEDBACK", "RESULT"):
        return TAB_ASSESSMENTS
    if C in ("PRACTICE", "REATTEMPT") or any(Key in T for Key in ("DPS", "LESSON", "PRACTICE")):
        return TAB_DPS
    return TAB_OTHER


def ActionCondition(Role: str | None):
    Types = ACTION_TYPES[RoleKey(Role)]
    return func.upper(func.coalesce(Notification.type, "")).in_(Types)


def IsActionType(Role: str | None, Type: str | None) -> bool:
    return str(Type or "").upper() in ACTION_TYPES[RoleKey(Role)]


def TabCondition(Tab: str | None, Role: str | None):
    Value = str(Tab or TAB_ALL).upper()
    if Value == TAB_ALL:
        return None
    if Value == TAB_ACTION:
        return ActionCondition(Role)
    if Value in CONTENT_TABS:
        return TabExpression() == Value
    return None


def TabList(Role: str | None, Counts: dict[str, dict[str, int]]) -> list[dict]:
    """Tabs to show, in order, with their counts. Content tabs with nothing
    in them are left out (and Other unless it has something)."""
    Key = RoleKey(Role)
    Labels = TAB_LABELS[Key]
    Out = [
        {"key": TAB_ALL, "label": "All", **Counts.get(TAB_ALL, {"total": 0, "unread": 0})},
        {"key": TAB_ACTION, "label": "Needs Action", **Counts.get(TAB_ACTION, {"total": 0, "unread": 0})},
    ]
    for Tab in CONTENT_TABS:
        Value = Counts.get(Tab, {"total": 0, "unread": 0})
        if Value["total"] or (Tab == TAB_DPS):
            Out.append({"key": Tab, "label": Labels[Tab], **Value})
    return Out


__all__ = [
    "ACTION_TYPES", "CONTENT_TABS", "IsActionType", "RoleKey", "TAB_ACTION", "TAB_ALL", "TabCondition", "TabExpression", "TabFor", "TabList",
]
