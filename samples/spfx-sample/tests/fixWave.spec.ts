import { test, expect } from "./fixtures/auth.fixtures";
import type { Page } from "@playwright/test";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

test.use({ viewport: { width: 1600, height: 1000 } });

/**
 * Live checks for behaviour jsdom cannot show (Fluent v8 skin): the required marker's
 * asterisk, tooltips on keyboard focus inside a ContextualMenu, FocusZone Tab handling
 * between cell editors, and virtualization inside a modal. Drives the dashboard's
 * "Fix wave demo" section (FixWaveDemo.tsx); creates no list data.
 */

/** A visible Fluent v8 tooltip. v8 sets no `role="tooltip"`; its text reaches screen readers
 *  through the trigger's `aria-describedby` (unit-tested), so match the callout itself. */
const v8Tooltip = (page: Page, text: string) =>
  page.locator(".ms-Tooltip").filter({ hasText: text });

async function openDemo(page: Page) {
  const dash = new ProjectDashboardPage(page);
  await dash.open();
  const demo = page.getByRole("region", { name: "Fix wave demo" });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toBeVisible({ timeout: 60_000 });
  return demo;
}

test("help text under the edit field, an info icon on the view field", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  await expect(
    demo.getByText("Last name as printed on the check").first(),
  ).toBeVisible();
  const info = demo.getByRole("button", {
    name: "More information about Donor name (view)",
  });
  await info.focus();
  await expect(
    v8Tooltip(authPage, "Last name as printed on the check"),
  ).toBeVisible();
});

test("required currency field: asterisk, label above the USD prefix", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  const input = demo.getByRole("spinbutton", { name: "Amount" });
  await expect(input).toHaveAttribute("aria-required", "true");
  const label = demo.locator(`label[for="${await input.getAttribute("id")}"]`);
  const after = await label.evaluate(
    (el) => getComputedStyle(el, "::after").content,
  );
  expect(after).toContain("*");
  const labelBox = (await label.boundingBox())!;
  const prefixBox = (await demo
    .getByText("USD", { exact: true })
    .boundingBox())!;
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(prefixBox.y + 1);
});

test("a disabled menu item shows its tooltip on keyboard focus", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  const item = authPage.getByRole("menuitem", { name: "Resend notifications" });
  // On this page a v8 ContextualMenu sometimes closes right after it opens, with or without
  // tooltips (measured: 5/6 stay open either way; a pre-existing V8Menu behaviour) — so
  // open it until it stays. ContextualMenu focuses its first item on open — the disabled
  // one — and its tooltip shows on that focus.
  await expect(async () => {
    if (await item.isVisible()) await authPage.keyboard.press("Escape");
    await demo.getByRole("button", { name: "More actions" }).click();
    await expect(item).toBeFocused({ timeout: 1_000 });
    await expect(
      v8Tooltip(authPage, "Nothing to resend until the stage starts"),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // Arrow away and back: the disabled item is in the roving order.
  await authPage.keyboard.press("ArrowDown");
  await expect(
    authPage.getByRole("menuitem", { name: "Export" }),
  ).toBeFocused();
  await authPage.keyboard.press("ArrowUp");
  await expect(item).toBeFocused();
  await authPage.keyboard.press("Enter");
  await expect(item).toBeVisible(); // nothing ran, the menu did not close on it
});

test("modal and panel are named; the panel's Close button is named", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  // Fluent's role="dialog" element is a zero-size wrapper (its content is positioned), so
  // assert the named dialog exists rather than that the wrapper box is visible.
  await demo.getByRole("button", { name: "Open bulk entry" }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Bulk entry" }),
  ).toBeAttached();
  await authPage.keyboard.press("Escape");
  await expect(
    authPage.getByRole("dialog", { name: "Bulk entry" }),
  ).not.toBeAttached();
  await demo.getByRole("button", { name: "Open demo panel" }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Demo panel" }),
  ).toBeAttached();
  await authPage.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Demo panel" }),
  ).not.toBeAttached();
});

test("bulk entry in a modal: every row reachable, Tab walks the cells", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  await demo.getByRole("button", { name: "Open bulk entry" }).click();
  const modal = authPage.getByRole("dialog", { name: "Bulk entry" });
  // Row 60 exists and scrolls into view inside the modal body.
  const last = modal.getByRole("textbox", {
    name: "Title for row 60",
    exact: true,
  });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  // Tab: Title 1 → Note 1 → row 1's actions → Title 2.
  await modal
    .getByRole("textbox", { name: "Title for row 1", exact: true })
    .focus();
  await authPage.keyboard.press("Tab");
  await expect(
    modal.getByRole("textbox", { name: "Note for row 1", exact: true }),
  ).toBeFocused();
  await authPage.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "edit row 1", exact: true }),
  ).toBeFocused();
  await authPage.keyboard.press("Tab");
  await expect(
    modal.getByRole("textbox", { name: "Title for row 2", exact: true }),
  ).toBeFocused();
  await authPage.keyboard.press("Shift+Tab");
  await expect(
    modal.getByRole("button", { name: "edit row 1", exact: true }),
  ).toBeFocused();
  // Delete is offered only on even rows.
  await expect(
    modal.getByRole("button", { name: "delete row 2", exact: true }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "delete row 1", exact: true }),
  ).toHaveCount(0);
});

test("a virtualized table in a modal draws its rows to the end", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  await demo.getByRole("button", { name: "Open long list" }).click();
  const modal = authPage.getByRole("dialog", { name: "Long list" });
  await expect(modal.getByText("Program 1", { exact: true })).toBeVisible();
  // Scroll the modal's own body (the scroll parent the virtualized list measures) to the
  // end, as a user would, until the list has measured and drawn the last row.
  // Scoped to speel's frame: Fluent's own outer content box also carries the attribute.
  const body = authPage
    .locator('.speel-modal [data-is-scrollable="true"]')
    .first();
  await expect(async () => {
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(modal.getByText("Program 150", { exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
});
