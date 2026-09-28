import { test, expect } from "./fixtures/auth.fixtures";
import type { ConsoleMessage } from "@playwright/test";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

/**
 * Live check for the Fluent v8 skin: the spfx-sample renders the @speel/react field
 * components against SharePoint's externalized shared Fluent v8 runtime, so there is no
 * second Fluent bundle and none of the style/focus conflicts a duplicate Fluent runtime
 * would cause (Griffel "conflicting ids", Tabster "mover used before initialization").
 *
 * The project page is the v8 surface: its "New project" form renders text fields
 * (`.ms-TextField`) and selection fields (Fluent ComboBox). We load it, reload a couple
 * of times to confirm stability, open the form on every load, and assert the fields
 * render with no dual-runtime noise on any load.
 */
test("field demo (v8): renders cleanly on the live page across reloads", async ({
  authPage,
}, testInfo) => {
  test.setTimeout(300_000);
  const dashboard = new ProjectDashboardPage(authPage);
  const lines: string[] = [];
  const results: {
    label: string;
    textFields: number;
    comboboxes: number;
    consoleErrors: number;
    dualRuntimeNoise: boolean;
  }[] = [];

  async function snapshot(label: string) {
    const errs: string[] = [];
    const pageErrs: string[] = [];
    const onErr = (m: ConsoleMessage) => {
      if (m.type() === "error")
        errs.push(m.text().replace(/\s+/g, " ").slice(0, 110));
    };
    const onPageErr = (e: Error) => pageErrs.push(`${e.name}: ${e.message}`);
    authPage.on("console", onErr);
    authPage.on("pageerror", onPageErr);

    await dashboard.clickNewProject();
    const modal = dashboard.modal();
    await modal
      .locator(".ms-TextField")
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    await authPage.waitForTimeout(2000);

    const textFields = await modal.locator(".ms-TextField").count();
    const comboboxes = await modal.getByRole("combobox").count();
    const style = await modal.evaluate((root) => {
      const el = root.querySelector(
        ".ms-TextField input",
      ) as HTMLElement | null;
      if (!el) return "no ms-TextField";
      const cs = getComputedStyle(el);
      return `borderBottom=${cs.borderBottomWidth}/${cs.borderBottomStyle} color=${cs.color}`;
    });
    // Any sign of a *second* Fluent runtime (v9/Griffel/Tabster) — should never appear on v8.
    const dualRuntimeNoise =
      pageErrs.some((e) =>
        /modalizer|mover|Tabster|conflicting ids/i.test(e),
      ) ||
      errs.some((e) =>
        /mover API used before initialization|modalizer|conflicting ids/i.test(
          e,
        ),
      );

    await dashboard.modalClose(modal).click();
    await modal.waitFor({ state: "hidden" });

    authPage.off("console", onErr);
    authPage.off("pageerror", onPageErr);
    results.push({
      label,
      textFields,
      comboboxes,
      consoleErrors: errs.length,
      dualRuntimeNoise,
    });
    lines.push(
      `[${label}] textFields=${textFields} comboboxes=${comboboxes} ` +
        `dualRuntimeNoise=${dualRuntimeNoise} pageErrors=${pageErrs.length} consoleErrors=${errs.length}`,
      `   ms-TextField: ${style}`,
      ...(errs.length
        ? [`   consoleErrors: ${errs.slice(0, 4).join(" | ")}`]
        : []),
    );
  }

  await dashboard.open("project");
  await snapshot("load-0");
  for (let i = 1; i <= 2; i++) {
    await authPage.reload({ waitUntil: "domcontentloaded" });
    await dashboard.loadDebugScripts(8000).catch(() => {});
    await dashboard.waitForProjectPage();
    await snapshot(`reload-${i}`);
  }

  const report = [
    "===== FLUENT v8 — RENDER + CLEAN CONSOLE =====",
    ...lines,
    "==============================================",
  ].join("\n");
  console.log("\n" + report + "\n");
  await testInfo.attach("v8-diagnostics.txt", {
    body: report,
    contentType: "text/plain",
  });

  // The v8 skin must render text and selection fields on every load and never
  // emit Fluent dual-runtime noise.
  for (const r of results) {
    expect(r.textFields, r.label).toBeGreaterThan(0);
    expect(r.comboboxes, r.label).toBeGreaterThan(0);
  }
  expect(results.every((r) => !r.dualRuntimeNoise)).toBe(true);
});
