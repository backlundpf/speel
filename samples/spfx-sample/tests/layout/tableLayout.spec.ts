import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { bundle, open } from "./harness";
import { lineTexts, wordsWhole } from "./lines";

let js = "";
test.beforeAll(async () => {
  js = await bundle(path.join(__dirname, "fixture.tsx"));
});
const show = (page: Page): Promise<void> => open(page, js);

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

/** Drags column `index`'s sizer `dx` pixels with the mouse, as a user would. */
async function dragSizer(
  page: Page,
  s: Locator,
  index: number,
  dx: number,
): Promise<void> {
  const sizer = s.locator(`[data-sizer-index="${index}"]`);
  // The scenario may sit below the fold, and page.mouse works in viewport coordinates.
  await sizer.scrollIntoViewIfNeeded();
  const box = (await sizer.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.mouse.up();
}

test("columns hold their authored widths", async ({ page }) => {
  await show(page);
  const cells = headerCells(scenario(page, "authored-widths"));
  // DetailsList adds 20px of cell padding to every laid-out width. The last column does not
  // stretch into the container's slack: with no bounds the table is as wide as its columns.
  expect(await widthOf(cells.nth(0))).toBeCloseTo(220, 0);
  expect(await widthOf(cells.nth(1))).toBeCloseTo(140, 0);
});

test.describe("table bounds", () => {
  test("without bounds the last column keeps its width", async ({ page }) => {
    await show(page);
    const cells = headerCells(scenario(page, "no-stretch"));
    expect(await widthOf(cells.nth(1))).toBeCloseTo(140, 0); // 120 + 20 padding
    const table = scenario(page, "no-stretch").locator(".ms-DetailsList");
    expect(await widthOf(table)).toBeLessThan(1200);
  });

  test("minWidth 100% fills the container through the growers only", async ({
    page,
  }) => {
    await show(page);
    const cells = headerCells(scenario(page, "fill"));
    const [a, b, c] = [
      await widthOf(cells.nth(0)),
      await widthOf(cells.nth(1)),
      await widthOf(cells.nth(2)),
    ];
    expect(a + b + c).toBeCloseTo(1200, 0);
    expect(c).toBeCloseTo(90, 0); // Done holds 70 + 20
    // Notes gets twice Title's share of the spare width (±1px each for whole-pixel rounding).
    expect(Math.abs(b - 170 - 2 * (a - 170))).toBeLessThanOrEqual(2);
  });

  test("a width nothing can grow into leaves the table ending at its columns", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "spare");
    const cells = headerCells(s);
    expect(await widthOf(cells.nth(0))).toBeCloseTo(220, 0);
    expect(await widthOf(cells.nth(1))).toBeCloseTo(120, 0);
    // The rows and borders end where the columns do, as in the shadcn skin: 340, not 800.
    expect(await widthOf(s.locator(".ms-DetailsList"))).toBeCloseTo(340, 0);
  });

  test("maxWidth squeezes the shrinking columns and holds the rest", async ({
    page,
  }) => {
    await show(page);
    const cells = headerCells(scenario(page, "squeeze"));
    const [a, b, c] = [
      await widthOf(cells.nth(0)),
      await widthOf(cells.nth(1)),
      await widthOf(cells.nth(2)),
    ];
    expect(a + b + c).toBeCloseTo(400, 0);
    expect(c).toBeCloseTo(90, 0);
  });

  test("a dragged column stays where it is dropped; the growers fill around it", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "drag");
    const cells = headerCells(s);
    const before = await widthOf(cells.nth(0));
    await dragSizer(page, s, 0, -150);
    const after = await widthOf(cells.nth(0));
    expect(after).toBeLessThan(before - 100); // the drag took
    const b = await widthOf(cells.nth(1));
    expect(after + b).toBeCloseTo(1200, 0); // still fills: Notes grew into the freed width
  });

  /** Header widths of the bounded-drag scenario: Status (min 120, max 160), Owner, Due. */
  const boundedWidths = async (page: Page): Promise<number[]> => {
    const cells = headerCells(scenario(page, "bounded-drag"));
    return [
      await widthOf(cells.nth(0)),
      await widthOf(cells.nth(1)),
      await widthOf(cells.nth(2)),
    ];
  };

  test("a drag past a column's maxWidth stops there; the columns after it keep their widths", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "bounded-drag");
    await dragSizer(page, s, 0, 300);
    const [status, owner, due] = await boundedWidths(page);
    expect(status).toBeCloseTo(180, 0); // maxWidth 160 + 20 padding
    expect(owner).toBeCloseTo(150, 0);
    expect(due).toBeCloseTo(150, 0);
    // The next drag starts where the column stopped, not where the mouse went.
    await dragSizer(page, s, 0, -30);
    expect((await boundedWidths(page))[0]).toBeCloseTo(150, 0);
  });

  test("a drag past a column's minWidth stops there; the columns after it keep their widths", async ({
    page,
  }) => {
    await show(page);
    await dragSizer(page, scenario(page, "bounded-drag"), 0, -300);
    const [status, owner, due] = await boundedWidths(page);
    expect(status).toBeCloseTo(140, 0); // minWidth 120 + 20 padding
    expect(owner).toBeCloseTo(150, 0);
    expect(due).toBeCloseTo(150, 0);
  });
});

