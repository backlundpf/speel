import path from "path";
import fs from "fs";
import { test as base, expect, BrowserContext, Page } from "@playwright/test";
import { O365LoginPage } from "../pages/o365Login.page";
import {
  loadEnv,
  loadUser,
  type Role,
  type O365UserConfig,
} from "../helpers/env";
import { authDir, acquireAuthLock, cleanStaleLocks } from "./authLock";

type WorkerFixtures = {
  workerStorageState: string | undefined;
  role: Role;
  user: O365UserConfig | undefined;
};

type TestFixtures = {
  authContext: BrowserContext;
  authPage: Page;
  loginUsername: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function homeUrl(): string {
  return loadEnv().baseURL;
}

/**
 * Where sign-in lands and where a cached session is verified. Not the site root: the
 * site has no default home page (each web part has its own page), so the root answers
 * 404 and never shows SharePoint's header — the "signed in" marker the checks wait for.
 */
function landingUrl(): string {
  return loadEnv().pages.project;
}

/**
 * Verify authentication: we are on the SharePoint tenant and not on the
 * Microsoft login page. Navigates to the site home if the page is still blank
 * (the case when validating a freshly-loaded cached storageState).
 */
async function assertLoggedIn(
  page: Page,
  _user: O365UserConfig,
): Promise<void> {
  const currentUrl = page.url();

  if (currentUrl === "about:blank" || currentUrl === "") {
    await page.goto(landingUrl(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // SharePoint keeps polling, so 'networkidle' rarely settles; the account-
    // manager button is the reliable "signed in" marker.
    await page
      .getByRole("button", { name: /Account manager for/i })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
  }

  const finalUrl = page.url();
  expect(
    /sharepoint\.com/i.test(finalUrl),
    "User did not land on SharePoint tenant",
  ).toBeTruthy();
  expect(
    /login\.microsoftonline\.com/i.test(finalUrl),
    "User was redirected to Microsoft login",
  ).toBeFalsy();
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Which role this worker authenticates as. Override per-project/test as roles grow.
  role: ["primary" as Role, { scope: "worker", option: true }],

  // Credentials derived from the role.
  user: [
    async ({ role }, use) => {
      await use(loadUser(role));
    },
    { scope: "worker" },
  ],

  // Convenience for logging/reporting the configured account.
  loginUsername: [
    async ({ user }, use) => {
      await use(user?.username ?? "");
    },
    { scope: "test" },
  ],

  // Per-worker storageState: reuse a valid cached file, else log in once (under a
  // file lock so parallel workers sharing a role don't all authenticate).
  workerStorageState: [
    async ({ browser, user, role }, use, workerInfo) => {
      if (!user?.username || !user?.password) {
        throw new Error(
          `Auth fixture: missing username or password for role ${role}`,
        );
      }

      const browserName = browser.browserType().name();
      const sanitizedUsername = user.username.replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = path.join(
        authDir,
        `${browserName}-${sanitizedUsername}.json`,
      );
      const tag = `${browserName}:worker-${workerInfo.parallelIndex}`;

      if (workerInfo.workerIndex === 0) {
        cleanStaleLocks(browserName, sanitizedUsername);
      }

      console.log(`[${tag}] Initializing auth for ${user.username}`);

      let needsLogin = false;

      if (fs.existsSync(fileName)) {
        try {
          const storageData = JSON.parse(fs.readFileSync(fileName, "utf-8"));
          if (storageData.cookies && storageData.cookies.length > 0) {
            const context = await browser.newContext({
              storageState: fileName,
            });
            const page = await context.newPage();
            try {
              await assertLoggedIn(page, user);
              console.log(`[${tag}] Using cached auth for ${user.username}`);
            } catch {
              console.log(`[${tag}] Cached auth expired, will re-authenticate`);
              needsLogin = true;
            } finally {
              await page.close();
              await context.close();
            }
          } else {
            needsLogin = true;
          }
        } catch (error) {
          console.log(
            `[${tag}] Failed to load storage state: ${getErrorMessage(error)}`,
          );
          needsLogin = true;
        }
      } else {
        console.log(`[${tag}] No cached auth found for ${user.username}`);
        needsLogin = true;
      }

      if (needsLogin) {
        const lockIdentifier = `${browserName}-worker-${workerInfo.parallelIndex}`;
        let releaseLock: (() => void) | null = null;

        try {
          releaseLock = await acquireAuthLock(
            lockIdentifier,
            browserName,
            sanitizedUsername,
          );

          // Another worker may have authenticated while we waited for the lock.
          if (fs.existsSync(fileName)) {
            const fileAge = Date.now() - fs.statSync(fileName).mtimeMs;
            if (fileAge < 60_000) {
              console.log(
                `[${tag}] Auth file created by another worker, using it`,
              );
              await use(fileName);
              return;
            }
          }

          const context = await browser.newContext({ baseURL: homeUrl() });
          const page = await context.newPage();
          const loginPage = new O365LoginPage(page);

          console.log(`[${tag}] Authenticating ${user.username} via o365...`);

          try {
            await loginPage.gotoLogin(landingUrl());
            await loginPage.loginWithMfa(user);
            await loginPage.expectAuthenticatedInApp();
            await context.storageState({ path: fileName });
            console.log(`[${tag}] Auth saved for ${user.username}`);
          } catch (error) {
            await page
              .screenshot({
                path: path.join(
                  authDir,
                  `auth-failed-${browserName}-${workerInfo.parallelIndex}-${Date.now()}.png`,
                ),
                fullPage: true,
              })
              .catch(() => {});
            if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
            throw new Error(
              `Authentication failed for ${user.username} in ${browserName}: ${getErrorMessage(error)}`,
            );
          } finally {
            await page.close();
            await context.close();
          }
        } finally {
          releaseLock?.();
        }
      }

      await use(fileName);
    },
    { scope: "worker", timeout: 180_000 },
  ],

  // Feed the cached/created state into Playwright's built-in storageState.
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  authContext: async ({ browser, storageState }, use) => {
    const context = await browser.newContext({
      ...(storageState ? { storageState: storageState as string } : {}),
      baseURL: homeUrl(),
    });
    await use(context);
    await context.close();
  },

  authPage: async ({ authContext, user }, use) => {
    const page = await authContext.newPage();
    try {
      if (!user) throw new Error("User configuration is required for authPage");
      await assertLoggedIn(page, user);
    } catch (error) {
      await page
        .screenshot({
          path: path.join(
            authDir,
            `auth-page-verification-failed-${Date.now()}.png`,
          ),
          fullPage: true,
        })
        .catch(() => {});
      throw new Error(`Auth verification failed: ${getErrorMessage(error)}`);
    }
    await use(page);
    await page.close();
  },
});

export { expect };
