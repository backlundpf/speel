// test/SharePointProvider.folderBatch.test.ts
import { describe, it, expect } from "vitest";
import type { IError } from "@speel/core";
import { SharePointProvider } from "../src/SharePointProvider.js";

const ROOT = "/sites/dev/Docs";
const list = { kind: "title" as const, value: "Docs" };

interface Queued {
  run: () => void; // settles the request's promise, at execute() time
}

/**
 * A batching SPFI fake. `addSubFolderUsingPath` and the `Exists` read enrol
 * SYNCHRONOUSLY in the current batch, and their promises settle only when that
 * batch's `execute()` runs — so an implementation that awaits between
 * `batched()` and enrolment, or awaits a promise before `execute()`, fails these
 * tests. A rejected batch leaves its queued promises pending forever, as PnPjs
 * 4.20 does.
 *
 * `batches` records the create (POST) batches; a batch holding only `Exists`
 * reads is recorded in `readBatches` instead. `files` are paths a FILE holds:
 * creating a folder there answers "name taken", and its folder `Exists` is false.
 */
function fakeBatchSp(
  opts: {
    existing?: string[];
    files?: string[];
    failing?: Record<string, { status: number; message: string }>;
    executeRejects?: unknown;
    readsRejectWith?: unknown;
    caseInsensitive?: boolean;
    existsError?: unknown;
  } = {},
) {
  const key = (p: string) => (opts.caseInsensitive ? p.toLowerCase() : p);
  const present = new Set((opts.existing ?? []).map(key));
  const files = new Set((opts.files ?? []).map(key));
  const created: string[] = [];
  const batches: { parentUrl: string; leaf: string }[][] = [];
  const readBatches: string[][] = [];
  const maxRequestsSeen: number[] = [];
  const rel = (url: string) => (url === ROOT ? "" : url.slice(ROOT.length + 1));

  const rootList = () => ({
    rootFolder: {
      select: (_f: string) => async () => ({ ServerRelativeUrl: ROOT }),
    },
  });

  const sp: any = {
    web: { lists: { getByTitle: rootList, getById: rootList } },
    batched(props?: { maxRequests?: number }) {
      maxRequestsSeen.push(props?.maxRequests ?? -1);
      const calls: { parentUrl: string; leaf: string }[] = [];
      const reads: string[] = [];
      const queue: Queued[] = [];
      const scoped = {
        web: {
          getFolderByServerRelativePath: (url: string) => ({
            addSubFolderUsingPath: (leaf: string) => {
              calls.push({ parentUrl: url, leaf });
              const path = rel(url) ? `${rel(url)}/${leaf}` : leaf;
              return new Promise<void>((resolve, reject) =>
                queue.push({
                  run: () => {
                    const fail = opts.failing?.[path];
                    if (fail) reject(fail);
                    else if (present.has(key(path)) || files.has(key(path)))
                      reject(
                        opts.existsError ?? {
                          status: 500,
                          message: "The folder already exists.",
                        },
                      );
                    else {
                      present.add(key(path));
                      created.push(path);
                      resolve();
                    }
                  },
                }),
              );
            },
            select: (field: string) => () => {
              expect(field).toBe("Exists");
              const path = rel(url);
              reads.push(path);
              return new Promise<{ Exists: boolean }>((resolve, reject) =>
                queue.push({
                  run: () =>
                    opts.readsRejectWith !== undefined
                      ? reject(opts.readsRejectWith)
                      : resolve({
                          Exists:
                            present.has(key(path)) && !files.has(key(path)),
                        }),
                }),
              );
            },
          }),
        },
      };
      const execute = async () => {
        if (calls.length > 0) batches.push(calls);
        else readBatches.push(reads);
        if (opts.executeRejects !== undefined) throw opts.executeRejects;
        for (const q of queue) q.run();
      };
      return [scoped, execute];
    },
  };
  return { sp, created, batches, readBatches, maxRequestsSeen };
}

