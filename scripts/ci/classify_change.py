#!/usr/bin/env python3
"""Classify MathPath repository changes and produce a conservative CI test plan."""
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

GENERATOR_MARKERS = (
    "backend/app/generator",
    "backend/app/question_engine",
    "backend/app/services/generator",
    "backend/app/services/curriculum_service",
    "backend/tests/test_generator.py",
    "backend/tests/test_mm_",
)

HIGH_RISK_MARKERS = (
    "backend/app/models",
    "backend/app/auth",
    "backend/app/api/routes_auth",
    "backend/app/core",
    "backend/app/security",
    "backend/app/permission",
    "backend/app/roles",
    "backend/app/schemas",
    "backend/app/database.py",
    "backend/app/dependencies.py",
    "backend/app/main.py",
    "backend/app/services/auth_service",
    "backend/app/seed",
    "backend/alembic",
    "backend/migrations",
    "frontend/components/MathQuestionDisplay",
    "frontend/components/common",
    "frontend/lib/api",
    "frontend/lib/auth",
    "frontend/middleware",
    "frontend/app/api",
    "frontend/app/layout",
    "render.yaml",
    "vercel.json",
)

DEPENDENCY_FILES = {
    "backend/requirements.txt",
    "backend/requirements-dev.txt",
    "frontend/package.json",
    "frontend/package-lock.json",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "pyproject.toml",
    "poetry.lock",
}

FULL_SUITE_PREFIXES = (
    ".github/",
    "scripts/ci/",
    "tools/mathpath-delivery/",
)

DOC_SUFFIXES = (".md", ".mdx", ".txt", ".rst")


def normalize_paths(paths: list[str]) -> list[str]:
    return sorted({path.strip().replace("\\", "/") for path in paths if path.strip()})


def git_changed_files(base: str, head: str, cwd: Path) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    )
    return normalize_paths(result.stdout.splitlines())


def _matches_prefix(path: str, prefixes: tuple[str, ...]) -> bool:
    return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in prefixes)


def _is_documentation(path: str) -> bool:
    if path.startswith("docs/"):
        return True
    if "/" not in path and path.lower().endswith(DOC_SUFFIXES):
        return True
    return False


def _is_dependency(path: str) -> bool:
    return path in DEPENDENCY_FILES or path.endswith("/requirements.txt") or path.endswith("/package-lock.json")


def _is_generator(path: str) -> bool:
    return any(marker in path for marker in GENERATOR_MARKERS)


def _is_high_risk(path: str) -> bool:
    return any(marker in path for marker in HIGH_RISK_MARKERS)


def _plan(mode: str, *, reason: str) -> dict[str, object]:
    plans = {
        "none": (False, False, False, False),
        "docs_only": (False, False, False, False),
        "frontend_only": (False, False, True, True),
        "backend_only": (True, False, False, False),
        "generator": (True, True, False, False),
        "full": (True, True, True, True),
    }
    backend, generator, typecheck, build = plans[mode]
    return {
        "test_plan_mode": mode,
        "test_plan_reason": reason,
        "run_backend": backend,
        "run_generator": generator,
        "run_frontend_typecheck": typecheck,
        "run_frontend_build": build,
    }


