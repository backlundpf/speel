import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "./tests/helpers/env";

// Only e2e runs need the full live config + the auto-launched dev server.
// Unit runs (`test:unit`, no PW_E2E) skip both so they stay fast and offline.
const PW_E2E = !!process.env.PW_E2E;
const env = PW_E2E ? loadEnv() : undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Live SharePoint + debug-bundle reload + runAll() against the tenant is well
  // past the 30s default. Generous per-test cap (unit tests finish in ms).
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    ignoreHTTPSErrors: true, // self-signed local dev cert
    trace: "on-first-retry",
    launchOptions: {
      // Let the public SharePoint origin fetch the debug-script bundle from
      // localhost. Without this, Chromium's Local/Private Network Access guard
      // silently blocks https://localhost:4321 and the web part never mounts.
      // Feature names vary by Chromium build — confirm/adjust on the first live
      // run if the bundle is blocked (Task 9 troubleshooting).
      args: [
        "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
      ],
    },
  },

  projects: [
    // Pure-logic helper tests (env, totp). No browser, no tenant. `test:unit`
    // path-filters to tests/helpers so only this project's tests run.
    { name: "unit", testMatch: /helpers\/.*\.spec\.ts$/ },
    {
      // E2E specs. Auth is handled by the worker-scoped storageState fixture
      // (tests/fixtures/auth.fixtures.ts), not a setup project. Desktop Chrome
      // UA so headless presents as real Chrome — Microsoft serves a different
      // MFA flow to the default "HeadlessChrome" UA.
      name: "e2e",
      testMatch:
        /(smoke|fieldDemo|surfaces|folderPlacement|providerConformance)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Auto-launch the local serve for e2e; reuse one already running (Task 4).
  webServer: PW_E2E
    ? {
        command: "npm run dev",
        cwd: __dirname,
        url: env!.manifestUrl,
        ignoreHTTPSErrors: true,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
});
