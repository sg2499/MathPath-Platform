from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.module = load("classify_change")

    def assert_plan(self, paths, mode, backend, generator, typecheck, build):
        result = self.module.classify(paths)
        self.assertEqual(result["test_plan_mode"], mode)
        self.assertEqual(result["run_backend"], backend)
        self.assertEqual(result["run_generator"], generator)
        self.assertEqual(result["run_frontend_typecheck"], typecheck)
        self.assertEqual(result["run_frontend_build"], build)
        return result

    def test_no_changes_selects_no_heavy_suites(self):
        self.assert_plan([], "none", False, False, False, False)

    def test_documentation_only_selects_no_heavy_suites(self):
        result = self.assert_plan(
            ["docs/project-memory/ENGINEERING_OPERATING_SYSTEM.md", "README.md"],
            "docs_only",
            False,
            False,
            False,
            False,
        )
        self.assertFalse(result["runtime_surface_touched"])
        self.assertEqual(result["risk_classification"], "low")

    def test_frontend_only_selects_frontend_validation(self):
        self.assert_plan(
            ["frontend/app/student/page.tsx", "docs/student-flow.md"],
            "frontend_only",
            False,
            False,
            True,
            True,
        )

    def test_backend_only_selects_backend_tests(self):
        self.assert_plan(
            ["backend/app/routers/reports.py", "backend/tests/test_reports.py"],
            "backend_only",
            True,
            False,
            False,
            False,
        )

    def test_generator_change_selects_backend_and_generator_validation(self):
        self.assert_plan(
            ["backend/app/question_engine/mm/generator.py", "backend/tests/test_mm_visual_curriculum_mapping.py"],
            "generator",
            True,
            True,
            False,
            False,
        )

    def test_ci_change_forces_full_suite(self):
        result = self.assert_plan(
            [".github/workflows/mathpath-ci.yml", "scripts/ci/classify_change.py"],
            "full",
            True,
            True,
            True,
            True,
        )
        self.assertIn("CI, governance", result["test_plan_reason"])

    def test_delivery_console_change_forces_full_suite(self):
        self.assert_plan(
            ["tools/mathpath-delivery/Ship-MathPathChange.ps1"],
            "full",
            True,
            True,
            True,
            True,
        )

    def test_dependency_change_forces_full_suite(self):
        result = self.assert_plan(
            ["frontend/package-lock.json"],
            "full",
            True,
            True,
            True,
            True,
        )
        self.assertEqual(result["dependency_files"], ["frontend/package-lock.json"])

    def test_deployment_change_forces_full_suite(self):
        self.assert_plan(["render.yaml"], "full", True, True, True, True)

    def test_backend_auth_change_forces_full_suite(self):
        result = self.assert_plan(
            ["backend/app/auth/service.py"],
            "full",
            True,
            True,
            True,
            True,
        )
        self.assertEqual(result["risk_classification"], "high")

    def test_cross_cutting_backend_core_change_forces_full_suite(self):
        self.assert_plan(
            ["backend/app/core/config.py"],
            "full",
            True,
            True,
            True,
            True,
        )

    def test_curriculum_service_selects_generator_validation(self):
        self.assert_plan(
            ["backend/app/services/curriculum_service.py"],
            "generator",
            True,
            True,
            False,
            False,
        )

    def test_shared_frontend_api_change_forces_full_suite(self):
        self.assert_plan(
            ["frontend/lib/api/student.ts"],
            "full",
            True,
            True,
            True,
            True,
        )

    def test_backend_model_change_forces_full_suite(self):
        result = self.assert_plan(
            ["backend/app/models/student.py"],
            "full",
            True,
            True,
            True,
            True,
        )
        self.assertTrue(result["runtime_surface_touched"])
        self.assertEqual(result["risk_classification"], "high")

    def test_shared_frontend_component_forces_full_suite(self):
        self.assert_plan(
            ["frontend/components/common/DataTable.tsx"],
            "full",
            True,
            True,
            True,
            True,
        )

    def test_mixed_frontend_backend_change_forces_full_suite(self):
        self.assert_plan(
            ["frontend/app/student/page.tsx", "backend/app/routers/student.py"],
            "full",
            True,
            True,
            True,
            True,
        )

    def test_unknown_path_forces_full_suite(self):
        result = self.assert_plan(
            ["infrastructure/custom-tool.yaml"],
            "full",
            True,
            True,
            True,
            True,
        )
        self.assertEqual(result["unknown_files"], ["infrastructure/custom-tool.yaml"])

    def test_force_full_overrides_documentation_plan(self):
        result = self.module.classify(["docs/notes.md"], force_full=True)
        self.assertEqual(result["test_plan_mode"], "full")
        self.assertTrue(result["run_backend"])
        self.assertTrue(result["run_generator"])
        self.assertTrue(result["run_frontend_typecheck"])
        self.assertTrue(result["run_frontend_build"])

    def test_github_outputs_use_lowercase_booleans(self):
        result = self.module.classify(["backend/app/routers/reports.py"])
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "github-output.txt"
            self.module.write_github_outputs(result, output)
            values = dict(line.split("=", 1) for line in output.read_text(encoding="utf-8").splitlines())
        self.assertEqual(values["test_plan_mode"], "backend_only")
        self.assertEqual(values["run_backend"], "true")
        self.assertEqual(values["run_generator"], "false")
        self.assertEqual(values["run_frontend_typecheck"], "false")
        self.assertEqual(values["run_frontend_build"], "false")


