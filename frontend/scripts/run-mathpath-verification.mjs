import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const RawArgs = process.argv.slice(2);
const Scope = (RawArgs.shift() || "full").toLowerCase().replace(/_/g, "-");
const ExtraArgs = RawArgs;

const Env = {
  ...process.env,
  MATHPATH_SCOPE: Scope,
  MATHPATH_REPORT_DIR: process.env.MATHPATH_REPORT_DIR || path.join("verification-report", Scope),
};

const IsWindows = process.platform === "win32";
const NpxCommand = IsWindows ? "npx.cmd" : "npx";
const PlaywrightArgs = [
  "playwright",
  "test",
  "tests/mathpath-platform-verification.spec.ts",
  "--config=playwright.config.ts",
  ...ExtraArgs,
];

console.log(`\nMathPath verification scope: ${Scope}`);
console.log(`Report folder: ${Env.MATHPATH_REPORT_DIR}\n`);

const Child = spawn(NpxCommand, PlaywrightArgs, {
  stdio: "inherit",
  env: Env,
  windowsHide: true,
});

Child.on("error", (ErrorValue) => {
  console.error("MathPath verification runner could not start Playwright.");
  console.error(ErrorValue);
  process.exit(1);
});

Child.on("exit", (Code) => {
  process.exit(Code ?? 1);
});
