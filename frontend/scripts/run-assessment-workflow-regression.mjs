import { execSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ExtraArgs = process.argv.slice(2);

const Env = {
  ...process.env,
  MATHPATH_ASSESSMENT_WORKFLOW_REPORT_DIR:
    process.env.MATHPATH_ASSESSMENT_WORKFLOW_REPORT_DIR || path.join("verification-report", "phase-10-7-1-assessment-workflow"),
};

const QuoteShellArg = (Value) => {
  const Text = String(Value);
  if (process.platform === "win32") {
    return `"${Text.replace(/"/g, '\\"')}"`;
  }
  return `'${Text.replace(/'/g, `'"'"'`)}'`;
};

const CommandParts = [
  "npx",
  "playwright",
  "test",
  QuoteShellArg("tests/mathpath-assessment-workflow-regression.spec.ts"),
  "--config=" + QuoteShellArg("playwright.config.ts"),
  ...ExtraArgs.map(QuoteShellArg),
];

const Command = CommandParts.join(" ");

console.log("\nMathPath Phase 10.7.1 assessment workflow regression");
console.log(`Mode: ${Env.MATHPATH_ASSESSMENT_E2E_MODE || "simulation"}`);
console.log(`Report folder: ${Env.MATHPATH_ASSESSMENT_WORKFLOW_REPORT_DIR}\n`);

try {
  execSync(Command, {
    stdio: "inherit",
    env: Env,
    cwd: process.cwd(),
    shell: true,
  });
} catch (ErrorObject) {
  const ExitCode = typeof ErrorObject.status === "number" ? ErrorObject.status : 1;
  if (ExitCode === 1) {
    process.exit(1);
  }
  console.error("\nAssessment workflow regression runner stopped before completion.");
  console.error(`Exit code: ${ExitCode}`);
  console.error("Direct fallback command:");
  console.error("npx playwright test tests/mathpath-assessment-workflow-regression.spec.ts --config=playwright.config.ts");
  process.exit(ExitCode);
}