const leaves = (b: { leaf: string }[][]) => b.map((x) => x.map((c) => c.leaf));

describe("ensureFoldersAsync batching", () => {
  it("N root-level paths cost one batch", async () => {
    const f = fakeBatchSp();
    const paths = Array.from({ length: 25 }, (_, i) => `r-${i}`);
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(
      list,
      paths,
    );
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]).toHaveLength(25);
    expect(f.batches[0]!.every((c) => c.parentUrl === ROOT)).toBe(true);
    expect(f.maxRequestsSeen).toEqual([100]);
    expect([...map.values()].every((r) => r.ok)).toBe(true);
  });

  it("one batch per depth, shallowest first", async () => {
    const f = fakeBatchSp();
    await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a/b/c",
      "d/e",
    ]);
    expect(leaves(f.batches)).toEqual([["a", "d"], ["b", "e"], ["c"]]);
    expect(f.batches[1]!.map((c) => c.parentUrl)).toEqual([
      `${ROOT}/a`,
      `${ROOT}/d`,
    ]);
  });

  it("a depth wider than 100 splits into sequential batches", async () => {
    const f = fakeBatchSp();
    const paths = Array.from({ length: 101 }, (_, i) => `r-${i}`);
    await new SharePointProvider(f.sp).ensureFoldersAsync(list, paths);
    expect(f.batches.map((b) => b.length)).toEqual([100, 1]);
  });

  it("already-exists is success and children are still created", async () => {
    const f = fakeBatchSp({ existing: ["a"] });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a/b",
    ]);
    expect(f.batches).toHaveLength(2);
    expect(map.get("a/b")).toEqual({ ok: true, value: `${ROOT}/a/b` });
    expect(f.created).toEqual(["a/b"]);
  });

  it("a localized already-exists is recognized by its error code, not its text", async () => {
    // Captured live 2026-11-12 with Accept-Language: de-DE — same code, German text.
    const body = JSON.stringify({
      "odata.error": {
        code: "-2130245363, Microsoft.SharePoint.SPException",
        message: {
          lang: "de-DE",
          value:
            'Eine Datei oder ein Ordner mit dem Namen "https://contoso.sharepoint.com/Lists/Docs/a" ist bereits vorhanden.',
        },
      },
    });
    const f = fakeBatchSp({
      existing: ["a"],
      existsError: {
        status: 500,
        message: `Error making HttpClient request in queryable [500] Internal Server Error ::> ${body}`,
      },
    });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a/b",
    ]);
    expect(map.get("a/b")).toEqual({ ok: true, value: `${ROOT}/a/b` });
  });

  it("a fresh run makes no Exists reads", async () => {
    const f = fakeBatchSp();
    await new SharePointProvider(f.sp).ensureFoldersAsync(list, ["a/b", "c"]);
    expect(f.readBatches).toEqual([]);
  });

  it("a name taken by a folder is confirmed with one Exists read per depth", async () => {
    const f = fakeBatchSp({ existing: ["a", "b"] });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a/x",
      "b",
    ]);
    expect(f.readBatches).toEqual([["a", "b"]]);
    expect(map.get("a/x")).toEqual({ ok: true, value: `${ROOT}/a/x` });
    expect(map.get("b")).toEqual({ ok: true, value: `${ROOT}/b` });
  });

  it("a name taken by a file is notAFolder, and its children are never sent", async () => {
    const f = fakeBatchSp({ files: ["a"] });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
      "a/b",
      "z",
    ]);
    expect(map.get("a")!.errors![0]).toMatchObject({
      code: "notAFolder",
      target: "a",
    });
    const child = map.get("a/b")!.errors![0]!;
    expect(child).toMatchObject({ code: "parentFailed", target: "a/b" });
    expect((child.cause as IError).code).toBe("notAFolder");
    expect(map.get("z")!.ok).toBe(true);
    expect(leaves(f.batches)).toEqual([["a", "z"]]); // a/b never sent
  });

  it("a failed Exists read makes that path requestFailed", async () => {
    const f = fakeBatchSp({
      existing: ["a"],
      readsRejectWith: { status: 503, message: "Service unavailable." },
    });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
    ]);
    expect(map.get("a")!.errors![0]).toMatchObject({
      code: "requestFailed",
      status: 503,
      target: "a",
    });
  });

  it("a failed batch request leaves status off each folder's error, keeping it in cause", async () => {
    const f = fakeBatchSp({
      executeRejects: { status: 429, message: "Too many requests." },
    });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
      "b",
    ]);
    for (const p of ["a", "b"]) {
      const e = map.get(p)!.errors![0]!;
      expect(e).toMatchObject({ code: "requestFailed", target: p });
      expect(e.status).toBeUndefined();
      expect(e.cause).toMatchObject({ status: 429 });
    }
  });

  it("a failed parent's children are never sent", async () => {
    const f = fakeBatchSp({
      failing: { a: { status: 403, message: "Access denied." } },
    });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a/b",
      "a/c",
      "z",
    ]);
    expect(leaves(f.batches)).toEqual([["a", "z"]]);
    for (const p of ["a/b", "a/c"]) {
      const e = map.get(p)!.errors![0]!;
      expect(e).toMatchObject({ code: "parentFailed", target: p });
      expect(e.cause as IError).toMatchObject({
        code: "requestFailed",
        target: "a",
      });
    }
    expect(map.get("z")!.ok).toBe(true);
  });

  it("requestFailed carries the status and server message", async () => {
    const f = fakeBatchSp({
      failing: { a: { status: 403, message: "Access denied." } },
    });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
    ]);
    expect(map.get("a")!.errors![0]).toMatchObject({
      code: "requestFailed",
      status: 403,
      message: "Access denied.",
      target: "a",
    });
  });

  it("a rejected execute fails every node in that chunk", async () => {
    const f = fakeBatchSp({ executeRejects: new Error("network down") });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
      "b",
    ]);
    for (const p of ["a", "b"]) {
      const e = map.get(p)!.errors![0]!;
      expect(e).toMatchObject({
        code: "requestFailed",
        message: "network down",
      });
      expect(e.status).toBeUndefined();
    }
  });

  it("a path that is another path's prefix is created once", async () => {
    const f = fakeBatchSp();
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "a",
      "a/b",
    ]);
    expect(f.created).toEqual(["a", "a/b"]);
    expect(map.get("a")!.ok && map.get("a/b")!.ok).toBe(true);
  });

  it("case-only duplicates both succeed", async () => {
    const f = fakeBatchSp({ caseInsensitive: true });
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "Responses/a",
      "responses/b",
    ]);
    expect(map.get("Responses/a")).toEqual({
      ok: true,
      value: `${ROOT}/Responses/a`,
    });
    expect(map.get("responses/b")).toEqual({
      ok: true,
      value: `${ROOT}/responses/b`,
    });
    expect(f.created.filter((p) => !p.includes("/"))).toHaveLength(1);
    expect(f.created).toContain("Responses/a");
    expect(f.created).toContain("responses/b");
  });

  it("passes raw names to the PnPjs path APIs", async () => {
    const f = fakeBatchSp();
    await new SharePointProvider(f.sp).ensureFoldersAsync(list, [
      "it's #1/a b%",
    ]);
    expect(leaves(f.batches)).toEqual([["it's #1"], ["a b%"]]);
    expect(f.batches[1]![0]!.parentUrl).toBe(`${ROOT}/it's #1`);
  });

  it("empty input makes no request", async () => {
    const f = fakeBatchSp();
    const map = await new SharePointProvider(f.sp).ensureFoldersAsync(list, []);
    expect(map.size).toBe(0);
    expect(f.batches).toHaveLength(0);
  });
});
