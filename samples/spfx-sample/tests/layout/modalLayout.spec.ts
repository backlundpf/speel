import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ModalStyle } from "@speel/react";
import { bundle, open } from "./harness";

// Real-layout checks of modal sizing (#101) in both skins: jsdom has no layout, so auto
// height, centring, placement and the caps are only provable in a browser.

let js = "";
let css = "";
test.beforeAll(async () => {
  js = await bundle(path.join(__dirname, "modalFixture.tsx"));
  css = readFileSync(
    path.resolve(__dirname, "../../lib/styles/speel-shadcn.css"),
    "utf8",
  );
});
test.use({ viewport: { width: 1200, height: 800 } });

const FRAME: Record<string, string> = {
  v8: ".ms-Dialog-main",
  shadcn: '[data-slot="dialog-content"]',
};
const HEADER: Record<string, string> = {
  v8: ".speel-modal-bar",
  shadcn: '[data-slot="dialog-content"] > div:first-child',
};

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

async function show(
  page: Page,
  skin: string,
  style?: ModalStyle,
): Promise<Locator> {
  await open(page, js, css);
  await page.evaluate(([s, st]) => window.showModal(s as string, st as never), [
    skin,
    style ?? null,
  ] as const);
  const frame = page.locator(FRAME[skin]!);
  await expect(frame).toBeVisible();
  return frame;
}
const lines = (page: Page, n: number): Promise<void> =>
  page.evaluate((k) => window.setLines(k), n);

for (const skin of ["v8", "shadcn"]) {
  test.describe(`${skin} modal`, () => {
    test("no style: the medium preset, centred", async ({ page }) => {
      const b = await box(await show(page, skin));
      expect(b.w).toBeCloseTo(640, 0);
      expect(b.h).toBeCloseTo(560, 0);
      expect(b.x).toBeCloseTo((1200 - 640) / 2, 0);
      expect(b.y).toBeCloseTo((800 - 560) / 2, 0);
    });

    test("auto height fits the content, centred, and grows and shrinks around the centre", async ({
      page,
    }) => {
      const frame = await show(page, skin, { height: "auto" });
      const short = await box(frame);
      expect(short.h).toBeLessThan(260);
      expect(short.y + short.h / 2).toBeCloseTo(400, 0);
      await lines(page, 10);
      const tall = await box(frame);
      expect(tall.h).toBeCloseTo(short.h + 9 * 20, 0);
      expect(tall.y + tall.h / 2).toBeCloseTo(400, 0);
      await lines(page, 1);
      expect((await box(frame)).h).toBeCloseTo(short.h, 0);
    });

    test("auto height stops at 92vh, the body scrolls, the footer stays on screen", async ({
      page,
    }) => {
      const frame = await show(page, skin, { height: "auto" });
      await lines(page, 100);
      const b = await box(frame);
      expect(b.h).toBeCloseTo(736, 0);
      const body = page.getByTestId("content").locator("..");
      const scrolls = await body.evaluate(
        (el) => el.scrollHeight > el.clientHeight,
      );
      expect(scrolls).toBe(true);
      const footer = await box(page.getByTestId("footer-button"));
      expect(footer.y + footer.h).toBeLessThanOrEqual(800);
    });

    test("with top, auto height grows downward only", async ({ page }) => {
      const frame = await show(page, skin, { height: "auto", top: "40px" });
      expect((await box(frame)).y).toBeCloseTo(40, 0);
      await lines(page, 10);
      expect((await box(frame)).y).toBeCloseTo(40, 0);
      await lines(page, 100);
      const b = await box(frame);
      expect(b.y).toBeCloseTo(40, 0);
      expect(b.y + b.h).toBeCloseTo(768, 0); // the room down to 96vh
    });

    test("a top with too little room gives way so the floor fits", async ({
      page,
    }) => {
      const frame = await show(page, skin, { height: "auto", top: "95vh" });
      await lines(page, 100);
      const b = await box(frame);
      expect(b.y).toBeCloseTo(768 - 260, 0);
      expect(b.y + b.h).toBeLessThanOrEqual(800);
    });

    test("a drag takes over: the frame moves and auto height ends", async ({
      page,
    }) => {
      const frame = await show(page, skin, { height: "auto" });
      const before = await box(frame);
      const header = await box(page.locator(HEADER[skin]!));
      await page.mouse.move(header.x + 40, header.y + header.h / 2);
      await page.mouse.down();
      await page.mouse.move(header.x + 90, header.y + header.h / 2 + 30, {
        steps: 5,
      });
      await page.mouse.up();
      const moved = await box(frame);
      expect(moved.x).toBeCloseTo(before.x + 50, 0);
      expect(moved.y).toBeCloseTo(before.y + 30, 0);
      await lines(page, 10);
      expect((await box(frame)).h).toBeCloseTo(before.h, 0);
    });
  });
}
