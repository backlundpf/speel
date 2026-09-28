import { test, expect } from "./fixtures/auth.fixtures";
import { loadEnv } from "./helpers/env";
import { ProjectDashboardPage } from "./pages/projectDashboard.page";

/**
 * E2E: add(entity, { folder }) places a new list item inside a list-relative folder.
 * Creates the folder tree as proper list folders if missing, adds a Project into it,
 * asserts the item's FileDirRef is the folder, then removes the item (the folder is
 * left in place — folder deletion is out of scope). Live tenant only (PW_E2E).
 */
test("folder placement: add({ folder }) lands the item inside the folder", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const folder = `SpeelE2E/${new Date().getFullYear()}`;

    const p = new pd.Project();
    p.Title = `speel e2e folder ${Date.now()}`;
    p.Status = "Planning";
    p.Priority = "Low";
    p.DueDate = new Date(Date.now() + 30 * 86_400_000);
    p.IsPublic = false;

    pd.ctx.projects.add(p, { folder });
    await pd.ctx.saveChangesAsync();
    const id: number = p.Id;

    const r = await fetch(
      `${webAbs}/_api/web/lists/getByTitle('Projects')/items(${id})?$select=FileDirRef`,
      {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      },
    );
    const fileDirRef: string = (await r.json()).FileDirRef;

    pd.ctx.projects.remove(p);
    await pd.ctx.saveChangesAsync();

    return { id, fileDirRef };
  }, webAbs);

  expect(result.id).toBeGreaterThan(0);
  // The item physically lives in the SpeelE2E/<year> folder (not the list root).
  expect(result.fileDirRef).toMatch(/\/SpeelE2E\/\d{4}$/);
});

/**
 * E2E: the folder add path posts through addValidateUpdateItemUsingPath, which takes
 * stringified form values rather than JSON. This pins the live-verified fact a
 * unit test cannot prove: a multi-value Lookup lands as an
 * SPFieldLookupValueCollection (`id;#` pairs).
 *
 * Person columns are covered by the two tests below. They take a third encoding
 * again — a claims-Key array — and SharePoint reports no error for the forms it
 * rejects, so only a read-back proves anything there either.
 */
test("folder placement: a multi-value lookup survives the round-trip", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const json = async (url: string) => {
      const r = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    };

    const tags: { Id: number }[] = (
      await json(
        `${webAbs}/_api/web/lists/getByTitle('Tags')/items?$select=Id&$top=2`,
      )
    ).value;
    const tagIds = tags.map((t) => t.Id);

    const p = new pd.Project();
    p.Title = `speel e2e multilookup ${Date.now()}`;
    p.Status = "Planning";
    p.Priority = "Low";
    p.DueDate = new Date(Date.now() + 30 * 86_400_000);
    p.IsPublic = false;
    p.TagsId = tagIds;

    pd.ctx.projects.add(p, { folder: `SpeelE2E/${new Date().getFullYear()}` });
    await pd.ctx.saveChangesAsync();
    const id: number = p.Id;

    const row = await json(
      `${webAbs}/_api/web/lists/getByTitle('Projects')/items(${id})` +
        `?$select=FileDirRef,TagsId`,
    );

    pd.ctx.projects.remove(p);
    await pd.ctx.saveChangesAsync();

    return {
      id,
      sentTagIds: tagIds,
      storedTagIds: row.TagsId,
      fileDirRef: row.FileDirRef,
    };
  }, webAbs);

  expect(result.id).toBeGreaterThan(0);
  expect(result.fileDirRef).toMatch(/\/SpeelE2E\/\d{4}$/);

  // The collection string resolved server-side: every id we sent came back.
  expect(result.sentTagIds.length).toBeGreaterThan(0);
  expect(result.storedTagIds).toEqual(result.sentTagIds);
});

/**
 * E2E: a multi-value Choice column on a foldered add. The folder path stringifies
 * every field through addValidateUpdateItemUsingPath, and that API returns HTTP 200
 * with HasException false even for encodings it silently discards — so the only
 * proof that SPFieldMultiChoiceValue (`;#A;#B;#`) is understood is reading the value
 * back. A root add of the same values is the control: it posts JSON, not form values.
 */
