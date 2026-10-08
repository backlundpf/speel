import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundle, open } from "./harness";
import { lineTexts, wordsWhole } from "./lines";

let js = "";
let css = "";
test.beforeAll(async () => {
  js = await bundle(path.join(__dirname, "shadcnFixture.tsx"));
  css = readFileSync(
    path.resolve(__dirname, "../../lib/styles/speel-shadcn.css"),
    "utf8",
  );
});
const show = (page: Page): Promise<void> => open(page, js, css);
const scenario = (page: Page, name: string): Locator =>
  page.locator(`section[data-scenario="${name}"]`);
const widthOf = (l: Locator): Promise<number> =>
  l.evaluate((el) => el.getBoundingClientRect().width);
/**
 * The padding the skin adds to each column: the cell's horizontal padding (`px-2`, two
 * spacing units a side) in whole pixels, as the skin lays columns out. Read from the page,
 * never assumed: the theme sets the spacing unit, and the sample's density theme shrinks it.
 */
const paddingOf = (cell: Locator): Promise<number> =>
  cell.evaluate((el) => {
    const s = getComputedStyle(el);
    return Math.round(parseFloat(s.paddingLeft) + parseFloat(s.paddingRight));
  });

test("renders the shadcn table with its styles", async ({ page }) => {
  await show(page);
  const table = scenario(page, "basic").locator("table");
  await expect(table).toBeVisible();
  // Tailwind is applied: the header cells carry the skin's padding (px-2 at the 0.2rem density spacing).
  const padding = await table
    .locator("th")
    .first()
    .evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(padding).toBe("6.4px");
});

test("the table is as wide as its columns, not its container", async ({
  page,
}) => {
  await show(page);
  const s = scenario(page, "basic");
  const padding = await paddingOf(s.locator("th").first());
  expect(await widthOf(s.locator("table"))).toBeCloseTo(
    150 + 120 + 2 * padding,
    0,
  );
});

test.describe("a header narrower than its label", () => {
  const th = (page: Page): Locator =>
    scenario(page, "narrow-header").locator("th").first();

  test("holds the column's width", async ({ page }) => {
    await show(page);
    expect(await widthOf(th(page))).toBeCloseTo(
      60 + (await paddingOf(th(page))),
      0,
    );
  });

  test("wraps the label at spaces only, as inline text", async ({ page }) => {
    await show(page);
    const label = th(page).locator('[title="Separation Date Confirmed"]');
    const lines = await label.evaluate(lineTexts);
    expect(lines.length, lines.join(" / ")).toBeGreaterThan(1);
    expect(wordsWhole(lines, "Separation Date Confirmed")).toBe(true);
    // The sort label is inline: a fragment per line (its arrow may take one more), not one
    // atomic box that the ellipsis would hide whole.
    const sort = th(page).getByRole("button", { name: /sortable/ });
    expect(
      await sort.evaluate((el) => el.getClientRects().length),
    ).toBeGreaterThanOrEqual(lines.length);
  });

  test("ends a word wider than the label box in an ellipsis", async ({
    page,
  }) => {
    await show(page);
    const box = th(page).locator("[data-header-label]");
    expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    expect(await box.evaluate((el) => getComputedStyle(el).textOverflow)).toBe(
      "ellipsis",
    );
  });

  test("keeps the filter button beside the label, inside the cell", async ({
    page,
  }) => {
    await show(page);
    const box = (await th(page).locator("[data-header-label]").boundingBox())!;
    const button = (await th(page)
      .getByRole("button", { name: "Filter Separation Date Confirmed" })
      .boundingBox())!;
    const cell = (await th(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(button.x + 0.5);
    expect(button.x + button.width).toBeLessThanOrEqual(
      cell.x + cell.width + 0.5,
    );
  });
});

test("a table wider than its container scrolls sideways", async ({ page }) => {
  await show(page);
  const scroller = scenario(page, "wide").locator(
    '[data-slot="table-container"]',
  );
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  expect(await widthOf(scroller)).toBeCloseTo(300, 0);
});

test("minWidth 100% fills the container through the growers", async ({
  page,
}) => {
  await show(page);
  const ths = scenario(page, "fill").locator("th");
  const padding = await paddingOf(ths.nth(1));
  expect((await widthOf(ths.nth(0))) + (await widthOf(ths.nth(1)))).toBeCloseTo(
    1200,
    0,
  );
  expect(await widthOf(ths.nth(1))).toBeCloseTo(70 + padding, 0); // Done holds its width
});

test("spare width no column can grow into stays empty; every column keeps its width", async ({
  page,
}) => {
  await show(page);
  const s = scenario(page, "spare");
  const ths = s.locator("th");
  const padding = await paddingOf(ths.first());
  expect(await widthOf(ths.nth(0))).toBeCloseTo(150 + padding, 0);
  expect(await widthOf(ths.nth(1))).toBeCloseTo(120 + padding, 0);
  expect(await widthOf(s.locator("table"))).toBeLessThan(1200);
});

test("a dragged column stays where it is dropped; the growers fill around it", async ({
  page,
}) => {
  await show(page);
  const s = scenario(page, "drag");
  const ths = s.locator("th");
  const before = await widthOf(ths.nth(0));
  const grip = s.getByRole("separator", { name: "Resize a" });
  // The scenario sits below the fold, and page.mouse works in viewport coordinates.
  await grip.scrollIntoViewIfNeeded();
  const box = (await grip.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, y, { steps: 5 });
  await page.mouse.up();
  const after = await widthOf(ths.nth(0));
  // Every step of the drag took, not just the first.
  expect(Math.abs(after - (before - 150))).toBeLessThanOrEqual(1);
  expect(after + (await widthOf(ths.nth(1)))).toBeCloseTo(1200, 0);
});
