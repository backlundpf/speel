import { test, expect, type Locator, type Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { lineTexts, wordsWhole } from "./lines";

const sampleDir = path.resolve(__dirname, "../..");
const fromSample = createRequire(path.join(sampleDir, "package.json"));

/**
 * One React and one Fluent in the bundle: the sample's, the versions SPFx ships.
 * `@speel/react` is a file: link, so without this its own imports would resolve from the
 * repo root's copies and the page would run two Reacts.
 */
const singleCopies: Plugin = {
  name: "single-copies",
  setup(b) {
    b.onResolve(
      { filter: /^(react|react-dom|@fluentui\/[^/]+)(\/.*)?$/ },
      (args) => ({ path: fromSample.resolve(args.path) }),
    );
  },
};

let bundle = "";
test.beforeAll(async () => {
  const out = await build({
    entryPoints: [path.join(__dirname, "fixture.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [singleCopies],
    logLevel: "silent",
  });
  bundle = out.outputFiles[0]!.text;
});

async function open(page: Page): Promise<void> {
  // A fixture that throws never sets `ready`: fail on the error itself, not on the timeout.
  const crashed = new Promise<Error>((resolve) =>
    page.once("pageerror", resolve),
  );
  await page.route("**/*", (route) => route.abort()); // offline: nothing leaves the page
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  const error = await Promise.race([
    page
      .waitForFunction(() => document.body.dataset["ready"] === "1")
      .then(() => undefined),
    crashed,
  ]);
  if (error)
    throw new Error(`The fixture threw: ${error.stack ?? error.message}`);
}
const scenario = (page: Page, name: string): Locator =>
  page.locator(`section[data-scenario="${name}"]`);
const headerCells = (s: Locator): Locator =>
  s.locator('[data-automationid="ColumnsHeaderColumn"]');
const rowCells = (s: Locator, row: number): Locator =>
  s
    .locator('[data-automationid="DetailsRow"]')
    .nth(row)
    .locator('[data-automationid="DetailsRowCell"]');
const widthOf = (l: Locator): Promise<number> =>
  l.evaluate((el) => el.getBoundingClientRect().width);

test("columns hold their authored widths", async ({ page }) => {
  await open(page);
  const cells = headerCells(scenario(page, "authored-widths"));
  // DetailsList adds 20px of cell padding to every laid-out width; the last column also
  // stretches into the container's slack.
  expect(await widthOf(cells.nth(0))).toBeCloseTo(220, 0);
  expect(await widthOf(cells.nth(1))).toBeGreaterThanOrEqual(140);
});

test.describe("header labels", () => {
  const labelled = [
    "Supervisor",
    "Supervisor",
    "Separation Date",
    "Supervisor",
  ];

  test("break only at spaces: every word stays on one line", async ({
    page,
  }) => {
    await open(page);
    const boxes = scenario(page, "headers").locator("[data-header-label]");
    for (const [i, header] of labelled.entries()) {
      const lines = await boxes.nth(i).evaluate(lineTexts);
      expect(
        wordsWhole(lines, header),
        `${header} [${i}]: ${lines.join(" / ")}`,
      ).toBe(true);
    }
  });

  test("end a word wider than the label box in an ellipsis", async ({
    page,
  }) => {
    await open(page);
    const boxes = scenario(page, "headers").locator("[data-header-label]");
    const overflows = (l: Locator): Promise<boolean> =>
      l.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(await overflows(boxes.nth(0))).toBe(true); // 92px: "Supervisor" beside the button
    expect(await overflows(boxes.nth(1))).toBe(false); // 200px: fits
    const style = await boxes
      .nth(0)
      .evaluate((el) => getComputedStyle(el).textOverflow);
    expect(style).toBe("ellipsis");
  });

  test("never run under or into the filter button", async ({ page }) => {
    await open(page);
    const cells = headerCells(scenario(page, "headers"));
    for (const i of [0, 1, 2, 3]) {
      const box = await cells
        .nth(i)
        .locator("[data-header-label]")
        .boundingBox();
      const button = await cells
        .nth(i)
        .locator('button[aria-label^="Filter"]')
        .boundingBox();
      expect(box && button, `column ${i}`).toBeTruthy();
      expect(box!.x + box!.width, `column ${i}`).toBeLessThanOrEqual(
        button!.x + 0.5,
      );
      // The button stays inside its cell even at 40px.
      const cell = await cells.nth(i).boundingBox();
      expect(button!.x + button!.width, `column ${i}`).toBeLessThanOrEqual(
        cell!.x + cell!.width + 0.5,
      );
    }
  });

  test("render headerContent in place of the label, with no sort button, beside the filter button", async ({
    page,
  }) => {
    await open(page);
    const cell = headerCells(scenario(page, "headers")).nth(4);
    const checkbox = cell.getByRole("checkbox", { name: "Select all" });
    await expect(checkbox).toBeVisible();
    await expect(cell.getByRole("button", { name: /sortable/ })).toHaveCount(0);
    await expect(cell.locator('[title="Select"]')).toHaveCount(0);
    const button = cell.getByRole("button", { name: "Filter Select" });
    await expect(button).toBeVisible();
    const box = (await checkbox.boundingBox())!;
    const filter = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(filter.x + 0.5);
    const bounds = (await cell.boundingBox())!;
    expect(filter.x + filter.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 0.5,
    );
  });
});

test.describe("body cells", () => {
  const content = (page: Page, row: number, col: number): Locator =>
    rowCells(scenario(page, "cells"), row).nth(col).locator(":scope > div");

  test("a wrap column breaks at spaces and its row grows", async ({ page }) => {
    await open(page);
    const lines = await content(page, 0, 0).evaluate(lineTexts);
    expect(lines.length).toBeGreaterThan(1);
    expect(wordsWhole(lines, "Alpha Beta Gamma Delta Epsilon")).toBe(true);
    const rows = scenario(page, "cells").locator(
      '[data-automationid="DetailsRow"]',
    );
    const tall = await rows.nth(0).boundingBox();
    const short = await rows.nth(1).boundingBox();
    expect(tall!.height).toBeGreaterThan(short!.height);
  });

  test("a word wider than a wrap column ends in an ellipsis instead of breaking", async ({
    page,
  }) => {
    await open(page);
    const el = content(page, 2, 0);
    expect(await el.evaluate(lineTexts)).toHaveLength(1);
    expect(await el.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  });

  test("hovering a cut-off cell shows its full text; a cell that fits shows none", async ({
    page,
  }) => {
    await open(page);
    const cut = content(page, 0, 1);
    await cut.hover();
    await expect(cut).toHaveAttribute("title", "Bartholomew Longname");
    const fits = content(page, 1, 1);
    await fits.hover();
    expect(await fits.getAttribute("title")).toBeNull();
  });

  test("content exactly as wide as the column counts as fitting; 1px more is cut off", async ({
    page,
  }) => {
    await open(page);
    // The cell box pads its content for focus rings; the padding must not read as overflow.
    const cells = rowCells(scenario(page, "fit"), 0);
    const exact = cells.nth(0).locator(":scope > div");
    await exact.hover();
    expect(await exact.getAttribute("title")).toBeNull();
    const over = cells.nth(1).locator(":scope > div");
    await over.hover();
    await expect(over).toHaveAttribute("title", "Over");
  });
});

test.describe("interactive cells", () => {
  /**
   * Every side on which a clipping ancestor — up to and including the row cell — cuts the
   * focused element's outline. The outline's box is the element's border box grown by
   * `outline-offset + outline-width`. Chromium paints `outline-style: auto` (the UA focus
   * ring) about 2px wide whatever its computed width reads (1px from the UA sheet), so an
   * auto outline counts as at least 2px. A clip edge is the ancestor's padding box: its
   * client rect less its borders.
   *
   * Self-contained on purpose: Playwright serialises it into the page.
   */
  function cutRing(el: Element): { outline: string; cuts: string[] } {
    const s = getComputedStyle(el);
    const width = parseFloat(s.outlineWidth) || 0;
    const grow =
      (s.outlineStyle === "auto" ? Math.max(width, 2) : width) +
      (parseFloat(s.outlineOffset) || 0);
    const r = el.getBoundingClientRect();
    const ring = {
      left: r.left - grow,
      top: r.top - grow,
      right: r.right + grow,
      bottom: r.bottom + grow,
    };
    const cuts: string[] = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const ar = a.getBoundingClientRect();
        const clip = {
          left: ar.left + parseFloat(cs.borderLeftWidth),
          top: ar.top + parseFloat(cs.borderTopWidth),
          right: ar.right - parseFloat(cs.borderRightWidth),
          bottom: ar.bottom - parseFloat(cs.borderBottomWidth),
        };
        const who = `${a.tagName.toLowerCase()}.${a.className || "(no class)"}`;
        if (ring.left < clip.left - 0.01) cuts.push(`${who} left`);
        if (ring.top < clip.top - 0.01) cuts.push(`${who} top`);
        if (ring.right > clip.right + 0.01) cuts.push(`${who} right`);
        if (ring.bottom > clip.bottom + 0.01) cuts.push(`${who} bottom`);
      }
      if ((a as HTMLElement).dataset["automationid"] === "DetailsRowCell")
        break;
    }
    return {
      outline: `${s.outlineStyle} ${s.outlineWidth} offset ${s.outlineOffset}`,
      cuts,
    };
  }

  for (const [name, selector] of [
    ["link", "a"],
    ["checkbox", 'input[type="checkbox"]'],
  ] as const) {
    test(`a focused ${name} in a titled cell keeps its whole focus ring`, async ({
      page,
    }) => {
      await open(page);
      const control = scenario(page, "focus").locator(selector);
      await control.focus();
      const { outline, cuts } = await control.evaluate(cutRing);
      expect(outline, "the focus ring is drawn").not.toMatch(/^none/);
      expect(cuts, outline).toEqual([]);
    });
  }
});

test.describe("default widths", () => {
  test("hold a column at its default hint when the header fits", async ({
    page,
  }) => {
    await open(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(0)),
    ).toBeCloseTo(90, 0);
  });

  test("raise a defaulted column until its longest header word fits", async ({
    page,
  }) => {
    await open(page);
    const cell = headerCells(scenario(page, "floor")).nth(1);
    const box = cell.locator("[data-header-label]");
    expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const lines = await box.evaluate(lineTexts);
    expect(wordsWhole(lines, "Separation Date Confirmed")).toBe(true);
    expect(await widthOf(cell)).toBeGreaterThan(90);
  });

  test("leave an authored width alone, even under the floor", async ({
    page,
  }) => {
    await open(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(2)),
    ).toBeCloseTo(80, 0);
  });
});