test("folder placement: a multi-choice survives the round-trip", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const json = async (url: string) => {
      const r = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    };
    const sent = ["Compliance", "Security"];

    const mk = (title: string) => {
      const p = new pd.Project();
      p.Title = title;
      p.Status = "Planning";
      p.Priority = "Low";
      p.DueDate = new Date(Date.now() + 30 * 86_400_000);
      p.IsPublic = false;
      p.Labels = sent;
      return p;
    };

    const foldered = mk(`speel e2e multichoice folder ${Date.now()}`);
    pd.ctx.projects.add(foldered, {
      folder: `SpeelE2E/${new Date().getFullYear()}`,
    });
    await pd.ctx.saveChangesAsync();

    const root = mk(`speel e2e multichoice root ${Date.now()}`);
    pd.ctx.projects.add(root);
    await pd.ctx.saveChangesAsync();

    const read = async (id: number) =>
      json(
        `${webAbs}/_api/web/lists/getByTitle('Projects')/items(${id})?$select=Labels,FileDirRef`,
      );
    const res = {
      sent,
      foldered: await read(foldered.Id),
      root: await read(root.Id),
    };

    pd.ctx.projects.remove(foldered);
    pd.ctx.projects.remove(root);
    await pd.ctx.saveChangesAsync();
    return res;
  }, webAbs);

  // The item really went through the form-values path, not the JSON one.
  expect(result.foldered.FileDirRef).toMatch(/\/SpeelE2E\/\d{4}$/);
  expect(result.root.FileDirRef).not.toMatch(/\/SpeelE2E\//);

  // Every value survived, and the folder path agrees with the JSON control.
  expect(result.foldered.Labels).toEqual(result.sent);
  expect(result.root.Labels).toEqual(result.sent);
});

/**
 * E2E: person columns on the folder add path.
 *
 * `addValidateUpdateItemUsingPath` answers HTTP 200 with `HasException: false`
 * for encodings it silently DISCARDS — the lookup-collection form and a bare id
 * both store nothing while reporting success, which is exactly how the original
 * bug hid. So nothing here is asserted from the call succeeding: every value is
 * read back over REST and compared to what was sent.
 *
 * One save covers all three shapes:
 *
 * - `OwnerId` — a SINGLE-value person column. This is the shipped bug: it used
 *   to be dropped without a word.
 * - `ReviewersId` — a MULTI-value person column.
 * - a GROUP inside `ReviewersId`. Reviewers is `SelectionMode: 1`
 *   (PeopleAndGroups), so it takes them. A group's claims Key is its plain
 *   title rather than an `i:0#.f|…` string, so one uniform rule covers both
 *   kinds and nothing branches on PrincipalType.
 *
 * `FileDirRef` is asserted too: without it this could pass while quietly
 * exercising the JSON add path instead of the form-values one.
 */
