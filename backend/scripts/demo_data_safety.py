#!/usr/bin/env python3
"""
MathPath Phase 10.8.5 — Clean Demo Reset Tooling Finalization

Safe-by-default utility for demo database backup, preview, reset, and restore.

Important safety behavior:
- `preview` never changes data.
- `backup` never changes data.
- `reset` is blocked unless --execute and the exact reset confirmation phrase are supplied.
- `reset` always creates a fresh backup immediately before deletion.
- `restore` is blocked unless --execute and the exact restore confirmation phrase are supplied.
- Admin/core platform setup is preserved by table policy.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sqlite3
import subprocess
from pathlib import Path
from typing import Any

RESET_CONFIRMATION = "RESET_MATHPATH_DEMO_DATA"
RESTORE_CONFIRMATION = "RESTORE_MATHPATH_BACKUP"

BACKUP_ROOT = Path("backups") / "demo-safety"
AUDIT_ROOT = Path("verification-report") / "phase-10-8-5-demo-reset-finalization"

PROTECTED_TABLES = {
    "alembic_version",
    "sqlite_sequence",
}

MASTER_DATA_TABLES = {
    "modules",
    "levels",
    "lessons",
    "dps",
    "dps_sections",
    "dps_questions",
    "question_options",
    "assessment_blueprints",
    "assessment_blueprint_lessons",
    "assessment_versions",
    "assessment_version_questions",
    "assessment_questions",
    "assessment_question_options",
    "generated_question_sets",
    "generated_questions",
}

AUTH_AND_ADMIN_SAFE_TABLES = {
    "users",
    "roles",
    "permissions",
    "role_permissions",
    "schema_migrations",
}

PEOPLE_DATA_TABLES = {
    "students",
    "teachers",
    "batches",
    "student_batches",
}

TRANSACTION_DATA_TABLES = {
    "assessment_assignments",
    "assessment_attempt_answers",
    "assessment_attempts",
    "assessment_readiness_testing_overrides",
    "assessment_reattempt_approvals",
    "assessment_results",
    "assignment_reattempt_permissions",
    "assignments",
    "attempt_answers",
    "attempts",
    "audit_logs",
    "notifications",
    "parent_report_email_logs",
    "parent_report_delivery_events",
    "delivery_tracking_events",
    "delivery_tracking_records",
    "student_level_promotions",
}

TRANSACTION_KEYWORDS = (
    "assignment",
    "attempt",
    "result",
    "approval",
    "reattempt",
    "report",
    "notification",
    "email",
    "delivery",
    "override",
    "audit",
    "promotion",
)

RESET_MODES = {
    "transaction-data-only": {
        "label": "Transaction Data Only",
        "description": "Deletes attempts, assignments, approvals, reports, notifications, delivery logs, overrides, audit logs, and promotion history. Preserves students, teachers, Admin login, and learning-path master data.",
        "deletePeopleData": False,
        "deleteTransactionData": True,
        "recommendedForDemo": True,
    },
    "students-and-transaction-data": {
        "label": "Students + Transaction Data",
        "description": "Deletes student/teacher directory tables and all transaction data. Preserves Admin login and learning-path master data. User-auth rows are preserved to avoid deleting Admin accidentally.",
        "deletePeopleData": True,
        "deleteTransactionData": True,
        "recommendedForDemo": False,
    },
    "full-demo-reset": {
        "label": "Full Demo Reset",
        "description": "Deletes people-facing demo directory tables and all workflow/demo records while preserving Admin login, platform roles, modules, levels, lessons, DPS, assessment blueprints, and question master setup.",
        "deletePeopleData": True,
        "deleteTransactionData": True,
        "recommendedForDemo": False,
    },
}


def LoadEnvFile(EnvPath: Path) -> None:
    if not EnvPath.exists():
        return
    for RawLine in EnvPath.read_text(encoding="utf-8", errors="ignore").splitlines():
        Line = RawLine.strip()
        if not Line or Line.startswith("#") or "=" not in Line:
            continue
        Key, Value = Line.split("=", 1)
        os.environ.setdefault(Key.strip(), Value.strip().strip('"').strip("'"))


def ResolveDatabaseUrl() -> str:
    LoadEnvFile(Path(".env"))
    LoadEnvFile(Path("backend") / ".env")
    return os.getenv("DATABASE_URL", "sqlite:///./mathpath.db").strip()


def Timestamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def EnsureFolder(PathValue: Path) -> Path:
    PathValue.mkdir(parents=True, exist_ok=True)
    return PathValue


def WriteJson(PathValue: Path, Payload: dict[str, Any]) -> None:
    EnsureFolder(PathValue.parent)
    PathValue.write_text(json.dumps(Payload, indent=2, default=str), encoding="utf-8")


def Audit(Action: str, Payload: dict[str, Any]) -> Path:
    AuditPath = EnsureFolder(AUDIT_ROOT) / f"{Timestamp()}_{Action}.json"
    WriteJson(AuditPath, Payload)
    return AuditPath


def IsSqlite(DatabaseUrl: str) -> bool:
    return DatabaseUrl.startswith("sqlite:///") or DatabaseUrl.startswith("sqlite://")


def SqlitePath(DatabaseUrl: str) -> Path:
    if DatabaseUrl.startswith("sqlite:///"):
        RawPath = DatabaseUrl.replace("sqlite:///", "", 1)
    elif DatabaseUrl.startswith("sqlite://"):
        RawPath = DatabaseUrl.replace("sqlite://", "", 1)
    else:
        raise ValueError("DATABASE_URL is not SQLite.")
    return Path(RawPath).expanduser().resolve()


def ConnectSqlite(DatabaseUrl: str) -> sqlite3.Connection:
    DbPath = SqlitePath(DatabaseUrl)
    if not DbPath.exists():
        raise FileNotFoundError(f"SQLite database file not found: {DbPath}")
    Connection = sqlite3.connect(str(DbPath))
    Connection.row_factory = sqlite3.Row
    return Connection


def SqliteTables(Connection: sqlite3.Connection) -> list[str]:
    Rows = Connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    return [str(Row["name"]) for Row in Rows if str(Row["name"]) not in PROTECTED_TABLES]


def SqliteCount(Connection: sqlite3.Connection, TableName: str) -> int:
    try:
        Row = Connection.execute(f'SELECT COUNT(*) AS CountValue FROM "{TableName}"').fetchone()
        return int(Row["CountValue"] if Row else 0)
    except sqlite3.Error:
        return 0


def IsTransactionTable(LowerName: str) -> bool:
    if LowerName in TRANSACTION_DATA_TABLES:
        return True
    if LowerName in MASTER_DATA_TABLES or LowerName in AUTH_AND_ADMIN_SAFE_TABLES or LowerName in PEOPLE_DATA_TABLES:
        return False
    return any(Keyword in LowerName for Keyword in TRANSACTION_KEYWORDS)


def ClassifyTables(Tables: list[str], Mode: str) -> tuple[list[str], list[str]]:
    ModeConfig = RESET_MODES[Mode]
    CandidateTables: list[str] = []
    PreservedTables: list[str] = []

    for TableName in Tables:
        LowerName = TableName.lower()
        DeletePeople = bool(ModeConfig["deletePeopleData"]) and LowerName in PEOPLE_DATA_TABLES
        DeleteTransaction = bool(ModeConfig["deleteTransactionData"]) and IsTransactionTable(LowerName)
        ShouldDelete = DeletePeople or DeleteTransaction

        if LowerName in MASTER_DATA_TABLES or LowerName in AUTH_AND_ADMIN_SAFE_TABLES:
            ShouldDelete = False

        if ShouldDelete:
            CandidateTables.append(TableName)
        else:
            PreservedTables.append(TableName)

    return CandidateTables, PreservedTables


def BuildSafetyGuidance(Mode: str) -> dict[str, Any]:
    return {
        "confirmationRequiredForReset": RESET_CONFIRMATION,
        "confirmationRequiredForRestore": RESTORE_CONFIRMATION,
        "backupBeforeReset": "Mandatory. A fresh backup is created automatically before reset execution.",
        "recommendedDemoMode": "transaction-data-only",
        "selectedModeIsRecommendedForDemo": bool(RESET_MODES[Mode]["recommendedForDemo"]),
        "promotionHistoryPolicy": "Promotion history is treated as transaction/demo data and is cleared by reset modes that delete transaction data.",
        "adminAccountPolicy": "Admin/core auth tables are preserved by table policy.",
        "dryRunCommand": f"python scripts/demo_data_safety.py preview --mode {Mode}",
        "resetCommandWhenApproved": f"python scripts/demo_data_safety.py reset --mode {Mode} --execute --confirm {RESET_CONFIRMATION}",
    }


def PreviewSqlite(DatabaseUrl: str, Mode: str) -> dict[str, Any]:
    with ConnectSqlite(DatabaseUrl) as Connection:
        Tables = SqliteTables(Connection)
        CandidateTables, PreservedTables = ClassifyTables(Tables, Mode)
        CandidateCounts = {TableName: SqliteCount(Connection, TableName) for TableName in CandidateTables}
        PreservedCounts = {TableName: SqliteCount(Connection, TableName) for TableName in PreservedTables}

    return {
        "action": "preview",
        "mode": Mode,
        "modeLabel": RESET_MODES[Mode]["label"],
        "modeDescription": RESET_MODES[Mode]["description"],
        "databaseType": "sqlite",
        "candidateDeleteTables": CandidateCounts,
        "preservedTables": PreservedCounts,
        "candidateDeleteTotalRows": sum(CandidateCounts.values()),
        "destructiveActionExecuted": False,
        "safety": "Preview only. No data was changed.",
        "safetyGuidance": BuildSafetyGuidance(Mode),
    }


def BackupSqlite(DatabaseUrl: str) -> dict[str, Any]:
    SourcePath = SqlitePath(DatabaseUrl)
    BackupFolder = EnsureFolder(BACKUP_ROOT)
    Stamp = Timestamp()
    BackupPath = BackupFolder / f"mathpath_backup_{Stamp}.sqlite"
    DumpPath = BackupFolder / f"mathpath_backup_{Stamp}.sql"

    shutil.copy2(SourcePath, BackupPath)

    with sqlite3.connect(str(SourcePath)) as Connection, DumpPath.open("w", encoding="utf-8") as DumpFile:
        for Line in Connection.iterdump():
            DumpFile.write(f"{Line}\n")

    Payload = {
        "action": "backup",
        "databaseType": "sqlite",
        "source": str(SourcePath),
        "backupFile": str(BackupPath),
        "sqlDumpFile": str(DumpPath),
        "destructiveActionExecuted": False,
    }
    Audit("backup", Payload)
    return Payload


def BackupPostgres(DatabaseUrl: str) -> dict[str, Any]:
    BackupFolder = EnsureFolder(BACKUP_ROOT)
    BackupPath = BackupFolder / f"mathpath_backup_{Timestamp()}.dump"
    Command = ["pg_dump", "--format=custom", "--file", str(BackupPath), DatabaseUrl]
    Result = subprocess.run(Command, capture_output=True, text=True, check=False)
    Payload = {
        "action": "backup",
        "databaseType": "postgresql",
        "backupFile": str(BackupPath),
        "pgDumpExitCode": Result.returncode,
        "stderr": Result.stderr[-4000:],
        "destructiveActionExecuted": False,
    }
    Audit("backup", Payload)
    if Result.returncode != 0:
        raise RuntimeError("pg_dump failed. Ensure PostgreSQL client tools are installed and DATABASE_URL is valid.")
    return Payload


def PreviewPostgres(DatabaseUrl: str, Mode: str) -> dict[str, Any]:
    return {
        "action": "preview",
        "mode": Mode,
        "modeLabel": RESET_MODES[Mode]["label"],
        "modeDescription": RESET_MODES[Mode]["description"],
        "databaseType": "postgresql",
        "message": "PostgreSQL destructive preview remains blocked from automated deletion until the exact live schema/reset policy is reviewed.",
        "destructiveActionExecuted": False,
        "safetyGuidance": BuildSafetyGuidance(Mode),
    }


def DeleteSqliteCandidates(DatabaseUrl: str, Mode: str, Execute: bool, Confirmation: str) -> dict[str, Any]:
    PreviewPayload = PreviewSqlite(DatabaseUrl, Mode)
    if not Execute or Confirmation != RESET_CONFIRMATION:
        Payload = {
            **PreviewPayload,
            "action": "reset-blocked",
            "destructiveActionExecuted": False,
            "blockedReason": f"Reset requires --execute --confirm {RESET_CONFIRMATION}",
        }
        Audit("reset_blocked", Payload)
        return Payload

    BackupPayload = BackupSqlite(DatabaseUrl)
    CandidateTables = list(PreviewPayload["candidateDeleteTables"].keys())
    DeletedCounts: dict[str, int] = {}

    with ConnectSqlite(DatabaseUrl) as Connection:
        Connection.execute("PRAGMA foreign_keys = OFF")
        try:
            for TableName in reversed(CandidateTables):
                BeforeCount = SqliteCount(Connection, TableName)
                Connection.execute(f'DELETE FROM "{TableName}"')
                DeletedCounts[TableName] = BeforeCount
            Connection.commit()
        except Exception:
            Connection.rollback()
            raise
        finally:
            Connection.execute("PRAGMA foreign_keys = ON")

    Payload = {
        "action": "reset-executed",
        "mode": Mode,
        "modeLabel": RESET_MODES[Mode]["label"],
        "databaseType": "sqlite",
        "backupCreatedBeforeReset": BackupPayload,
        "deletedTables": DeletedCounts,
        "deletedTotalRows": sum(DeletedCounts.values()),
        "destructiveActionExecuted": True,
        "safetyGuidance": BuildSafetyGuidance(Mode),
    }
    Audit("reset_executed", Payload)
    return Payload


def RestoreSqlite(DatabaseUrl: str, BackupFile: str | None, Execute: bool, Confirmation: str) -> dict[str, Any]:
    if not BackupFile:
        raise ValueError("Restore requires --backup-file path/to/backup.sqlite")
    TargetPath = SqlitePath(DatabaseUrl)
    SourcePath = Path(BackupFile).expanduser().resolve()
    if not SourcePath.exists():
        raise FileNotFoundError(f"Backup file not found: {SourcePath}")
    if not Execute or Confirmation != RESTORE_CONFIRMATION:
        Payload = {
            "action": "restore-blocked",
            "target": str(TargetPath),
            "backupFile": str(SourcePath),
            "destructiveActionExecuted": False,
            "blockedReason": f"Restore requires --execute --confirm {RESTORE_CONFIRMATION}",
        }
        Audit("restore_blocked", Payload)
        return Payload

    SafetyBackup = BackupSqlite(DatabaseUrl)
    shutil.copy2(SourcePath, TargetPath)
    Payload = {
        "action": "restore-executed",
        "target": str(TargetPath),
        "restoredFrom": str(SourcePath),
        "safetyBackupBeforeRestore": SafetyBackup,
        "destructiveActionExecuted": True,
    }
    Audit("restore_executed", Payload)
    return Payload


def PrintPayload(Payload: dict[str, Any]) -> None:
    print(json.dumps(Payload, indent=2, default=str))


def Main() -> int:
    Parser = argparse.ArgumentParser(description="MathPath demo data backup/reset safety utility")
    Parser.add_argument("action", choices=["preview", "backup", "reset", "restore"], help="Action to perform")
    Parser.add_argument("--mode", choices=sorted(RESET_MODES.keys()), default="transaction-data-only", help="Reset/preview mode")
    Parser.add_argument("--execute", action="store_true", help="Required for destructive actions")
    Parser.add_argument("--confirm", default="", help="Exact confirmation phrase required for destructive actions")
    Parser.add_argument("--backup-file", default=None, help="Backup file to restore from")
    Parser.add_argument("--database-url", default=None, help="Override DATABASE_URL for this run")
    Args = Parser.parse_args()

    DatabaseUrl = Args.database_url or ResolveDatabaseUrl()

    try:
        if Args.action == "backup":
            Payload = BackupSqlite(DatabaseUrl) if IsSqlite(DatabaseUrl) else BackupPostgres(DatabaseUrl)
        elif Args.action == "preview":
            Payload = PreviewSqlite(DatabaseUrl, Args.mode) if IsSqlite(DatabaseUrl) else PreviewPostgres(DatabaseUrl, Args.mode)
            Audit("preview", Payload)
        elif Args.action == "reset":
            if not IsSqlite(DatabaseUrl):
                Payload = {
                    "action": "reset-blocked",
                    "databaseType": "postgresql",
                    "destructiveActionExecuted": False,
                    "blockedReason": "PostgreSQL reset is blocked in this utility until the exact production schema and reset policy are reviewed.",
                }
                Audit("reset_blocked", Payload)
            else:
                Payload = DeleteSqliteCandidates(DatabaseUrl, Args.mode, Args.execute, Args.confirm)
        else:
            if not IsSqlite(DatabaseUrl):
                Payload = {
                    "action": "restore-blocked",
                    "databaseType": "postgresql",
                    "destructiveActionExecuted": False,
                    "blockedReason": "Use pg_restore manually for PostgreSQL backups after explicit approval.",
                }
                Audit("restore_blocked", Payload)
            else:
                Payload = RestoreSqlite(DatabaseUrl, Args.backup_file, Args.execute, Args.confirm)

        PrintPayload(Payload)
        return 0
    except Exception as Error:
        Payload = {
            "action": Args.action,
            "status": "ERROR",
            "message": str(Error),
            "destructiveActionExecuted": False,
        }
        Audit("error", Payload)
        PrintPayload(Payload)
        return 1


if __name__ == "__main__":
    raise SystemExit(Main())
