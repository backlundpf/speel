import { Page, expect, Locator } from "@playwright/test";
import { generateMfaCode } from "../helpers/totp";
import { loadEnv, type O365UserConfig } from "../helpers/env";

/**
 * Page Object for the Microsoft 365 / Azure AD sign-in flow, hardened against
 * the many screens Microsoft interleaves (push-approval, "Verify your identity"
 * method list, "Let's keep your account secure", phone-registration, KMSI).
 * Adapted from a proven SPFx e2e suite. Debug screenshots land in test-results/
 * (gitignored).
 */
export class O365LoginPage {
  private readonly defaultTimeout = 30_000;

  constructor(private readonly page: Page) {}

  async gotoLogin(targetUrl?: string): Promise<void> {
    const destination = targetUrl || loadEnv().baseURL;

    if (!destination) {
      throw new Error("Login destination is not configured.");
    }

    await this.page.goto(destination, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }

  async loginWithMfa(user: O365UserConfig): Promise<void> {
    console.log(`[O365Login] Starting login for ${user.username}`);
    await this.enterUsername(user.username);
    console.log(`[O365Login] Username entered`);

    await this.enterPassword(user.password);
    console.log(`[O365Login] Password entered`);

    await this.handleAccountSecurePrompt();
    console.log(`[O365Login] Account secure prompt handled`);

    await this.handleMfa(user);
    console.log(`[O365Login] MFA handled`);

    await this.handleStaySignedIn();
    await this.handlePhoneRegistrationPrompt();
    console.log(`[O365Login] Login complete for ${user.username}`);
  }

  private async enterUsername(username: string): Promise<void> {
    const page = this.page;

    const usernameField = page
      .locator('input[type="email"]')
      .first()
      .or(page.getByPlaceholder("Email, phone, or Skype"))
      .or(page.locator('input[name="loginfmt"]'))
      .or(page.locator('input[aria-label*="mail" i]'));

    await usernameField.waitFor({
      state: "visible",
      timeout: this.defaultTimeout,
    });

    await usernameField.clear();
    await usernameField.fill(username);
    await expect(usernameField).toHaveValue(username);

    const nextButton = page
      .locator('input[type="submit"]')
      .first()
      .or(page.getByRole("button", { name: /^Next$/i }))
      .or(page.locator('button[data-report-event="Signin_Submit"]'))
      .or(page.locator("#idSIButton9"));

    await nextButton.waitFor({ state: "visible", timeout: 5_000 });
    await expect(nextButton).toBeEnabled({ timeout: 5_000 });
    await nextButton.click();

    await page.waitForLoadState("domcontentloaded");
    await this.checkForLoginErrors();
  }

  private async enterPassword(password: string): Promise<void> {
    const page = this.page;

    const passwordField = page
      .locator('input[type="password"]')
      .first()
      .or(page.locator('input[name="passwd"]'))
      .or(page.getByLabel(/Password/i));

    await passwordField.waitFor({
      state: "visible",
      timeout: this.defaultTimeout,
    });

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput
      .waitFor({ state: "hidden", timeout: 5_000 })
      .catch(() => {});

    await passwordField.clear();
    await passwordField.fill(password);

    const signInButton = page
      .locator('input[type="submit"]')
      .first()
      .or(page.getByRole("button", { name: /Sign in/i }))
      .or(page.locator('button[data-report-event="Signin_Submit"]'))
      .or(page.locator("#idSIButton9"));

    await signInButton.waitFor({ state: "visible", timeout: 5_000 });
    await expect(signInButton).toBeEnabled({ timeout: 5_000 });
    await signInButton.click();

    await page.waitForLoadState("domcontentloaded");
    await this.checkForLoginErrors();
  }

  private async handleAccountSecurePrompt(): Promise<void> {
    const page = this.page;

    const secureIndicators = [
      page.getByText(/Let's keep your account secure/i),
      page.getByText(/We'll help you set up another way to verify it's you/i),
      page.getByText(/keep your account secure/i),
    ];

    try {
      await Promise.race(
        secureIndicators.map((loc) =>
          loc.waitFor({ state: "visible", timeout: 5_000 }),
        ),
      );
    } catch {
      return;
    }

    const nextButton = page
      .getByRole("button", { name: /^Next$/i })
      .or(page.locator('input[type="submit"]'))
      .or(page.locator("#idSIButton9"))
      .first();

    await nextButton.waitFor({ state: "visible", timeout: 10_000 });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await page.waitForLoadState("domcontentloaded");
  }

  private async handleMfa(user: O365UserConfig): Promise<void> {
    console.log(`[O365Login] Checking for MFA prompt`);
    const mfaDetected = await this.detectMfaPrompt();

    if (!mfaDetected) {
      console.log(`[O365Login] No MFA required or already authenticated`);
      return;
    }

    console.log(`[O365Login] Navigating to TOTP entry`);
    await this.navigateToTotpEntry();
    console.log(`[O365Login] TOTP navigation complete, entering code`);
    await this.enterTotpCodeWithRetry(user);
  }

  private async handlePhoneRegistrationPrompt(): Promise<void> {
    const page = this.page;

    // Wait up to 30s for navigation to either SharePoint (success) or mysignins (registration).
    try {
      await page.waitForURL(
        (url) => {
          const hostname = new URL(url).hostname.toLowerCase();
          return (
            hostname.includes("sharepoint.com") ||
            hostname.includes("mysignins.microsoft.com")
          );
        },
        { timeout: 30_000 },
      );
    } catch {
      return;
    }

    const hostname = new URL(page.url()).hostname.toLowerCase();

    if (hostname.includes("sharepoint.com")) {
      return;
    }

    // mysignins: the phone-number registration page — skip it.
    if (hostname.includes("mysignins.microsoft.com")) {
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});
      await page
        .waitForSelector("a, button", { timeout: 15_000 })
        .catch(() => {});
      await page.waitForTimeout(2_000);

      const skipButton = page.getByRole("button", { name: "Skip setup" });

      if (await skipButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log(`[O365Login] Skipping phone registration...`);
        await skipButton.click();

        await page
          .waitForURL(
            (url) =>
              new URL(url).hostname.toLowerCase().includes("sharepoint.com"),
            {
              timeout: 15_000,
            },
          )
          .catch(() => {});

        return;
      }

      await page.screenshot({
        path: "test-results/phone-registration-no-skip.png",
        fullPage: true,
      });
    }
  }

