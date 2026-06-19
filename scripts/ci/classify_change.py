#!/usr/bin/env python3
"""Classify MathPath repository changes without selecting or skipping tests."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

SURFACES = {
    "frontend": ("frontend/",),
    "backend": ("backend/",),
    "ci_governance": (".github/", "scripts/ci/"),
    "delivery_console": ("tools/mathpath-delivery/",),
    "project_memory": ("docs/project-memory/",),
    "deployment_config": ("render.yaml", "vercel.json"),
}
HIGH_RISK_MARKERS = (
    "backend/app/models",
    "backend/app/generator",
    "backend/app/services/generator",
    "backend/app/auth",
    "backend/app/security",
    "frontend/components/MathQuestionDisplay",
    "frontend/components/common",
    "render.yaml",
    "vercel.json",
)


def git_changed_files(base: str, head: str, cwd: Path) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    )
    return sorted({line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()})


def classify(paths: list[str]) -> dict[str, object]:
    surfaces: dict[str, list[str]] = {key: [] for key in SURFACES}
    surfaces["other"] = []
    for path in paths:
        matched = False
        for surface, prefixes in SURFACES.items():
            if any(path == prefix or path.startswith(prefix) for prefix in prefixes):
                surfaces[surface].append(path)
                matched = True
        if not matched:
            surfaces["other"].append(path)
    active = sorted(key for key, values in surfaces.items() if values)
    high_risk = sorted(path for path in paths if any(marker in path for marker in HIGH_RISK_MARKERS))
    runtime = bool(surfaces["frontend"] or surfaces["backend"] or surfaces["deployment_config"])
    if high_risk:
        risk = "high"
    elif runtime:
        risk = "medium"
    elif paths:
        risk = "low"
    else:
        risk = "none"
    return {
        "changed_file_count": len(paths),
        "changed_files": paths,
        "active_surfaces": active,
        "surface_files": {key: value for key, value in surfaces.items() if value},
        "runtime_surface_touched": runtime,
        "high_risk_files": high_risk,
        "risk_classification": risk,
        "note": "Package 1 reports classification only; it does not skip established CI jobs.",
    }


def write_reports(result: dict[str, object], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "change-classification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    lines = [
        "## Change classification",
        "",
        f"- Changed files: {result['changed_file_count']}",
        f"- Risk classification: **{result['risk_classification']}**",
        f"- Runtime surface touched: **{str(result['runtime_surface_touched']).lower()}**",
        f"- Active surfaces: {', '.join(result['active_surfaces']) or 'none'}",
        "- Test selection: reporting only; all established CI jobs still run",
    ]
    high = result["high_risk_files"]
    if high:
        lines.extend(["", "### High-risk paths", *[f"- `{path}`" for path in high]])
    (output_dir / "change-classification.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    cwd = Path.cwd()
    result = classify(git_changed_files(args.base, args.head, cwd))
    write_reports(result, args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