def classify(paths: list[str], *, force_full: bool = False) -> dict[str, object]:
    paths = normalize_paths(paths)
    surfaces: dict[str, list[str]] = {key: [] for key in SURFACES}
    surfaces["documentation"] = []
    surfaces["other"] = []

    for path in paths:
        matched = False
        for surface, prefixes in SURFACES.items():
            if _matches_prefix(path, prefixes):
                surfaces[surface].append(path)
                matched = True
        if _is_documentation(path):
            surfaces["documentation"].append(path)
            matched = True
        if not matched:
            surfaces["other"].append(path)

    high_risk = sorted(path for path in paths if _is_high_risk(path))
    dependencies = sorted(path for path in paths if _is_dependency(path))
    generator_files = sorted(path for path in paths if _is_generator(path))
    governance_files = sorted(path for path in paths if _matches_prefix(path, FULL_SUITE_PREFIXES))
    deployment_files = sorted(
        path for path in paths if path in {"render.yaml", "vercel.json"} or path.startswith(".vercel/")
    )

    runtime_surfaces = {
        surface
        for surface in ("frontend", "backend")
        if surfaces[surface]
    }
    unknown_files = sorted(surfaces["other"])

    full_reasons: list[str] = []
    if force_full:
        full_reasons.append("manual full validation requested")
    if governance_files:
        full_reasons.append("CI, governance, or delivery-console files changed")
    if deployment_files:
        full_reasons.append("deployment configuration changed")
    if dependencies:
        full_reasons.append("dependency definition or lock file changed")
    if high_risk:
        full_reasons.append("high-risk shared, data-model, authentication, permission, or migration path changed")
    if len(runtime_surfaces) > 1:
        full_reasons.append("frontend and backend surfaces changed together")
    if unknown_files:
        full_reasons.append("unclassified repository path changed")

    if full_reasons:
        test_plan = _plan("full", reason="; ".join(full_reasons))
    elif not paths:
        test_plan = _plan("none", reason="no changed files detected")
    elif runtime_surfaces == {"frontend"}:
        test_plan = _plan("frontend_only", reason="ordinary frontend-only change")
    elif runtime_surfaces == {"backend"} and generator_files:
        test_plan = _plan("generator", reason="backend generator or curriculum engine change")
    elif runtime_surfaces == {"backend"}:
        test_plan = _plan("backend_only", reason="ordinary backend-only change")
    elif surfaces["documentation"] and len(surfaces["documentation"]) == len(paths):
        test_plan = _plan("docs_only", reason="documentation-only change")
    else:
        test_plan = _plan("full", reason="conservative fallback for an ambiguous change set")

    active = sorted(key for key, values in surfaces.items() if values)
    runtime = bool(runtime_surfaces)
    if high_risk or test_plan["test_plan_mode"] == "full":
        risk = "high" if high_risk else "medium"
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
        "generator_files": generator_files,
        "dependency_files": dependencies,
        "high_risk_files": high_risk,
        "unknown_files": unknown_files,
        "risk_classification": risk,
        **test_plan,
        "note": "Package 2 applies conservative smart selection and defaults to the full suite for uncertainty or elevated risk.",
    }


def write_reports(result: dict[str, object], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "change-classification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    lines = [
        "## Change classification and conservative test plan",
        "",
        f"- Changed files: {result['changed_file_count']}",
        f"- Risk classification: **{result['risk_classification']}**",
        f"- Runtime surface touched: **{str(result['runtime_surface_touched']).lower()}**",
        f"- Active surfaces: {', '.join(result['active_surfaces']) or 'none'}",
        f"- Test-plan mode: **{result['test_plan_mode']}**",
        f"- Reason: {result['test_plan_reason']}",
        "",
        "| Validation | Run heavy steps |",
        "|---|---|",
        f"| Backend tests | {str(result['run_backend']).lower()} |",
        f"| Generator validation | {str(result['run_generator']).lower()} |",
        f"| Frontend typecheck | {str(result['run_frontend_typecheck']).lower()} |",
        f"| Frontend production build | {str(result['run_frontend_build']).lower()} |",
        "",
        "All protected check contexts still run. A non-required heavy suite records an explicit successful no-op result.",
    ]
    high = result["high_risk_files"]
    if high:
        lines.extend(["", "### High-risk paths", *[f"- `{path}`" for path in high]])
    unknown = result["unknown_files"]
    if unknown:
        lines.extend(["", "### Unclassified paths forcing full validation", *[f"- `{path}`" for path in unknown]])
    (output_dir / "change-classification.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_github_outputs(result: dict[str, object], output_path: Path) -> None:
    keys = (
        "test_plan_mode",
        "run_backend",
        "run_generator",
        "run_frontend_typecheck",
        "run_frontend_build",
    )
    with output_path.open("a", encoding="utf-8", newline="\n") as handle:
        for key in keys:
            value = result[key]
            if isinstance(value, bool):
                value = str(value).lower()
            handle.write(f"{key}={value}\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--github-output", type=Path)
    parser.add_argument("--force-full", action="store_true")
    args = parser.parse_args()
    cwd = Path.cwd()
    result = classify(git_changed_files(args.base, args.head, cwd), force_full=args.force_full)
    write_reports(result, args.output_dir)
    if args.github_output:
        write_github_outputs(result, args.github_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