  private async detectMfaPrompt(): Promise<boolean> {
    const page = this.page;
    const currentUrl = page.url();

    // Microsoft may auto-select the default method and skip the picker screen.
    if (
      currentUrl.includes("registerSsprMethodsInterrupt") ||
      currentUrl.includes("proofup") ||
      currentUrl.includes("authenticator")
    ) {
      console.log(`[O365Login] MFA page detected by URL pattern`);
      return true;
    }

    const mfaIndicators = [
      page.getByText(/Approve sign in request/i),
      page.getByText(/Enter the number/i),
      page.getByText(/Enter.*code/i),
      page.getByText(/Verify your identity/i),
      page.getByText(/Use verification code/i),
      page.locator('input[name="otc"]'),
      page.locator('div[data-value="PhoneAppOTP"]'),
      page.getByRole("textbox", { name: /code/i }),
    ];

    try {
      await Promise.race(
        mfaIndicators.map((loc) =>
          loc.waitFor({ state: "visible", timeout: 15_000 }),
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async navigateToTotpEntry(): Promise<void> {
    const page = this.page;

    // 1. Already on the OTP entry screen?
    const codeFieldAlreadyVisible = await page
      .locator('input[name="otc"]')
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (codeFieldAlreadyVisible) {
      console.log("[O365Login] Already on OTP entry screen");
      return;
    }

    // 2. Push approval screen — leave it.
    const onPushScreen = await page
      .locator("#idDiv_SAOTCAS_Title")
      .filter({ hasText: /Approve sign in request/i })
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (onPushScreen) {
      console.log("[O365Login] On push approval screen");

      const pushEscapeOptions = [
        page.locator("#signInAnotherWay"),
        page.getByRole("link", {
          name: /i can't use my microsoft authenticator app right now/i,
        }),
        page.getByRole("button", {
          name: /i can't use my microsoft authenticator app right now/i,
        }),
        page.locator('a[id*="signInAnotherWay"]'),
      ];

      let clickedPushEscape = false;

      for (const option of pushEscapeOptions) {
        if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          console.log("[O365Login] Clicking push-screen fallback link");
          await option.click();

          // Microsoft often swaps MFA views in-place instead of a full load.
          await Promise.race([
            page
              .locator("#idDiv_SAOTCS_Title")
              .filter({ hasText: /Verify your identity/i })
              .waitFor({ state: "visible", timeout: 10_000 }),
            page
              .locator('input[name="otc"]')
              .first()
              .waitFor({ state: "visible", timeout: 10_000 }),
          ]);

          clickedPushEscape = true;
          break;
        }
      }

      if (!clickedPushEscape) {
        throw new Error("Could not leave Approve sign in request screen.");
      }
    }

    // 3. OTP field visible after leaving push screen?
    const codeFieldVisibleAfterPush = await page
      .locator('input[name="otc"]')
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (codeFieldVisibleAfterPush) {
      console.log(
        "[O365Login] OTP entry screen reached after leaving push screen",
      );
      return;
    }

    // 4. "Verify your identity" — choose the verification-code method.
    const onVerifyIdentityScreen = await page
      .locator("#idDiv_SAOTCS_Title")
      .filter({ hasText: /Verify your identity/i })
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (onVerifyIdentityScreen) {
      console.log("[O365Login] On Verify your identity screen");

      const otpOptions = [
        page.locator('[data-value="PhoneAppOTP"]').first(),
        page.getByRole("button", { name: /use a verification code/i }),
        page.getByRole("link", { name: /use a verification code/i }),
        page.getByText(/use a verification code/i).locator(".."),
        page.getByText(/enter a code from my authenticator app/i).locator(".."),
      ];

      let clickedOtpOption = false;

      for (const option of otpOptions) {
        if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          console.log("[O365Login] Clicking OTP option");
          // Force-click: the method list is Knockout-bound and re-renders while a
          // push is pending, so it's rarely "stable" for a normal click.
          await option.click({ force: true });
          await page.waitForLoadState("domcontentloaded");
          clickedOtpOption = true;
          break;
        }
      }

      if (!clickedOtpOption) {
        throw new Error(
          "Could not find OTP verification option on Verify your identity screen.",
        );
      }
    }

    // 5. Confirm we reached the OTP entry screen.
    try {
      await page.locator('input[name="otc"]').first().waitFor({
        state: "visible",
        timeout: 10_000,
      });
    } catch {
      await page.screenshot({
        path: "test-results/mfa-code-field-not-found.png",
        fullPage: true,
      });

      throw new Error("Could not reach TOTP code entry screen.");
    }

    console.log("[O365Login] OTP entry screen confirmed");
  }

  private getCodeField(): Locator {
    const page = this.page;

    return page
      .locator('input[name="otc"]')
      .first()
      .or(page.getByRole("textbox", { name: /code/i }))
      .or(page.locator('input[type="tel"]'))
      .or(page.locator('input[inputmode="numeric"]'));
  }

  private async enterTotpCodeWithRetry(
    user: O365UserConfig,
    maxRetries = 2,
  ): Promise<void> {
    const page = this.page;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.enterTotpCode(user);

      const invalidCodeIndicators = [
        page.getByText(/incorrect.*code/i),
        page.getByText(/invalid.*code/i),
        page.getByText(/wrong.*code/i),
        page.getByText(/try again/i),
        page.locator('[role="alert"]'),
      ];

      let hasError = false;
      for (const indicator of invalidCodeIndicators) {
        if (await indicator.isVisible({ timeout: 2_000 }).catch(() => false)) {
          hasError = true;
          break;
        }
      }

      if (!hasError) {
        return;
      }

      if (attempt === maxRetries) {
        await page.screenshot({
          path: "test-results/mfa-invalid-code.png",
          fullPage: true,
        });
        throw new Error("MFA verification code was rejected after retries.");
      }

      // Wait out the current 30s TOTP window so the retry uses a fresh code.
      await page.waitForTimeout(5_000);
    }
  }

  private async enterTotpCode(user: O365UserConfig): Promise<void> {
    const page = this.page;
    const codeField = this.getCodeField();

    await codeField.waitFor({ state: "visible", timeout: 15_000 });

    const code = generateMfaCode(user);
    await codeField.clear().catch(() => {});
    await codeField.fill(code);

    const submitButton = page
      .locator('input[type="submit"]')
      .first()
      .or(page.getByRole("button", { name: /Verify/i }))
      .or(page.getByRole("button", { name: /Next/i }))
      .or(page.getByRole("button", { name: /Sign in/i }))
      .or(page.locator("#idSubmit_SAOTCC_Continue"));

    await submitButton.waitFor({ state: "visible", timeout: 5_000 });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await page.waitForLoadState("domcontentloaded");
  }

  private async handleStaySignedIn(): Promise<void> {
    const page = this.page;

    const staySignedInIndicators = [
      page.getByText(/Stay signed in/i),
      page.getByText(/Keep me signed in/i),
      page.getByText(/Don't show.*again/i),
      page.locator("#KmsiDescription"),
      page.locator('div[role="heading"]').filter({ hasText: /stay|keep/i }),
    ];

    try {
      await Promise.race(
        staySignedInIndicators.map((loc) =>
          loc.waitFor({ state: "visible", timeout: 5_000 }),
        ),
      );
    } catch {
      return;
    }

    const yesButton = page
      .locator('input[type="submit"]')
      .first()
      .or(page.getByRole("button", { name: /^Yes$/i }))
      .or(page.locator("#idSIButton9"));

    const noButton = page
      .getByRole("button", { name: /^No$/i })
      .or(page.locator("#idBtn_Back"));

    if (await yesButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(yesButton).toBeEnabled();
      await yesButton.click();
    } else if (
      await noButton.isVisible({ timeout: 3_000 }).catch(() => false)
    ) {
      await expect(noButton).toBeEnabled();
      await noButton.click();
    }

    await page.waitForLoadState("domcontentloaded");
  }

  async expectAuthenticatedInApp(): Promise<void> {
    const page = this.page;

    try {
      await page.waitForURL(
        (url) =>
          /sharepoint\.com/i.test(url.toString()) &&
          !/login\.microsoftonline\.com/i.test(url.toString()),
        { timeout: 60_000 },
      );
    } catch {
      await page.screenshot({
        path: "test-results/auth-url-navigation-failed.png",
        fullPage: true,
      });
      throw new Error(
        `Failed to navigate to authenticated SharePoint area. Current URL: ${page.url()}`,
      );
    }

    const currentUrl = page.url();
    expect(/sharepoint\.com/i.test(currentUrl)).toBeTruthy();
    expect(/login\.microsoftonline\.com/i.test(currentUrl)).toBeFalsy();

    const accountButton = page
      .getByRole("button", { name: /Account manager for/i })
      .first();

    await expect(accountButton).toBeVisible({ timeout: 15_000 });
  }

  async checkForLoginErrors(): Promise<void> {
    const page = this.page;

    const errorIndicators = [
      page.getByText(/incorrect.*password/i),
      page.getByText(/account.*locked/i),
      page.getByText(/account.*disabled/i),
      page.getByText(/Your account or password is incorrect/i),
      page.locator("#passwordError"),
      page.locator('[role="alert"]'),
    ];

    for (const indicator of errorIndicators) {
      if (await indicator.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const errorText = await indicator.textContent();
        await page.screenshot({
          path: "test-results/login-error-detected.png",
          fullPage: true,
        });
        throw new Error(`Login error detected: ${errorText}`);
      }
    }
  }
}
