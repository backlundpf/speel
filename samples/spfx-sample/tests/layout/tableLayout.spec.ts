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
