import { test, expect } from "./fixtures/auth.fixtures";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

// A roomy viewport so the centered modal — and its bottom-right resize handle —
// stay on-screen after dragging (the default 720px-tall device clips them).
test.use({ viewport: { width: 1600, height: 1000 } });

/**
 * Live coverage for the @speel/react imperative surfaces (showForm) used by the
 * dashboard: a centered modal for create/view, a side panel for edit, sectioned
 * form layout, the modal chrome (fullscreen toggle + top-right close + resize
 * handle), and the awaitable submit → toast path. The CRUD test is self-cleaning
 * (it deletes the project it creates).
 */

test("surfaces lifecycle: create (modal + sections) → view → edit (panel) → delete", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const dash = new ProjectDashboardPage(authPage);
  await dash.open();

  const title = `E2E Surface ${Date.now()}`;

  // --- Create via showForm({ surface: 'modal' }) ---
  await dash.clickNewProject();
  const modal = dash.modal();
  await expect(modal).toBeVisible();

  // Sectioned layout: every FormSection heading renders.
  for (const section of ["Basics", "Team", "Details", "Categorization"]) {
    await expect(dash.sectionHeading(modal, section)).toBeVisible();
  }
  // Modal chrome affordances are present.
  await expect(dash.fullscreenToggle(modal)).toBeVisible();
  await expect(dash.modalClose(modal)).toBeVisible();
  await expect(dash.resizeHandle(modal)).toBeVisible();

  await dash.fillValidProject(title);
  await dash.saveButton(modal).click();

  // Awaitable submit resolved 'submit' after a real save → toast + new row.
  await expect(dash.toast("Project created")).toBeVisible({ timeout: 60_000 });
  await expect(modal).toBeHidden();
  await expect(dash.titleLink(title)).toBeVisible({ timeout: 45_000 });

  // --- View via showForm({ surface: 'modal', mode: 'view' }) ---
  await dash.titleLink(title).click();
  const viewModal = dash.modal();
  await expect(viewModal).toBeVisible();
  await expect(viewModal.getByText(title).first()).toBeVisible();
  await dash.modalClose(viewModal).click();
  await expect(viewModal).toBeHidden();

  // --- Edit via showForm({ surface: 'panel', mode: 'edit' }) ---
  await dash.rowAction(title, "Edit").click();
  const panel = dash.panel();
  await expect(panel).toBeVisible();
  await dash.selectChoice(panel, "Status", "Active");
  await dash.saveButton(panel).click();
  await expect(dash.toast("Project saved")).toBeVisible({ timeout: 60_000 });
  await expect(panel).toBeHidden();

  // --- Delete (cleanup) via the row action ---
  await dash.rowAction(title, "Delete").click();
  await expect(dash.toast("Project deleted")).toBeVisible({ timeout: 60_000 });
  await expect(dash.titleLink(title)).toHaveCount(0, { timeout: 45_000 });
});

test("surfaces chrome: title in header, sticky footer, draggable, resizable, fullscreen, close", async ({
  authPage,
}) => {
  test.setTimeout(120_000);
  const dash = new ProjectDashboardPage(authPage);
  await dash.open();

  await dash.clickNewProject();
  const modal = dash.modal();
  await expect(modal).toBeVisible();

  // Title lives in the sticky header bar; the footer action is visible without
  // scrolling even though the create form is tall (header + actions always shown).
  await expect(dash.modalBar(modal)).toContainText("New project");
  await expect(dash.saveButton(modal)).toBeVisible();

  // Responsive field grid: at the default width the short fields pair into columns,
  // so Title and Status sit on the same row (same top), while the note field is full width.
  const top = async (label: string) =>
    (await modal.getByText(label, { exact: true }).first().boundingBox())!.y;
  expect(Math.abs((await top("Title")) - (await top("Status")))).toBeLessThan(
    12,
  );

  // Resizable by the corner handle (do this first, while the modal is centered and
  // the handle is comfortably on-screen).
  const boxBefore = (await modal.boundingBox())!;
  const handle = (await dash.resizeHandle(modal).boundingBox())!;
  await authPage.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await authPage.mouse.down();
  await authPage.mouse.move(handle.x + 160, handle.y + 100, { steps: 10 });
  await authPage.mouse.up();
  await expect
    .poll(async () => (await modal.boundingBox())!.width, { timeout: 10_000 })
    .toBeGreaterThan(boxBefore.width + 40);
  // The top-left corner stays anchored while resizing (only the bottom-right grows).
  const boxAfter = (await modal.boundingBox())!;
  expect(Math.abs(boxAfter.x - boxBefore.x)).toBeLessThan(6);
  expect(Math.abs(boxAfter.y - boxBefore.y)).toBeLessThan(6);

  // Draggable by the header (grab the title area, left of the icon buttons).
  const box0 = (await modal.boundingBox())!;
  const bar = (await dash.modalBar(modal).boundingBox())!;
  await authPage.mouse.move(bar.x + 40, bar.y + bar.height / 2);
  await authPage.mouse.down();
  await authPage.mouse.move(bar.x + 180, bar.y + bar.height / 2 + 90, {
    steps: 10,
  });
  await authPage.mouse.up();
  const boxDragged = (await modal.boundingBox())!;
  expect(
    Math.abs(boxDragged.x - box0.x) + Math.abs(boxDragged.y - box0.y),
  ).toBeGreaterThan(50);

  // Fullscreen widens further.
  const widthResized = boxDragged.width;
  await dash.fullscreenToggle(modal).click();
  await expect
    .poll(async () => (await modal.boundingBox())?.width ?? 0, {
      timeout: 10_000,
    })
    .toBeGreaterThan(widthResized);

  // Top-right close dismisses without persisting anything.
  await dash.modalClose(modal).click();
  await expect(modal).toBeHidden();
});