test("folder placement: person columns store a user, a group and a multi-value set", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const json = async (url: string) => {
      const r = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    };

    // Diagnostics only: capture what actually went on the wire, so a failure
    // reports the sent encoding rather than just the stored result.
    const sentBodies: string[] = [];
    const origFetch = window.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).fetch = (...args: any[]) => {
      try {
        const url =
          typeof args[0] === "string" ? args[0] : String(args[0]?.url ?? "");
        const body = typeof args[1]?.body === "string" ? args[1].body : "";
        if (/AddValidateUpdateItemUsingPath/i.test(url + body)) {
          sentBodies.push(body);
        }
      } catch {
        /* diagnostics must never break the run */
      }
      return origFetch.apply(window, args as Parameters<typeof fetch>);
    };

    try {
      // Real principals off the live web. Members carry an `i:0#.f|membership|`
      // login; the system and app principals are filtered out.
      const users: {
        Id: number;
        Title: string;
        LoginName: string;
        PrincipalType: number;
      }[] = (
        await json(
          `${webAbs}/_api/web/siteusers?$select=Id,Title,LoginName,PrincipalType&$top=200`,
        )
      ).value;
      const people = users.filter(
        (u) =>
          u.PrincipalType === 1 && /^i:0#\.f\|membership\|/.test(u.LoginName),
      );
      const groups: { Id: number; Title: string; LoginName: string }[] = (
        await json(
          `${webAbs}/_api/web/sitegroups?$select=Id,Title,LoginName&$top=100`,
        )
      ).value;
      // Prefer an associated group: it is guaranteed to exist in the User
      // Information List, which is where the write Key is resolved from.
      const group =
        groups.find((g) => /Owners|Members|Visitors/i.test(g.Title)) ??
        groups[0];

      const owner = people[0];
      const reviewerUser = people[1] ?? people[0];
      const sentOwnerId = owner.Id;
      const sentReviewerIds = [reviewerUser.Id, group.Id];

      // The Key each principal SHOULD be written as, read straight from the User
      // Information List (column `Name`) — claims for a user, title for a group.
      const uilName = async (id: number) => {
        try {
          return (
            await json(
              `${webAbs}/_api/web/SiteUserInfoList/items(${id})?$select=Id,Name,Title`,
            )
          ).Name as string;
        } catch (e) {
          return `<unreadable: ${(e as Error).message}>`;
        }
      };
      const expectedKeys = {
        owner: await uilName(owner.Id),
        reviewerUser: await uilName(reviewerUser.Id),
        group: await uilName(group.Id),
      };

      const p = new pd.Project();
      p.Title = `speel e2e person folder ${Date.now()}`;
      p.Status = "Planning";
      p.Priority = "Low";
      p.DueDate = new Date(Date.now() + 30 * 86_400_000);
      p.IsPublic = false;
      p.OwnerId = sentOwnerId;
      p.ReviewersId = sentReviewerIds;

      pd.ctx.projects.add(p, {
        folder: `SpeelE2E/${new Date().getFullYear()}`,
      });
      await pd.ctx.saveChangesAsync();
      const id: number = p.Id;

      const row = await json(
        `${webAbs}/_api/web/lists/getByTitle('Projects')/items(${id})` +
          `?$select=FileDirRef,OwnerId,ReviewersId`,
      );

      pd.ctx.projects.remove(p);
      await pd.ctx.saveChangesAsync();

      return {
        id,
        fileDirRef: row.FileDirRef as string,
        sentOwnerId,
        storedOwnerId: row.OwnerId as number | null,
        sentReviewerIds,
        storedReviewerIds: (row.ReviewersId ?? []) as number[],
        groupId: group.Id,
        groupTitle: group.Title,
        ownerTitle: owner.Title,
        reviewerUserTitle: reviewerUser.Title,
        expectedKeys,
        sentBodies,
      };
    } finally {
      window.fetch = origFetch;
    }
  }, webAbs);

  // Diagnostics for a failure report: the exact encoding that went on the wire.
  // eslint-disable-next-line no-console
  console.log("[person folder add]", JSON.stringify(result, null, 2));

  // Proof the item went through the FORM-VALUES path, not the JSON one.
  expect(result.fileDirRef).toMatch(/\/SpeelE2E\/\d{4}$/);

  // A group's Key is its plain title — the one rule that covers both kinds.
  expect(result.expectedKeys.group).toBe(result.groupTitle);
  expect(result.expectedKeys.owner).toMatch(/^i:0#\.f\|membership\|/);

  // Single-value person column: the shipped bug. Stored must equal sent.
  expect(result.storedOwnerId).toBe(result.sentOwnerId);

  // Multi-value person column: every principal we sent came back...
  expect(result.sentReviewerIds).toHaveLength(2);
  expect([...result.storedReviewerIds].sort()).toEqual(
    [...result.sentReviewerIds].sort(),
  );
  // ...the group among them.
  expect(result.storedReviewerIds).toContain(result.groupId);
});

