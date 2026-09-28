import { test, expect } from "./fixtures/auth.fixtures";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

test("opens the page, authenticates, and runs the speel actions", async ({
  authPage,
}) => {
  const dashboard = new ProjectDashboardPage(authPage);

  // Capture console BEFORE navigating so we don't miss the init banner.
  const consoleWatch = dashboard.watchConsole();

  // Open the admin page with debug scripts, accept the prompt, wait for window.pd (proves
  // onInit/_initSpeel ran).
  await dashboard.open("admin");

  // 1. The auto-run runAll() completed, and logged no speel errors.
  await expect
    .poll(() => consoleWatch.isDemoComplete(), { timeout: 90_000 })
    .toBe(true);
  expect(
    consoleWatch.errors(),
    `speel logged error(s):\n${consoleWatch.errors().join("\n")}`,
  ).toHaveLength(0);

  // 2. Hard data assertion: live reads return real, well-formed data.
  const projects = await dashboard.readProjects();
  expect(Array.isArray(projects)).toBe(true);
  for (const p of projects) {
    expect(typeof p.Id).toBe("number");
    expect(typeof p.Title).toBe("string");
  }

  const highPriority = await dashboard.countHighPriorityActive();
  expect(highPriority).toBeGreaterThanOrEqual(0);
});
