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
  await page.route("**/*", (route) => route.abort()); // offline: nothing leaves the page
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.body.dataset["ready"] === "1");
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

  test("render headerContent in place of the label, with no sort button", async ({
    page,
  }) => {
    await open(page);
    const cell = headerCells(scenario(page, "headers")).nth(4);
    await expect(
      cell.getByRole("checkbox", { name: "Select all" }),
    ).toBeVisible();
    await expect(cell.getByRole("button", { name: /sortable/ })).toHaveCount(0);
    await expect(cell.locator('[title="Select"]')).toHaveCount(0);
  });
});
