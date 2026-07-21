#!/usr/bin/env python3
"""Produce a redacted, report-only exposure audit for the MathPath repository."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

BINARY_OR_EXPORT_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".sql", ".dump", ".bak", ".xlsx", ".xls", ".csv"}
# Any of these suffixes tracked in git at all is a finding on its own -- a raw
# database file has no legitimate reason to be committed, named "backup" or
# not. (Added 2026-07-21 security audit: backend/mathpath.db.pre_im_l3_backup
# was tracked in git and matched none of the name markers below, since it
# doesn't contain "database-backup"/"database_backup" as a literal substring
# -- that gap is exactly why it went unnoticed by this tool.)
# Deliberately excludes .sql -- schema/seed .sql files under db/ are
# legitimate, intentional source control (see README's directory layout),
# unlike a raw binary database dump, which never belongs in git regardless
# of filename.
ALWAYS_FLAG_DATABASE_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".dump"}
SENSITIVE_NAME_MARKERS = ("student-export", "student_export", "database-backup", "database_backup", "production-dump", "production_dump", "backup")
CONTENT_RULES = {
    "private_key_material": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "credentialed_database_url": re.compile(r"\bpostgres(?:ql)?://[^\s:@]+:[^\s@]+@", re.IGNORECASE),
    # Added 2026-07-21 security audit: catches the exact shape of the leaks
    # this tool previously missed. Deliberately requires an actual quoted
    # string literal (not a bare type name or function call) so this doesn't
    # false-positive on ordinary code like `password: string` or
    # `Password: RequireEnvPassword(...)`.
    "hardcoded_password_literal": re.compile(
        r"(?i)\bpassword\b\s*[:=]\s*[\"'](?!<)[A-Za-z0-9!@#$%^&*()_+=-]{6,}[\"']"
    ),
}
# Same intent as hardcoded_password_literal above, but scoped to plain-text
# docs, where a real credential leak looks like unquoted "password: Admin@123"
# rather than a quoted code literal. Restricted to these extensions so it
# never runs against source files, where a bare identifier/type name after
# "password:" (e.g. `password: string`) would otherwise false-positive.
DOC_PASSWORD_VALUE_SUFFIXES = {".md", ".txt"}
DOC_CONTENT_RULES = {
    "plaintext_password_in_docs": re.compile(r"(?i)^\s*password\s*:\s*(?!<)\S{6,}\s*$"),
}
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2"}
MAX_BYTES = 2_000_000


def tracked_files(root: Path) -> list[str]:
    result = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True)
    return sorted(part.decode("utf-8", errors="replace") for part in result.stdout.split(b"\0") if part)


def audit(root: Path, visibility: str) -> dict[str, object]:
    files = tracked_files(root)
    path_findings: list[dict[str, object]] = []
    content_findings: list[dict[str, object]] = []
    for rel in files:
        lowered = rel.lower()
        rel_path_obj = Path(rel)
        suffix = rel_path_obj.suffix.lower()
        # Use every dot-segment, not just the final suffix -- a real file
        # this audit missed (mathpath.db.pre_im_l3_backup) has ".db" as a
        # middle segment, not the last one, so Path.suffix alone (".pre_im_l3_backup")
        # would silently miss it again.
        all_suffixes = {part.lower() for part in rel_path_obj.suffixes}
        if all_suffixes & ALWAYS_FLAG_DATABASE_SUFFIXES:
            path_findings.append({"path": rel, "rule": "tracked_database_file"})
        elif suffix in BINARY_OR_EXPORT_SUFFIXES and any(marker in lowered for marker in SENSITIVE_NAME_MARKERS):
            path_findings.append({"path": rel, "rule": "sensitive_export_filename"})
        path = root / rel
        if suffix in SKIP_SUFFIXES or not path.is_file() or path.stat().st_size > MAX_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        applicable_rules = dict(CONTENT_RULES)
        if suffix in DOC_PASSWORD_VALUE_SUFFIXES:
            applicable_rules.update(DOC_CONTENT_RULES)
        for line_number, line in enumerate(text.splitlines(), start=1):
            for rule, pattern in applicable_rules.items():
                if pattern.search(line):
                    content_findings.append({"path": rel, "line": line_number, "rule": rule})
    return {
        "repository_visibility": visibility or "unknown",
        "tracked_file_count": len(files),
        "high_confidence_path_findings": path_findings,
        "high_confidence_content_findings": content_findings,
        "finding_count": len(path_findings) + len(content_findings),
        "enforcement": "report_only",
        "redaction": "No matched secret value or source line is included in this report.",
    }


def write_reports(result: dict[str, object], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "repository-exposure-audit.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    lines = [
        "## Repository exposure audit",
        "",
        f"- Repository visibility: **{result['repository_visibility']}**",
        f"- Tracked files scanned: {result['tracked_file_count']}",
        f"- High-confidence findings: **{result['finding_count']}**",
        "- Enforcement: report-only in Package 1",
        "- Secret values printed: **no**",
    ]
    findings = list(result["high_confidence_path_findings"]) + list(result["high_confidence_content_findings"])
    if findings:
        lines.extend(["", "### Redacted findings"])
        for item in findings:
            location = f"{item['path']}:{item['line']}" if "line" in item else item["path"]
            lines.append(f"- `{location}` — `{item['rule']}`")
    else:
        lines.append("- No high-confidence exposure pattern was detected.")
    (output_dir / "repository-exposure-audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", type=Path, default=Path("."))
    parser.add_argument("--visibility", default="unknown")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.repository_root.resolve(), args.visibility)
    write_reports(result, args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
