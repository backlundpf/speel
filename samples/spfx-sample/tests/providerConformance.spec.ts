import { test, expect } from "./fixtures/auth.fixtures";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

/** The suite's size, pinned here as a literal: the Node side cannot import
 *  `@speel/core/testing` (the dist is ESM with extension-less relative imports,
 *  loadable by bundlers but not by bare Node), so the run is checked against
 *  the page's own `names()` plus this count. */
const CONFORMANCE_CASE_COUNT = 27;

/**
 * E2E: the ISharePointProvider conformance suite, run in the page against a fresh
 * SharePointProvider. The same cases run against FakeStorageProvider in
 * @speel/core's unit suite; this is the half that proves SharePoint agrees.
 * Opens the admin page — window.pd.conformance lives only there.
 */
test("provider conformance: SharePointProvider passes the suite live", async ({
  authPage,
}) => {
  test.setTimeout(600_000);
  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const { names, results } = await authPage.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    if (!pd?.conformance)
      throw new Error(
        "window.pd.conformance is not on this page — open the Admin page",
      );
    const names: string[] = pd.conformance.names();
    const results: { name: string; ok: boolean; error?: string; ms: number }[] =
      await pd.conformance.run();
    return { names, results };
  });

  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.name} (${r.ms}ms)${r.error ? ` — ${r.error}` : ""}`,
    );
  }
  // Every case ran, in order, and the suite is the size this spec expects.
  expect(names).toHaveLength(CONFORMANCE_CASE_COUNT);
  expect(new Set(names).size).toBe(CONFORMANCE_CASE_COUNT);
  expect(results.map((r) => r.name)).toEqual(names);
  expect(
    results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`),
  ).toEqual([]);
});
