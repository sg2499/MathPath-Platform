#!/usr/bin/env python3
"""Report MathPath deployment configuration drift without modifying configuration."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

EXPECTED = {
    "healthCheckPath": "/api/health",
    "SEED_ON_STARTUP": "false",
    "TEMPORARY_ASSESSMENT_READINESS_BYPASS": "true",
}


def extract_render_values(text: str) -> dict[str, str | None]:
    values: dict[str, str | None] = {key: None for key in EXPECTED}
    health = re.search(r"(?m)^\s*healthCheckPath:\s*['\"]?([^'\"\s]+)", text)
    if health:
        values["healthCheckPath"] = health.group(1)
    for key in ("SEED_ON_STARTUP", "TEMPORARY_ASSESSMENT_READINESS_BYPASS"):
        pattern = rf"(?ms)^\s*-\s*key:\s*{re.escape(key)}\s*$.*?^\s*value:\s*['\"]?([^'\"\s]+)"
        match = re.search(pattern, text)
        if match:
            values[key] = match.group(1).lower()
    return values


def audit(render_file: Path) -> dict[str, object]:
    if not render_file.exists():
        return {"status": "missing", "file": str(render_file), "drift": [{"key": "render.yaml", "expected": "present", "actual": "missing"}]}
    actual = extract_render_values(render_file.read_text(encoding="utf-8"))
    drift = [
        {"key": key, "expected": expected, "actual": actual.get(key)}
        for key, expected in EXPECTED.items()
        if actual.get(key) != expected
    ]
    return {
        "status": "review_required" if drift else "aligned",
        "file": str(render_file),
        "expected_operating_assumptions": EXPECTED,
        "actual_committed_values": actual,
        "drift": drift,
        "enforcement": "report_only",
        "note": "Live Render dashboard overrides may differ. Package 1 never changes render.yaml or production environment variables.",
    }


def write_reports(result: dict[str, object], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "config-drift.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    lines = [
        "## Deployment configuration drift",
        "",
        f"- Status: **{result['status']}**",
        "- Enforcement: report-only",
        "- Production configuration changed by this workflow: **no**",
    ]
    drift = result.get("drift", [])
    if drift:
        lines.extend(["", "### Review items"])
        for item in drift:
            lines.append(f"- `{item['key']}`: committed `{item['actual']}`, expected operating assumption `{item['expected']}`")
    else:
        lines.append("- No committed configuration drift detected.")
    lines.extend(["", "> Live hosting-dashboard overrides must be audited separately before any correction is proposed."])
    (output_dir / "config-drift.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-file", type=Path, default=Path("render.yaml"))
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.render_file)
    write_reports(result, args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