test.describe("container resize", () => {
  test("re-lays out the table without a ResizeObserver loop error", async ({
    page,
  }) => {
    await show(page);
    // The browser reports the loop as an error event on window, not as an exception.
    await page.evaluate(() => {
      const w = window as unknown as { errors: string[] };
      w.errors = [];
      window.addEventListener("error", (e) => w.errors.push(e.message));
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const s = scenario(page, "resize");
    const table = s.locator(".ms-DetailsList");
    for (const width of [700, 900, 600, 1000, 800]) {
      await s.evaluate((el, w) => (el.style.width = `${w}px`), width);
      // minWidth 100%: the table follows the container once it has been re-measured.
      await expect.poll(() => widthOf(table)).toBeCloseTo(width, 0);
    }
    // Let any notifications still pending from the last resize be delivered.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    errors.push(
      ...(await page.evaluate(
        () => (window as unknown as { errors: string[] }).errors,
      )),
    );
    expect(errors).toEqual([]);
  });
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
    await show(page);
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
    await show(page);
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
    await show(page);
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
    await show(page);
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
    await show(page);
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
    await show(page);
    const el = content(page, 2, 0);
    expect(await el.evaluate(lineTexts)).toHaveLength(1);
    expect(await el.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  });

  test("hovering a cut-off cell shows its full text; a cell that fits shows none", async ({
    page,
  }) => {
    await show(page);
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
    await show(page);
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
      await show(page);
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
    await show(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(0)),
    ).toBeCloseTo(90, 0);
  });

  test("raise a defaulted column until its longest header word fits", async ({
    page,
  }) => {
    await show(page);
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
    await show(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(2)),
    ).toBeCloseTo(80, 0);
  });

  test("align end puts the header label and the cell text at the column's end", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "align");
    const box = headerCells(s).nth(0).locator("[data-header-label]");
    const button = headerCells(s)
      .nth(0)
      .locator('button[aria-label^="Filter"]');
    const labelEnd = await box.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    const boxRight = await box.evaluate(
      (el) => el.getBoundingClientRect().right,
    );
    expect(labelEnd).toBeGreaterThan(boxRight - 12); // flush with the box end (sort-label padding allowed)
    expect(labelEnd).toBeLessThanOrEqual((await button.boundingBox())!.x + 0.5); // never under the button
    const cellBox = rowCells(s, 0).nth(0).locator(":scope > div");
    const textEnd = await cellBox.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    const contentRight = await cellBox.evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    });
    expect(Math.abs(textEnd - contentRight)).toBeLessThanOrEqual(1);
  });
});

test.describe("link buttons", () => {
  test("a long link title shows its beginning, ends cut off, and hovers its full text", async ({
    page,
  }) => {
    await show(page);
    const s = scenario(page, "link");
    const cell = rowCells(s, 0).nth(0);
    const link = cell.locator(".ms-Link");
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
    // The link cuts itself off inside the cell, so the cell never overflows: one hover text.
    const cellContent = cell.locator(":scope > div");
    expect(
      await cellContent.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await link.hover();
    await expect(link).toHaveAttribute(
      "title",
      "Due within the first fourteen days of entry",
    );
    await expect(cellContent).not.toHaveAttribute("title");
  });

  test("a link row is no taller than a plain text row", async ({ page }) => {
    await show(page);
    const s = scenario(page, "link");
    const rows = s.locator('[data-automationid="DetailsRow"]');
    const linkRow = (await rows.nth(1).boundingBox())!.height;
    const authored = scenario(page, "authored-widths")
      .locator('[data-automationid="DetailsRow"]')
      .first();
    expect(linkRow).toBeLessThanOrEqual(
      (await authored.boundingBox())!.height + 0.5,
    );
  });
});

test.describe("tooltip anchoring", () => {
  for (const name of ["tip-block", "tip-column", "tip-row"]) {
    test(`the tooltip host is the button's box (${name})`, async ({ page }) => {
      await show(page);
      const s = scenario(page, name);
      const button = s.getByRole("button", { name: "Submit" });
      const host = s.locator(".ms-TooltipHost");
      const [b, h] = [
        (await button.boundingBox())!,
        (await host.boundingBox())!,
      ];
      expect(
        Math.abs(b.x - h.x) + Math.abs(b.width - h.width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(b.y - h.y) + Math.abs(b.height - h.height),
      ).toBeLessThanOrEqual(1);
    });
  }

  test("a link with a tooltip is its host's box and still cuts itself off in a cell", async ({
    page,
  }) => {
    await show(page);
    const cell = rowCells(scenario(page, "link"), 0).nth(2);
    const link = cell.locator(".ms-Link");
    const host = cell.locator(".ms-TooltipHost");
    const [l, h] = [(await link.boundingBox())!, (await host.boundingBox())!];
    expect(
      Math.abs(l.x - h.x) + Math.abs(l.width - h.width),
    ).toBeLessThanOrEqual(1);
    expect(await link.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    const cellContent = cell.locator(":scope > div");
    expect(
      await cellContent.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await link.hover();
    await expect(link).not.toHaveAttribute("title"); // the tooltip is the hover text
    await expect(cellContent).not.toHaveAttribute("title");
  });
});
