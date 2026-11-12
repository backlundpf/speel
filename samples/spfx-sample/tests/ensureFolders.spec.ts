import { test, expect } from "./fixtures/auth.fixtures";
import { loadEnv } from "./helpers/env";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

/**
 * E2E: DbSet.ensureFoldersAsync against real SharePoint (#118). One call mixes an
 * existing folder, new siblings, a new folder under the existing one, and a
 * SharePoint-invalid name with a child under it. It pins the facts a unit test
 * cannot:
 *
 * - "already exists" inside a $batch is recognized as success (or the verb is
 *   idempotent) — isFolderExistsError's match;
 * - SharePoint keeps processing a $batch after one sub-request fails;
 * - folders created through AddSubFolderUsingPath on the parent are LIST folders
 *   (a list item with FSObjType=1 backs each one).
 *
 * The run-scoped root is recycled afterwards. Live tenant only (PW_E2E).
 */
test("ensureFoldersAsync: mixed new, existing and invalid paths in one call", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const out = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const set = pd.ctx.projects;
    const root = `SpeelE2E/ensure-${Date.now()}`;
    const paths = [
      `${root}/existing`,
      `${root}/n1`,
      `${root}/n2`,
      `${root}/n3`,
      `${root}/existing/child`,
      `${root}/bad*name`,
      `${root}/bad*name/child`,
    ];
    try {
      // Pre-create one folder, so the batched call meets SharePoint's real
      // "already exists" response. Were isFolderExistsError's match wrong,
      // results[0] would come back requestFailed carrying that message.
      await set.ensureFolderAsync(`${root}/existing`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = await set.ensureFoldersAsync(paths);

      const fsObjTypes: number[] = [];
      for (const r of results) {
        if (!r.ok) continue;
        const url = String(r.value).replace(/'/g, "''");
        const res = await fetch(
          `${webAbs}/_api/web/getFolderByServerRelativePath(decodedurl='${url}')/ListItemAllFields?$select=FSObjType`,
          {
            headers: { Accept: "application/json;odata=nometadata" },
            credentials: "include",
          },
        );
        fsObjTypes.push(res.ok ? (await res.json()).FSObjType : -res.status);
      }

      return {
        paths,
        // `cause` holds PnPjs error objects; strip it so the result serializes.
        results: results.map((r) =>
          r.ok
            ? { ok: true, value: r.value }
            : {
                ok: false,
                errors: r.errors.map(
                  (e: { code: string; message: string; status?: number }) => ({
                    code: e.code,
                    message: e.message,
                    status: e.status,
                  }),
                ),
              },
        ),
        fsObjTypes,
      };
    } finally {
      await set.deleteFolderAsync(root).catch(() => {});
    }
  }, webAbs);

  console.log(
    "[ensureFolders] invalid-name failure:",
    JSON.stringify(out.results[5]),
  );

  for (let i = 0; i <= 4; i++) {
    expect(out.results[i], out.paths[i]).toMatchObject({ ok: true });
    expect(out.results[i]!.value!.endsWith(`/${out.paths[i]}`)).toBe(true);
  }
  expect(out.results[5]).toMatchObject({
    ok: false,
    errors: [{ code: "requestFailed" }],
  });
  expect(typeof out.results[5]!.errors![0]!.status).toBe("number");
  expect(out.results[6]).toMatchObject({
    ok: false,
    errors: [{ code: "parentFailed" }],
  });
  expect(out.fsObjTypes).toEqual([1, 1, 1, 1, 1]);
});