class DriftTests(unittest.TestCase):
    def test_known_drift_is_reported_without_enforcement(self):
        module = load("check_config_drift")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "render.yaml"
            path.write_text(
                "healthCheckPath: /api/health\n"
                "      - key: SEED_ON_STARTUP\n        value: \"true\"\n"
                "      - key: TEMPORARY_ASSESSMENT_READINESS_BYPASS\n        value: \"false\"\n",
                encoding="utf-8",
            )
            result = module.audit(path)
            self.assertEqual(result["status"], "review_required")
            self.assertEqual(result["enforcement"], "report_only")
            self.assertEqual(len(result["drift"]), 2)


class ExposureAuditTests(unittest.TestCase):
    def setUp(self):
        self.module = load("repository_exposure_audit")

    def _init_repo_with_files(self, files: dict[str, str]) -> Path:
        tmp = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init", "-q"], cwd=tmp, check=True)
        subprocess.run(["git", "config", "user.email", "ci@example.com"], cwd=tmp, check=True)
        subprocess.run(["git", "config", "user.name", "CI"], cwd=tmp, check=True)
        for rel_path, content in files.items():
            full = tmp / rel_path
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_bytes(content.encode("utf-8")) if isinstance(content, str) else full.write_bytes(content)
        subprocess.run(["git", "add", "-A"], cwd=tmp, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "seed"], cwd=tmp, check=True)
        return tmp

    def test_tracked_database_file_is_flagged_regardless_of_filename(self):
        # This is the exact real-world gap the 2026-07-21 security audit found:
        # mathpath.db.pre_im_l3_backup was tracked in git and matched none of
        # the old name-marker rules, so it went undetected.
        repo = self._init_repo_with_files({"backend/mathpath.db.pre_im_l3_backup": "not a real db, just bytes"})
        result = self.module.audit(repo, "private")
        rules = {item["rule"] for item in result["high_confidence_path_findings"]}
        self.assertIn("tracked_database_file", rules)

    def test_plaintext_password_in_docs_is_flagged(self):
        repo = self._init_repo_with_files({"README.md": "identifier: admin@mathpath.local\npassword: Admin@123\n"})
        result = self.module.audit(repo, "private")
        rules = {item["rule"] for item in result["high_confidence_content_findings"]}
        self.assertIn("plaintext_password_in_docs", rules)

    def test_placeholder_password_text_is_not_flagged(self):
        repo = self._init_repo_with_files(
            {"README.md": "password: <set locally when you create this account, never commit a real value here>\n"}
        )
        result = self.module.audit(repo, "private")
        rules = {item["rule"] for item in result["high_confidence_content_findings"]}
        self.assertEqual(rules, set())

    def test_hardcoded_default_password_constant_is_flagged(self):
        # Built via concatenation on purpose -- a literal quoted assignment
        # here would itself trip this same rule when this test file is
        # scanned, which is confusing noise even though it's just fixture
        # data.
        fixture_line = "const password = " + '"' + "Teacher" + "@123" + '"' + ";\n"
        repo = self._init_repo_with_files({"frontend/app/admin/teachers/page.tsx": fixture_line})
        result = self.module.audit(repo, "private")
        rules = {item["rule"] for item in result["high_confidence_content_findings"]}
        self.assertIn("hardcoded_password_literal", rules)

    def test_type_annotation_and_helper_call_are_not_flagged(self):
        # Regression guard: an earlier version of this rule matched any
        # "password: <6+ chars>" regardless of quoting, which false-positived
        # on ordinary code like a type annotation or a function call.
        repo = self._init_repo_with_files(
            {
                "frontend/lib/api/auth.ts": "type LoginPayload = { password: string };\n",
                "frontend/tests/example.spec.ts": 'Password: RequireEnvPassword("MATHPATH_ADMIN_PASSWORD"),\n',
            }
        )
        result = self.module.audit(repo, "private")
        rules = {item["rule"] for item in result["high_confidence_content_findings"]}
        self.assertEqual(rules, set())


if __name__ == "__main__":
    unittest.main()
