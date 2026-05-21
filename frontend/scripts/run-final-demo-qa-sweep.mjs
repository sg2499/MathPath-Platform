#!/usr/bin/env node
/**
 * MathPath Phase 10.8.6 — Final Demo QA Sweep
 *
 * Safe verifier for demo readiness. This runner performs non-destructive checks only:
 * - frontend typecheck
 * - focused Admin Students/onboarding smoke check
 * - optional full workflow regression checks with --full
 * - demo reset preview + backup only; never reset
 *
 * Output:
 * verification-report/phase-10-8-6-final-demo-qa-sweep/qa-summary.json
 * verification-report/phase-10-8-6-final-demo-qa-sweep/qa-summary.md
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const Args = new Set(process.argv.slice(2));
const FullMode = Args.has("--full");
const FrontendRoot = process.cwd();
const BackendRoot = path.resolve(FrontendRoot, "..", "backend");
const ReportRoot = path.join(FrontendRoot, "verification-report", "phase-10-8-6-final-demo-qa-sweep");
const SummaryJsonPath = path.join(ReportRoot, "qa-summary.json");
const SummaryMarkdownPath = path.join(ReportRoot, "qa-summary.md");

fs.mkdirSync(ReportRoot, { recursive: true });

const IsWindows = process.platform === "win32";
const NpmCommand = IsWindows ? "npm.cmd" : "npm";
const NodeCommand = process.execPath;
const PythonCommand = IsWindows ? "python" : "python3";

const Records = [];

function Timestamp() {
  return new Date().toISOString();
}

function AddRecord(Step, Status, Message, Detail = {}) {
  Records.push({ Step, Status, Message, Detail, checkedAt: Timestamp() });
  const Prefix = Status === "PASS" ? "✓" : Status === "WARN" ? "!" : "✗";
  console.log(`${Prefix} ${Step}: ${Status} — ${Message}`);
}

function RunCommand({ Step, Command, Args = [], Cwd = FrontendRoot, Required = true, TimeoutMs = 180000 }) {
  console.log(`\nRunning: ${Step}`);
  const StartedAt = Date.now();
  const Result = spawnSync(Command, Args, {
    cwd: Cwd,
    encoding: "utf8",
    timeout: TimeoutMs,
    env: process.env,
    windowsHide: true,
  });

  const DurationMs = Date.now() - StartedAt;
  const Detail = {
    command: [Command, ...Args].join(" "),
    cwd: Cwd,
    exitCode: Result.status,
    signal: Result.signal,
    durationMs: DurationMs,
    stdoutTail: String(Result.stdout || "").slice(-4000),
    stderrTail: String(Result.stderr || "").slice(-4000),
  };

  if (Result.error) {
    AddRecord(
      Step,
      Required ? "FAIL" : "WARN",
      `${Result.error.message}`,
      Detail,
    );
    return !Required;
  }

  if (Result.status === 0) {
    AddRecord(Step, "PASS", "Completed successfully.", Detail);
    return true;
  }

  AddRecord(
    Step,
    Required ? "FAIL" : "WARN",
    `Exited with code ${Result.status ?? "unknown"}.`,
    Detail,
  );
  return !Required;
}

function BackendScriptExists() {
  return fs.existsSync(path.join(BackendRoot, "scripts", "demo_data_safety.py"));
}

console.log("\nMathPath Phase 10.8.6 final demo QA sweep");
console.log(`Mode: ${FullMode ? "full" : "focused"}`);
console.log(`Report folder: ${path.relative(FrontendRoot, ReportRoot)}`);
console.log("Safety: this runner does not execute demo reset.\n");

let Failed = false;

const CriticalChecks = [
  {
    Step: "Frontend typecheck",
    Command: NpmCommand,
    Args: ["run", "typecheck"],
    TimeoutMs: 180000,
  },
  {
    Step: "Admin Students / onboarding focused smoke",
    Command: NodeCommand,
    Args: ["scripts/run-mathpath-verification.mjs", "admin-students"],
    TimeoutMs: 240000,
  },
];

for (const Check of CriticalChecks) {
  const Ok = RunCommand(Check);
  if (!Ok) Failed = true;
}

if (BackendScriptExists()) {
  const PreviewOk = RunCommand({
    Step: "Demo reset preview safety check",
    Command: PythonCommand,
    Args: ["scripts/demo_data_safety.py", "preview"],
    Cwd: BackendRoot,
    Required: true,
    TimeoutMs: 120000,
  });
  if (!PreviewOk) Failed = true;

  const BackupOk = RunCommand({
    Step: "Demo backup safety check",
    Command: PythonCommand,
    Args: ["scripts/demo_data_safety.py", "backup"],
    Cwd: BackendRoot,
    Required: true,
    TimeoutMs: 180000,
  });
  if (!BackupOk) Failed = true;
} else {
  AddRecord(
    "Demo reset tooling availability",
    "WARN",
    "backend/scripts/demo_data_safety.py was not found from the frontend-relative backend path. Skipped preview/backup checks.",
    { expectedPath: path.join(BackendRoot, "scripts", "demo_data_safety.py") },
  );
}

if (FullMode) {
  const FullChecks = [
    ["Assessment workflow regression", "scripts/run-assessment-workflow-regression.mjs"],
    ["DPS / practice workflow regression", "scripts/run-practice-workflow-regression.mjs"],
    ["Reports / promotion / readiness governance regression", "scripts/run-governance-workflow-regression.mjs"],
    ["Production readiness regression", "scripts/run-production-readiness-regression.mjs"],
  ];

  for (const [Step, Script] of FullChecks) {
    if (!fs.existsSync(path.join(FrontendRoot, Script))) {
      AddRecord(Step, "WARN", `${Script} is not present in this checkout.`, { script: Script });
      continue;
    }

    const Ok = RunCommand({
      Step,
      Command: NodeCommand,
      Args: [Script],
      TimeoutMs: 420000,
      Required: true,
    });
    if (!Ok) Failed = true;
  }
} else {
  AddRecord(
    "Full workflow regression set",
    "WARN",
    "Skipped in focused mode. Run npm run verify:demo-qa-sweep:full for the complete regression pass.",
    { fullCommand: "npm run verify:demo-qa-sweep:full" },
  );
}

const PassCount = Records.filter((Record) => Record.Status === "PASS").length;
const WarnCount = Records.filter((Record) => Record.Status === "WARN").length;
const FailCount = Records.filter((Record) => Record.Status === "FAIL").length;
const Summary = {
  phase: "10.8.6",
  title: "Final Demo QA Sweep",
  mode: FullMode ? "full" : "focused",
  generatedAt: Timestamp(),
  destructiveActionExecuted: false,
  status: FailCount > 0 ? "FAIL" : WarnCount > 0 ? "PASS_WITH_WARNINGS" : "PASS",
  counts: { pass: PassCount, warn: WarnCount, fail: FailCount },
  records: Records,
};

fs.writeFileSync(SummaryJsonPath, JSON.stringify(Summary, null, 2), "utf8");

const Markdown = [
  "# MathPath Phase 10.8.6 — Final Demo QA Sweep",
  "",
  `Generated At: ${Summary.generatedAt}`,
  `Mode: ${Summary.mode}`,
  `Status: ${Summary.status}`,
  `Destructive Action Executed: ${Summary.destructiveActionExecuted}`,
  "",
  "## Counts",
  "",
  `- PASS: ${PassCount}`,
  `- WARN: ${WarnCount}`,
  `- FAIL: ${FailCount}`,
  "",
  "## Records",
  "",
  ...Records.map((Record) => `- **${Record.Status}** — ${Record.Step}: ${Record.Message}`),
  "",
  "## Notes",
  "",
  "This sweep is intentionally safe-by-default. It does not run demo reset. Backup and preview checks are non-destructive.",
  "",
].join("\n");

fs.writeFileSync(SummaryMarkdownPath, Markdown, "utf8");

console.log(`\nSummary JSON: ${path.relative(FrontendRoot, SummaryJsonPath)}`);
console.log(`Summary Markdown: ${path.relative(FrontendRoot, SummaryMarkdownPath)}`);
console.log(`Final status: ${Summary.status}\n`);

if (Failed) {
  process.exit(1);
}
