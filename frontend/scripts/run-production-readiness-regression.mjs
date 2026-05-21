import { execSync } from "node:child_process";
import Fs from "node:fs";
import Path from "node:path";
import Process from "node:process";

const Mode = NormalizeMode(Process.env.MATHPATH_PRODUCTION_READINESS_E2E_MODE || "simulation");
const ReportFolder = Process.env.MATHPATH_PRODUCTION_READINESS_REPORT_DIR || Path.join("verification-report", "phase-10-7-4-production-readiness");
const ExtraArgs = Process.argv.slice(2);

const Env = {
  ...Process.env,
  PLAYWRIGHT_HTML_REPORT: Process.env.PLAYWRIGHT_HTML_REPORT || Path.join("verification-report", "full", "playwright-html"),
  MATHPATH_PRODUCTION_READINESS_E2E_MODE: Mode,
  MATHPATH_PRODUCTION_READINESS_REPORT_DIR: ReportFolder,
};

Fs.mkdirSync(ReportFolder, { recursive: true });
Fs.mkdirSync(Path.join(ReportFolder, "diagnostics"), { recursive: true });
Fs.mkdirSync(Path.join(ReportFolder, "screenshots"), { recursive: true });

const QuoteShellArg = (Value) => {
  const Text = String(Value);
  if (Process.platform === "win32") {
    return `"${Text.replace(/"/g, '\\"')}"`;
  }
  return `'${Text.replace(/'/g, `'"'"'`)}'`;
};

const CommandParts = [
  "npx",
  "playwright",
  "test",
  QuoteShellArg("tests/mathpath-production-readiness-regression.spec.ts"),
  "--project=" + QuoteShellArg("chromium-desktop"),
  "--reporter=" + QuoteShellArg("list,html"),
  ...ExtraArgs.map(QuoteShellArg),
];

const Command = CommandParts.join(" ");

console.log("\nMathPath Phase 10.7.4 final production readiness regression");
console.log(`Mode: ${Mode}`);
console.log(`Report folder: ${ReportFolder}\n`);

try {
  execSync(Command, {
    stdio: "inherit",
    env: Env,
    cwd: Process.cwd(),
    shell: true,
  });
} catch (ErrorObject) {
  const ExitCode = typeof ErrorObject.status === "number" ? ErrorObject.status : 1;
  console.error("\nProduction readiness regression runner stopped before completion.");
  console.error(`Exit code: ${ExitCode}`);
  console.error("Direct fallback command:");
  console.error("npx playwright test tests/mathpath-production-readiness-regression.spec.ts --project=chromium-desktop --reporter=list,html");
  Process.exit(ExitCode);
}

function NormalizeMode(Value) {
  const CleanValue = String(Value || "").trim().toLowerCase();
  return CleanValue === "mutation" ? "mutation" : "simulation";
}
