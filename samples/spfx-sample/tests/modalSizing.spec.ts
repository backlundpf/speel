import { test, expect } from "./fixtures/auth.fixtures";
import type { Locator, Page } from "@playwright/test";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

test.use({ viewport: { width: 1600, height: 1000 } });

/**
 * Live checks of modal sizing (#101) and confirm() (#102) on a real SharePoint page, in
 * both skins: the page's own chrome and CSS around the absolutely placed frame. Drives the
 * dashboard's "Modal sizing demo" section (ModalSizingDemo.tsx); creates no list data.
 */

const VW = 1600;
const VH = 1000;

const FRAME = {
  fluent: ".ms-Dialog-main",
  shadcn: '[data-slot="dialog-content"]',
} as const;
const HEADER = {
  fluent: ".speel-modal-bar",
  shadcn: '[data-slot="dialog-content"] > div:first-child',
} as const;
type Skin = keyof typeof FRAME;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });

async function openDemo(page: Page, skin: Skin): Promise<Locator> {
  await new ProjectDashboardPage(page).open("project", { skin });
  const demo = page.getByRole("region", { name: "Modal sizing demo" });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toBeVisible({ timeout: 60_000 });
  return demo;
}

async function openModal(
  page: Page,
  skin: Skin,
  button: string,
): Promise<Locator> {
  const demo = await openDemo(page, skin);
  await demo.getByRole("button", { name: button }).click();
  const frame = page
    .locator(FRAME[skin])
    .filter({ hasText: "Sized to content" });
  await expect(frame).toBeVisible();
  return frame;
}

/** Waits for the frame's height to settle after a content change, then returns its box. */
async function settled(frame: Locator, from: number): Promise<Box> {
  await expect.poll(async () => (await box(frame)).h).not.toBe(from);
  return box(frame);
}

for (const skin of ["fluent", "shadcn"] as const) {
  test.describe(`${skin} skin`, () => {
    test("auto height fits the content and grows and shrinks around the centre", async ({
      authPage,
    }) => {
      const frame = await openModal(authPage, skin, "Open auto modal");
      const short = await box(frame);
      expect(short.h).toBeLessThan(260);
      expect(short.y + short.h / 2).toBeCloseTo(VH / 2, 0);
      expect(short.x + short.w / 2).toBeCloseTo(VW / 2, 0);

      await authPage.getByRole("button", { name: "More lines" }).click();
      const tall = await settled(frame, short.h);
      expect(tall.h).toBeCloseTo(short.h + 9 * 20, 0);
      expect(tall.y + tall.h / 2).toBeCloseTo(VH / 2, 0);

      await authPage.getByRole("button", { name: "Fewer lines" }).click();
      const back = await settled(frame, tall.h);
      expect(back.h).toBeCloseTo(short.h, 0);
    });

    test("auto height stops at 92vh; the body scrolls and the footer stays on screen", async ({
      authPage,
    }) => {
      const frame = await openModal(authPage, skin, "Open auto modal");
      const more = authPage.getByRole("button", { name: "More lines" });
      for (let i = 0; i < 6; i++) await more.click(); // 55 lines: past the cap
      await expect
        .poll(async () => (await box(frame)).h)
        .toBeCloseTo(VH * 0.92, 0);
      const footer = await box(
        authPage.getByRole("button", { name: "Fewer lines" }),
      );
      expect(footer.y + footer.h).toBeLessThanOrEqual(VH);
    });

    test("with top, it grows downward only", async ({ authPage }) => {
      const frame = await openModal(authPage, skin, "Open placed modal");
      const short = await box(frame);
      expect(short.y).toBeCloseTo(40, 0);
      await authPage.getByRole("button", { name: "More lines" }).click();
      const tall = await settled(frame, short.h);
      expect(tall.y).toBeCloseTo(40, 0);
      expect(tall.h).toBeGreaterThan(short.h);
    });

    test("a drag moves the frame by exactly the pointer travel and ends auto height", async ({
      authPage,
    }) => {
      const frame = await openModal(authPage, skin, "Open auto modal");
      const before = await box(frame);
      const bar = await box(
        authPage.locator(HEADER[skin]).filter({ hasText: "Sized to content" }),
      );
      const sx = bar.x + 40;
      const sy = bar.y + bar.h / 2;
      await authPage.mouse.move(sx, sy);
      await authPage.mouse.down();
      await authPage.mouse.move(sx + 60, sy + 30, { steps: 6 });
      await authPage.mouse.up();
      const moved = await box(frame);
      // No jump on takeover: the page's containing blocks add no offset.
      expect(moved.x).toBeCloseTo(before.x + 60, 0);
      expect(moved.y).toBeCloseTo(before.y + 30, 0);
      await authPage.getByRole("button", { name: "More lines" }).click();
      await authPage.waitForTimeout(300);
      expect((await box(frame)).h).toBeCloseTo(before.h, 0);
    });

    test("confirm(): content-sized, opens on Cancel, resolves both ways", async ({
      authPage,
    }) => {
      const demo = await openDemo(authPage, skin);
      const answer = demo.getByTestId("confirm-answer");

      await demo.getByRole("button", { name: "Ask to confirm" }).click();
      const dialog = authPage.getByRole("dialog", {
        name: "Delete item?",
        description: "This cannot be undone.",
      });
      // Fluent's role="dialog" Popup is a 0×0 wrapper around its fixed root (see
      // fixWave.spec.ts): assert the named, described dialog exists, then measure the frame.
      await expect(dialog).toBeAttached();
      const frame = authPage
        .locator(FRAME[skin])
        .filter({ hasText: "Delete item?" });
      const b = await box(frame);
      expect(b.h).toBeLessThan(260);
      expect(b.w).toBeCloseTo(480, 0);
      await expect(
        authPage.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      await expect(authPage.getByLabel("Toggle fullscreen")).toHaveCount(0);
      await authPage.keyboard.press("Enter"); // Enter on the focused Cancel
      await expect(answer).toHaveText("Answer: no");

      await demo.getByRole("button", { name: "Ask to confirm" }).click();
      await authPage.getByRole("button", { name: "Delete" }).click();
      await expect(answer).toHaveText("Answer: yes");
    });
  });
}
