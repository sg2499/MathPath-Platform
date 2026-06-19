#!/usr/bin/env python3
"""Produce a redacted, report-only exposure audit for the MathPath repository."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

BINARY_OR_EXPORT_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".sql", ".dump", ".bak", ".xlsx", ".xls", ".csv"}
SENSITIVE_NAME_MARKERS = ("student-export", "student_export", "database-backup", "database_backup", "production-dump", "production_dump")
CONTENT_RULES = {
    "private_key_material": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "credentialed_database_url": re.compile(r"\bpostgres(?:ql)?://[^\s:@]+:[^\s@]+@", re.IGNORECASE),
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
        suffix = Path(rel).suffix.lower()
        if suffix in BINARY_OR_EXPORT_SUFFIXES and any(marker in lowered for marker in SENSITIVE_NAME_MARKERS):
            path_findings.append({"path": rel, "rule": "sensitive_export_filename"})
        path = root / rel
        if suffix in SKIP_SUFFIXES or not path.is_file() or path.stat().st_size > MAX_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            for rule, pattern in CONTENT_RULES.items():
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
