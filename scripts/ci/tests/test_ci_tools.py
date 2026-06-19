from __future__ import annotations

import importlib.util
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
    def test_automation_only_is_non_runtime(self):
        module = load("classify_change")
        result = module.classify([".github/workflows/mathpath-ci.yml", "scripts/ci/check_config_drift.py"])
        self.assertFalse(result["runtime_surface_touched"])
        self.assertEqual(result["risk_classification"], "low")

    def test_backend_model_is_high_risk(self):
        module = load("classify_change")
        result = module.classify(["backend/app/models/student.py"])
        self.assertTrue(result["runtime_surface_touched"])
        self.assertEqual(result["risk_classification"], "high")


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


if __name__ == "__main__":
    unittest.main()
