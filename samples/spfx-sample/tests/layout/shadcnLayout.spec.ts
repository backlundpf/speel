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

/** The right edge of an element's contents, as laid out. */
const contentsRight = (l: Locator): Promise<number> =>
  l.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().right;
  });
const bodyRows = (s: Locator): Locator => s.locator("tbody tr");
const rowCells = (s: Locator, row: number): Locator =>
  bodyRows(s).nth(row).locator("td");

test("align end puts the header label and the cell text at the column's end", async ({
  page,
}) => {
  await show(page);
  const s = scenario(page, "align");
  const th = s.locator("th").first();
  const box = th.locator("[data-header-label]");
  const button = th.getByRole("button", { name: "Filter Open items" });
  const labelEnd = await contentsRight(box);
  const boxRight = await box.evaluate((el) => el.getBoundingClientRect().right);
  expect(labelEnd).toBeGreaterThan(boxRight - 1); // flush with the box end
  expect(labelEnd).toBeLessThanOrEqual((await button.boundingBox())!.x + 0.5); // never under the button
  const td = rowCells(s, 0).first();
  const textEnd = await contentsRight(td);
  const contentRight = await td.evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().right - parseFloat(cs.paddingRight);
  });
  expect(Math.abs(textEnd - contentRight)).toBeLessThanOrEqual(1);
});

test.describe("links", () => {
  test("a long link shows its beginning, ends cut off, and hovers its full text", async ({
    page,
  }) => {
    await show(page);
    const cell = rowCells(scenario(page, "link"), 0).first();
    const link = cell.locator("a");
    const firstCharLeft = await link.evaluate((el) => {
      const node = document
        .createTreeWalker(el, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      const r = document.createRange();
      r.setStart(node, 0);
      r.setEnd(node, 1);
      return r.getBoundingClientRect().left;
    });
    const cellBox = (await cell.boundingBox())!;
    expect(firstCharLeft).toBeGreaterThanOrEqual(cellBox.x); // the beginning is visible
    expect(await link.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    expect(await link.evaluate((el) => getComputedStyle(el).textOverflow)).toBe(
      "ellipsis",
    );
    // The link cuts itself off inside the cell, so the cell never overflows: one hover text.
    expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await link.hover();
    await expect(link).toHaveAttribute(
      "title",
      "Due within the first fourteen days of entry",
    );
    await expect(cell).not.toHaveAttribute("title");
  });

  test("a link row is no taller than a plain text row", async ({ page }) => {
    await show(page);
    // Both the last row of their table: the body's last row has no bottom border. That row
    // holds a link of each form.
    const linkRow = (await bodyRows(scenario(page, "link"))
      .nth(1)
      .boundingBox())!;
    const plainRow = (await bodyRows(scenario(page, "basic"))
      .first()
      .boundingBox())!;
    expect(linkRow.height).toBeLessThanOrEqual(plainRow.height + 0.5);
  });

  test("a link with href and one without look the same, at rest and hovered", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "link");
    const anchor = rowCells(s, 1).nth(0).locator("a");
    const button = rowCells(s, 1).nth(1).locator("button");
    const look = (l: Locator) =>
      l.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          fontWeight: cs.fontWeight,
          textDecorationLine: cs.textDecorationLine,
          cursor: cs.cursor,
        };
      });
    const decoration = (l: Locator) =>
      l.evaluate((el) => getComputedStyle(el).textDecorationLine);

    const [a, b] = [await look(anchor), await look(button)];
    expect(b).toEqual(a);
    expect(a.textDecorationLine).toBe("none");
    expect(a.cursor).toBe("pointer");
    // The theme's link colour, not the cell's text colour.
    const textColor = await rowCells(s, 1)
      .nth(2)
      .evaluate((el) => getComputedStyle(el).color);
    expect(a.color).not.toBe(textColor);

    await anchor.hover();
    const aHovered = await decoration(anchor);
    await button.hover();
    const bHovered = await decoration(button);
    expect(aHovered).toBe("underline");
    expect(bHovered).toBe(aHovered);
  });
});

test.describe("tooltip anchoring", () => {
  for (const name of ["tip-block", "tip-column", "tip-row"]) {
    test(`the tooltip trigger is the button's box (${name})`, async ({
      page,
    }) => {
      await show(page);
      const button = scenario(page, name).getByRole("button", {
        name: "Submit",
      });
      const trigger = button.locator("xpath=..");
      const [b, t] = [
        (await button.boundingBox())!,
        (await trigger.boundingBox())!,
      ];
      expect(
        Math.abs(b.x - t.x) + Math.abs(b.width - t.width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(b.y - t.y) + Math.abs(b.height - t.height),
      ).toBeLessThanOrEqual(1);
    });
  }
});