/**
 * E2E: the warm-cache path, end to end.
 *
 * A person column is written by claims Key, so a foldered save has to resolve
 * every principal id first. Queries populate the provider's login cache from
 * the same User Information List that resolution reads, so an `.include` over a
 * person navigation should leave the later save nothing to fetch.
 *
 * Three phases, with User Information List traffic counted in each:
 *
 * 1. seed a control item over RAW REST — a JSON POST with bare ids, which
 *    SharePoint stores without consulting the UIL. Not through the provider:
 *    it resolves the principals of every insert it sends (items.add would
 *    store a dangling id otherwise), and that would warm the cache here and
 *    leave phase 3 nothing to prove;
 * 2. query it back with `.include(p => p.Reviewers)` — this is the warming step;
 * 3. save a NEW item into a folder with those same principals. Zero UIL requests
 *    in phase 3 is the proof the cache served the save, and the read-back is the
 *    proof it served it CORRECTLY.
 */
test("folder placement: a warm principal cache serves the person-column save", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  const demo = dashboard.watchConsole();
  await dashboard.open("admin");

  // The web part fires `void actions.runAll()` from onInit — before `window.pd`
  // exists, so waiting for the demo surface does NOT wait for its traffic. Let
  // that settle first, or the page is issuing requests concurrently with the
  // phases measured below. Either terminal state ends the wait; a timeout here
  // fails loudly rather than quietly measuring an overlap.
  await expect
    .poll(() => demo.isDemoComplete() || demo.errors().length > 0, {
      timeout: 90_000,
      message: "the web part's runAll() demo never settled",
    })
    .toBe(true);

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const json = async (url: string) => {
      const r = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    };
    // A raw REST write, with a fresh request digest: the seed row must be
    // created WITHOUT the provider (see phase 1 below), and this is the only
    // other way to write an item from the page.
    const post = async (
      url: string,
      body: unknown,
      extra: Record<string, string> = {},
    ) => {
      const digest = (
        await (
          await fetch(`${webAbs}/_api/contextinfo`, {
            method: "POST",
            headers: { Accept: "application/json;odata=nometadata" },
            credentials: "include",
          })
        ).json()
      ).FormDigestValue as string;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json;odata=nometadata",
          "Content-Type": "application/json;charset=utf-8",
          "X-RequestDigest": digest,
          ...extra,
        },
        credentials: "include",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${url}: ${text}`);
      // A DELETE answers 200 with an EMPTY body (not 204): parse only what is there.
      return text ? JSON.parse(text) : null;
    };

    // User Information List reads, attributed per phase.
    //
    // The counter has to measure OUR resolve, not whatever else the page
    // happens to fetch: `uil.save` coming back empty is the only evidence that
    // a warm cache costs no request, and a guardian unrelated background work
    // can fool is not a guardian. So a request counts only when it names a
    // principal this test is actually writing — both routes into the UIL go
    // through `siteUserInfoList.items.getById(id)`, which puts the id in the
    // URL — and pnpjs batches, so the marker is looked for in the body too.
    //
    // `uil.include` is the canary that keeps the narrowing honest: it must come
    // back holding exactly the ids under test. Were that URL shape ever to
    // change, the matcher would stop seeing anything at all — and this fails
    // loudly rather than letting every other count silently read empty.
    const watched = new Set<number>();
    const uil = {
      seed: [] as number[],
      include: [] as number[],
      save: [] as number[],
    };
    // UIL traffic that is not ours. Reported, never asserted — its whole point
    // is that it must not be able to move the numbers above.
    let foreignUil = 0;
    let phase: keyof typeof uil = "seed";
    const origFetch = window.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).fetch = (...args: any[]) => {
      try {
        const url =
          typeof args[0] === "string" ? args[0] : String(args[0]?.url ?? "");
        const body = typeof args[1]?.body === "string" ? args[1].body : "";
        const text = url + body;
        if (/SiteUserInfoList/i.test(text)) {
          const re = /siteuserinfolist\/items\((\d+)\)/gi;
          let mine = false;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            const id = Number(m[1]);
            if (!watched.has(id)) continue;
            mine = true;
            if (!uil[phase].includes(id)) uil[phase].push(id);
          }
          if (!mine) foreignUil += 1;
        }
      } catch {
        /* instrumentation must never break the run */
      }
      return origFetch.apply(window, args as Parameters<typeof fetch>);
    };

    try {
      const users: {
        Id: number;
        Title: string;
        LoginName: string;
        PrincipalType: number;
      }[] = (
        await json(
          `${webAbs}/_api/web/siteusers?$select=Id,Title,LoginName,PrincipalType&$top=200`,
        )
      ).value;
      const people = users.filter(
        (u) =>
          u.PrincipalType === 1 && /^i:0#\.f\|membership\|/.test(u.LoginName),
      );
      const groups: { Id: number; Title: string; LoginName: string }[] = (
        await json(
          `${webAbs}/_api/web/sitegroups?$select=Id,Title,LoginName&$top=100`,
        )
      ).value;
      const group =
        groups.find((g) => /Owners|Members|Visitors/i.test(g.Title)) ??
        groups[0];

      const sentOwnerId = people[0].Id;
      const sentReviewerIds = [(people[1] ?? people[0]).Id, group.Id];
      // Only now can the counter tell our traffic from the page's. Nothing
      // above this line reads the UIL, so no phase loses a request to it.
      for (const id of [sentOwnerId, ...sentReviewerIds]) watched.add(id);

      const dueDate = new Date(Date.now() + 30 * 86_400_000);
      const listApi = `${webAbs}/_api/web/lists/getByTitle('Projects')`;

      // 1. Seed row, over RAW REST — bare ids in a JSON POST, no provider, no
      //    tracker. The provider resolves the principals of EVERY insert it
      //    sends through the UIL (items.add stores a dangling person id, so it
      //    must), which would warm the cache before the include had a chance
      //    and leave phase 3 proving nothing. SharePoint itself never touches
      //    the UIL for a JSON add, so `uil.seed` stays empty by construction —
      //    and the include below is the only thing that can warm anything.
      phase = "seed";
      const seedId = (
        await post(`${listApi}/items`, {
          Title: `speel e2e warm seed ${Date.now()}`,
          Status: "Planning",
          Priority: "Low",
          DueDate: dueDate.toISOString(),
          IsPublic: false,
          OwnerId: sentOwnerId,
          ReviewersId: sentReviewerIds,
        })
      ).Id as number;

      // 2. Warm the cache through the query path: the include reads the UIL
      //    for exactly these principals, and the provider harvests their logins
      //    from the rows it gets back.
      phase = "include";
      const loaded = await pd.ctx.projects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .include((p: any) => p.Reviewers)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .include((p: any) => p.Owner)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((p: any) => p.Id.eq(seedId))
        .toArrayAsync();
      const hit = loaded[0];
      const includedOwner = hit?.Owner
        ? { Id: hit.Owner.Id, LoginName: hit.Owner.LoginName }
        : null;
      const includedReviewers = (hit?.Reviewers ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => ({ Id: r.Id, LoginName: r.LoginName }),
      );

      // 3. Foldered add of the SAME principals — should need no request.
      phase = "save";
      const foldered = new pd.Project();
      foldered.Title = `speel e2e warm folder ${Date.now()}`;
      foldered.Status = "Planning";
      foldered.Priority = "Low";
      foldered.DueDate = dueDate;
      foldered.IsPublic = false;
      foldered.OwnerId = sentOwnerId;
      foldered.ReviewersId = sentReviewerIds;
      pd.ctx.projects.add(foldered, {
        folder: `SpeelE2E/${new Date().getFullYear()}`,
      });
      await pd.ctx.saveChangesAsync();
      const row = await json(
        `${listApi}/items(${foldered.Id})?$select=FileDirRef,OwnerId,ReviewersId`,
      );

      pd.ctx.projects.remove(foldered);
      await pd.ctx.saveChangesAsync();
      // The seed never entered the tracker; it leaves the way it came.
      await post(`${listApi}/items(${seedId})`, undefined, {
        "IF-MATCH": "*",
        "X-HTTP-Method": "DELETE",
      });

      return {
        uil,
        foreignUil,
        sentOwnerId,
        sentReviewerIds,
        groupId: group.Id,
        includedOwner,
        includedReviewers,
        fileDirRef: row.FileDirRef as string,
        storedOwnerId: row.OwnerId as number | null,
        storedReviewerIds: (row.ReviewersId ?? []) as number[],
      };
    } finally {
      window.fetch = origFetch;
    }
  }, webAbs);

  // eslint-disable-next-line no-console
  console.log("[warm cache person add]", JSON.stringify(result, null, 2));

  const watchedIds = [
    ...new Set([result.sentOwnerId, ...result.sentReviewerIds]),
  ].sort();

  // The seed went in over raw REST, which never touches the UIL — so this is
  // both a true statement and the guarantee that nothing warmed the cache
  // before the include. (The provider's own root add would have: it resolves
  // every cold principal an insert names, `items.add` being blind to them.)
  expect(result.uil.seed).toEqual([]);

  // The include really read the User Information List, for exactly the
  // principals under test. This is also what proves the matcher still
  // recognises a resolve: without it, an empty `uil.save` would be
  // indistinguishable from a marker that matches nothing at all.
  expect([...result.uil.include].sort()).toEqual(watchedIds);

  // ...and really materialized them — if the cache silently dropped a record,
  // this is where it shows.
  expect(
    result.includedReviewers.map((r: { Id: number }) => r.Id).sort(),
  ).toEqual([...result.sentReviewerIds].sort());
  expect(result.includedOwner?.Id).toBe(result.sentOwnerId);

  // The save resolved every Key out of the warm cache: no request of its own.
  expect(result.uil.save).toEqual([]);

  // And it resolved them CORRECTLY — folder path, stored equals sent.
  expect(result.fileDirRef).toMatch(/\/SpeelE2E\/\d{4}$/);
  expect(result.storedOwnerId).toBe(result.sentOwnerId);
  expect([...result.storedReviewerIds].sort()).toEqual(
    [...result.sentReviewerIds].sort(),
  );
  expect(result.storedReviewerIds).toContain(result.groupId);
});

/**
 * E2E probe: what SharePoint actually returns for principals.
 *
 * Two premises this branch rests on were reasoned rather than observed, and a
 * fake provider cannot settle either — it projects whatever it is asked for.
 * This test observes them on a live web and REPORTS what it finds.
 *
 * 1. `web/siteusers` returns claims SECURITY GROUPS (`PrincipalType: 4`, e.g.
 *    "Everyone except external users") alongside users. `SiteUserSet` filters
 *    on `PrincipalType` for exactly that reason. The census below prints every
 *    distinct value the endpoint carries, with a sample title for each.
 *
 * 2. The User Information List REJECTS a `$select` of `PrincipalType` — the
 *    whole query fails, not just that column — so core asks for `ContentTypeId`
 *    and derives the type. That is only provable against real SharePoint: the
 *    request core puts on the wire is captured here, along with the response,
 *    so a rejection would show as an error body rather than as a silent gap.
 *
 * Order matters. The UIL probe runs BEFORE the `ctx.siteUsers` read, because
 * that read warms the provider's login cache and a warm cache would leave the
 * write phase with no request to inspect.
 */
test("principal probe: PrincipalType census and the live UIL $select", async ({
  authPage,
}) => {
  test.setTimeout(180_000);
  const webAbs = loadEnv().baseURL;

  const dashboard = new ProjectDashboardPage(authPage);
  await dashboard.open("admin");

  const result = await authPage.evaluate(async (webAbs: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = (window as any).pd;
    const json = async (url: string) => {
      const r = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" },
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status} ${url}: ${await r.text()}`);
      return r.json();
    };

    // ---- Phase A: the raw census -------------------------------------
    // Straight REST, no core involvement: whatever the endpoint carries.
    const rawUsers: {
      Id: number;
      Title: string;
      LoginName: string;
      Email: string;
      PrincipalType: number;
    }[] = (
      await json(
        `${webAbs}/_api/web/siteusers` +
          `?$select=Id,Title,LoginName,Email,PrincipalType&$top=500`,
      )
    ).value;

    const census: Record<
      string,
      { count: number; sampleTitle: string; sampleLogin: string }
    > = {};
    for (const u of rawUsers) {
      const k = String(u.PrincipalType);
      if (!census[k]) {
        census[k] = {
          count: 0,
          sampleTitle: u.Title,
          sampleLogin: u.LoginName,
        };
      }
      census[k].count += 1;
    }

    // ---- Phase B: the UIL $select, on the wire ------------------------
    // An `.include()` over a person navigation is the one route that always
    // issues a UIL read (the planner does not consult the cache), so it is
    // what puts core's real $select in front of SharePoint. The root add that
    // seeds the row has UIL traffic of its own — the provider's principal
    // pre-pass, one login resolve per cold id — so requests are attributed by
    // phase: `uilWriteRequests` while the add saves, `uilRequests` after.
    const uilWriteRequests: string[] = [];
    const uilRequests: string[] = [];
    const uilResponses: string[] = [];
    let writing = true;
    const origFetch = window.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).fetch = (...args: any[]) => {
      let watch = false;
      try {
        const url =
          typeof args[0] === "string" ? args[0] : String(args[0]?.url ?? "");
        const body = typeof args[1]?.body === "string" ? args[1].body : "";
        const text = url + "\n" + body;
        if (/SiteUserInfoList/i.test(text)) {
          watch = true;
          const re = /SiteUserInfoList\/items\((\d+)\)(\?[^\s"']*)?/gi;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null)
            (writing ? uilWriteRequests : uilRequests).push(m[0]);
        }
      } catch {
        /* instrumentation must never break the run */
      }
      const p = origFetch.apply(window, args as Parameters<typeof fetch>);
      if (watch) {
        p.then((r) => {
          try {
            r.clone()
              .text()
              .then((t) => uilResponses.push(t.slice(0, 20_000)))
              .catch(() => undefined);
          } catch {
            /* ignore */
          }
        }).catch(() => undefined);
      }
      return p;
    };

    let uilProbe: unknown = null;
    let uilError: string | null = null;
    try {
      const groups: { Id: number; Title: string; LoginName: string }[] = (
        await json(
          `${webAbs}/_api/web/sitegroups?$select=Id,Title,LoginName&$top=100`,
        )
      ).value;
      const group =
        groups.find((g) => /Owners|Members|Visitors/i.test(g.Title)) ??
        groups[0];
      const people = rawUsers.filter(
        (u) =>
          u.PrincipalType === 1 && /^i:0#\.f\|membership\|/.test(u.LoginName),
      );

      const p = new pd.Project();
      p.Title = `speel e2e principal probe ${Date.now()}`;
      p.Status = "Planning";
      p.Priority = "Low";
      p.DueDate = new Date(Date.now() + 30 * 86_400_000);
      p.IsPublic = false;
      p.OwnerId = people[0].Id;
      p.ReviewersId = [(people[1] ?? people[0]).Id, group.Id];
      pd.ctx.projects.add(p);
      await pd.ctx.saveChangesAsync();
      writing = false;

      const loaded = await pd.ctx.projects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .include((x: any) => x.Owner)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .include((x: any) => x.Reviewers)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((x: any) => x.Id.eq(p.Id))
        .toArrayAsync();
      const hit = loaded[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shape = (r: any) =>
        r == null
          ? null
          : {
              ctor: r.constructor?.name,
              Id: r.Id,
              Title: r.Title,
              LoginName: r.LoginName,
              Email: r.Email,
              PrincipalType: r.PrincipalType,
            };
      uilProbe = {
        groupId: group.Id,
        groupTitle: group.Title,
        owner: shape(hit?.Owner),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reviewers: (hit?.Reviewers ?? []).map((r: any) => shape(r)),
      };

      pd.ctx.projects.remove(p);
      await pd.ctx.saveChangesAsync();
    } catch (e) {
      uilError = (e as Error).message;
    } finally {
      window.fetch = origFetch;
    }

    // What the UIL responses actually carried.
    const joined = uilResponses.join("\n");
    const contentTypeIds = [
      ...new Set(
        [...joined.matchAll(/"ContentTypeId"\s*:\s*"([^"]*)"/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    // The rejection this branch exists to avoid, in SharePoint's own words.
    const notValid = [
      ...new Set(
        [
          ...joined.matchAll(/The query to field '[^']*' is not valid[^"]*/g),
        ].map((m) => m[0]),
      ),
    ];

    // ---- Phase C: what the siteUsers set surfaces ---------------------
    // Only now — this warms the provider's login cache, which would have hidden
    // the write phase's resolves.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coreUsers: any[] = await pd.ctx.siteUsers.toArrayAsync();
    const coreTypes: Record<string, number> = {};
    for (const u of coreUsers) {
      const k = String(u.PrincipalType);
      coreTypes[k] = (coreTypes[k] ?? 0) + 1;
    }

    return {
      rawCount: rawUsers.length,
      census,
      uilWriteRequests,
      uilRequests,
      uilError,
      uilProbe,
      contentTypeIds,
      notValid,
      coreUserCount: coreUsers.length,
      coreTypes,
      coreCtors: [...new Set(coreUsers.map((u) => u.constructor?.name))],
    };
  }, webAbs);

  // eslint-disable-next-line no-console
  console.log("[principal probe]", JSON.stringify(result, null, 2));

  // The probe itself has to have run, or nothing below means anything.
  expect(result.uilError).toBeNull();
  expect(result.rawCount).toBeGreaterThan(0);
  expect(result.uilRequests.length).toBeGreaterThan(0);

  // The $select core sends for a principal READ: ContentTypeId in, PrincipalType
  // out — and SharePoint accepted it. This is the single thing a fake provider
  // can never prove.
  for (const req of result.uilRequests) {
    expect(req).toContain("ContentTypeId");
    expect(req).not.toContain("PrincipalType");
  }
  // The root add's own UIL traffic is the provider's principal pre-pass —
  // `insert` is path-independent: `items.add` stores a dangling person id, so
  // every id is checked before any API is chosen — one resolve per cold
  // principal, selecting the UIL's login column (`Name`) and never
  // PrincipalType. How many there are depends on what the page had already
  // warmed, so the shape is pinned, not the count — and when the page's own
  // traffic pre-warmed every id, this loop runs zero times and pins nothing.
  // eslint-disable-next-line no-console
  console.log(
    `[principal probe] write-phase UIL resolves: ${result.uilWriteRequests.length}`,
  );
  for (const req of result.uilWriteRequests) {
    expect(req).toMatch(/(\$|%24)select=Id(,|%2C)Name(&|$)/);
    expect(req).not.toContain("PrincipalType");
  }
  expect(result.notValid).toEqual([]);
  expect(result.contentTypeIds.length).toBeGreaterThan(0);
  for (const cid of result.contentTypeIds) expect(cid).not.toBe("");

  // ...and the derivation produced the RIGHT type for every principal, not
  // merely some type. The length guard is the whole point: a per-element loop
  // over an empty `reviewers` passes while gating nothing, and `toBeDefined()`
  // accepts `null` — the two ways this could read as coverage and not be it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const probe = result.uilProbe as any;
  expect(probe.owner?.PrincipalType).toBe(1);
  expect(probe.reviewers).toHaveLength(2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewGroup = probe.reviewers.find((r: any) => r.Id === probe.groupId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewUser = probe.reviewers.find((r: any) => r.Id !== probe.groupId);
  // The group: derived from a non-Person ContentTypeId, and keyed by its plain
  // title rather than a claims string. A group coming back untyped fails here.
  expect(reviewGroup?.PrincipalType).toBe(8);
  expect(reviewGroup?.LoginName).toBe(probe.groupTitle);
  // The user: derived from the 0x010A Person ContentTypeId, keyed by claims.
  expect(reviewUser?.PrincipalType).toBe(1);
  expect(reviewUser?.LoginName).toMatch(/^i:0#\.f\|membership\|/);

  // Premise under test: `ctx.siteUsers` is the `web/siteusers` collection as the
  // provider serves it — every record, typed, PrincipalType carried through. That
  // collection holds people (1) and claims security groups (4) and never a
  // SharePoint group (8); a caller who wants people only filters on PrincipalType.
  expect(result.coreUserCount).toBe(result.rawCount);
  expect(Object.keys(result.coreTypes).sort()).toEqual(
    Object.keys(result.census).sort(),
  );
  expect(result.coreTypes["1"]).toBe(result.census["1"]?.count);
  expect(result.coreTypes["8"]).toBeUndefined();
  // Every row leaves the read as the set's entity — an empty result fails this
  // too, so it cannot pass by yielding nothing.
  expect(result.coreCtors).toEqual(["SiteUser"]);
});
