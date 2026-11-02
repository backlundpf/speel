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
  await expect(authPage.getByRole("tooltip")).toContainText(
    "Last name as printed on the check",
  );
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
  await demo.getByRole("button", { name: "More actions" }).click();
  const item = authPage.getByRole("menuitem", { name: "Resend notifications" });
  await expect(item).toBeVisible();
  // Arrow through the menu: the disabled item is in the roving order.
  await authPage.keyboard.press("ArrowDown");
  await expect(item).toBeFocused();
  await expect(authPage.getByRole("tooltip")).toContainText(
    "Nothing to resend until the stage starts",
  );
  await authPage.keyboard.press("Enter");
  await expect(item).toBeVisible(); // nothing ran, the menu did not close on it
});

test("modal and panel are named; the panel's Close button is named", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  await demo.getByRole("button", { name: "Open bulk entry" }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Bulk entry" }),
  ).toBeVisible();
  await authPage.keyboard.press("Escape");
  await demo.getByRole("button", { name: "Open demo panel" }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Demo panel" }),
  ).toBeVisible();
  await authPage.getByRole("button", { name: "Close" }).click();
  await expect(
    authPage.getByRole("dialog", { name: "Demo panel" }),
  ).toBeHidden();
});

test("bulk entry in a modal: every row reachable, Tab walks the cells", async ({
  authPage,
}) => {
  const demo = await openDemo(authPage);
  await demo.getByRole("button", { name: "Open bulk entry" }).click();
  const modal = authPage.getByRole("dialog", { name: "Bulk entry" });
  // Row 60 exists and scrolls into view inside the modal body.
  const last = modal.getByRole("textbox", { name: "Title for row 60" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  // Tab: Title 1 → Note 1 → row 1's actions → Title 2.
  await modal.getByRole("textbox", { name: "Title for row 1" }).focus();
  await authPage.keyboard.press("Tab");
  await expect(
    modal.getByRole("textbox", { name: "Note for row 1" }),
  ).toBeFocused();
  await authPage.keyboard.press("Tab");
  await expect(modal.getByRole("button", { name: "edit row 1" })).toBeFocused();
  await authPage.keyboard.press("Tab");
  await expect(
    modal.getByRole("textbox", { name: "Title for row 2" }),
  ).toBeFocused();
  await authPage.keyboard.press("Shift+Tab");
  await expect(modal.getByRole("button", { name: "edit row 1" })).toBeFocused();
  // Delete is offered only on even rows.
  await expect(
    modal.getByRole("button", { name: "delete row 2" }),
  ).toBeVisible();
  await expect(modal.getByRole("button", { name: "delete row 1" })).toHaveCount(
    0,
  );
});
