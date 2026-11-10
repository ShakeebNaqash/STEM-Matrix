import { defineConfig, devices } from "@playwright/test";

const desktop = "http://127.0.0.1:3100";
const slow = "http://127.0.0.1:3101";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      grepInvert: /@mobile/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: desktop,
      },
    },
    {
      name: "mobile",
      grep: /@mobile/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        baseURL: desktop,
      },
    },
  ],
  webServer: [
    {
      command: "npx next start -p 3100",
      url: desktop,
      reuseExistingServer: false,
      env: { BACKEND_URL: "", BACKEND_LIVE_ROUTES: "", MOCK_STREAM_SLOWDOWN: "1" },
    },
    {
      command: "npx next start -p 3101",
      url: slow,
      reuseExistingServer: false,
      env: { BACKEND_URL: "", BACKEND_LIVE_ROUTES: "", MOCK_STREAM_SLOWDOWN: "8" },
    },
  ],
});
