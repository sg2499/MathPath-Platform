import { defineConfig, devices } from "@playwright/test";

const ReportDir = process.env.MATHPATH_REPORT_DIR || `verification-report/${(process.env.MATHPATH_SCOPE || "full").toLowerCase().replace(/_/g, "-")}`;

export default defineConfig({
  testDir: "./tests",
  timeout: Number(process.env.MATHPATH_PLAYWRIGHT_TIMEOUT_MS || "180000"),
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${ReportDir}/playwright-html`, open: "never" }],
  ],
  use: {
    baseURL: process.env.MATHPATH_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: Number(process.env.MATHPATH_ACTION_TIMEOUT_MS || "8000"),
    navigationTimeout: Number(process.env.MATHPATH_NAVIGATION_TIMEOUT_MS || "25000"),
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "firefox-desktop",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "webkit-desktop",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
