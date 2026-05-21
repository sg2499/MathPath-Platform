# MathPath Phase 10.8.5 — Clean Demo Reset Tooling Finalization

This utility prepares controlled demo backup/reset operations. It does not reset data unless the reset command is executed with the exact confirmation phrase.

## Safe preview

```powershell
python scripts/demo_data_safety.py preview
```

Preview is read-only and shows:
- selected reset mode
- tables that would be deleted
- preserved tables
- total candidate rows
- exact reset command required later

## Backup

```powershell
python scripts/demo_data_safety.py backup
```

Backup creates:
- a timestamped `.sqlite` copy
- a timestamped `.sql` dump

## Reset modes

### transaction-data-only
Recommended demo mode.

Clears:
- assignments
- attempts
- answers
- assessment results
- re-attempt approvals/permissions
- reports/email/delivery logs
- notifications
- audit logs
- testing overrides
- promotion history

Preserves:
- Admin/core auth tables
- students
- teachers
- batches
- modules
- levels
- lessons
- DPS master setup
- assessment blueprints/questions/version master setup

### students-and-transaction-data
Clears student/teacher directory tables plus transaction/demo data. User-auth rows are preserved by default to avoid deleting Admin accidentally.

### full-demo-reset
Clears people-facing demo directory tables and all workflow/demo records while preserving Admin login, roles, learning-path master data, DPS master data, and assessment blueprint/question setup.

## Promotion history decision

Promotion history is treated as transaction/demo data. It is included in reset modes that delete transaction data so a client demo can start from a clean progression state.

## Reset command — only when explicitly approved

```powershell
python scripts/demo_data_safety.py reset --mode transaction-data-only --execute --confirm RESET_MATHPATH_DEMO_DATA
```

A backup is created automatically before the reset executes.

## Restore command — only when explicitly approved

```powershell
python scripts/demo_data_safety.py restore --backup-file backups/demo-safety/mathpath_backup_YYYYMMDD_HHMMSS.sqlite --execute --confirm RESTORE_MATHPATH_BACKUP
```

A safety backup of the current database is created automatically before restore.

## Audit logs

Each preview, backup, blocked reset, executed reset, blocked restore, executed restore, or error writes a JSON audit file under:

```text
verification-report/phase-10-8-5-demo-reset-finalization
```
