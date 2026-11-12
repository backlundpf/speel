import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../src/DbSet.js";
import { SpeelDocument } from "../../src/SpeelDocument.js";
import { SpeelEntity } from "../../src/SpeelEntity.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../src/types.js";
import { TestPrincipal as Principal } from "./fakes/testPrincipals.js";
import type { IError } from "../../src/Result.js";
import { Result } from "../../src/Result.js";
import {
  InvalidOperationException,
  OperationFailedException,
} from "../../src/errors.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}
class Task extends SpeelEntity {
  Title: string | null = null;
}

const reports: IListHandle = { kind: "title", value: "Reports" };
const tasks: IListHandle = { kind: "title", value: "Tasks" };

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Report, (b) => {
    b.toList("Reports");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Task, (b) => {
    b.toList("Tasks");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

describe("DbSet.ensureFolderAsync", () => {
  let provider: FakeStorageProvider;
  let reportSet: DbSet<Report>;
  let taskSet: DbSet<Task>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    taskSet = new DbSet<Task>(Task, model, provider, tracker);
  });

  it("creates the folder on the set's list", async () => {
    await reportSet.ensureFolderAsync("responses");
    expect(provider.getFolders(reports)).toEqual(["responses"]);
  });

  it("creates every missing level of a nested path", async () => {
    await reportSet.ensureFolderAsync("responses/r-1/evidence");
    expect(provider.getFolders(reports).sort()).toEqual([
      "responses",
      "responses/r-1",
      "responses/r-1/evidence",
    ]);
  });

  it("is idempotent — an existing folder is success, not a collision", async () => {
    await reportSet.ensureFolderAsync("responses/r-1");
    await expect(
      reportSet.ensureFolderAsync("responses/r-1"),
    ).resolves.toBeDefined();
    expect(provider.getFolders(reports).sort()).toEqual([
      "responses",
      "responses/r-1",
    ]);
  });

  it("leaves an existing folder's contents alone", async () => {
    await reportSet.ensureFolderAsync("responses");
    const up = await provider.uploadFileAsync(
      reports,
      "/sites/dev/Reports/responses",
      { fileName: "a.pdf", content: "x", overwrite: false, fields: [] },
    );
    await reportSet.ensureFolderAsync("responses");
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/responses/a.pdf",
    ]);
    expect(
      await provider.getItemByIdAsync(reports, up.id, ["FileRef"]),
    ).toMatchObject({ FileRef: "/sites/dev/Reports/responses/a.pdf" });
  });

  it("normalizes the path before the provider sees it", async () => {
    await reportSet.ensureFolderAsync("/responses//r-1/");
    expect(provider.getFolders(reports).sort()).toEqual([
      "responses",
      "responses/r-1",
    ]);
  });

  it("works on a plain list, not just a document library", async () => {
    await taskSet.ensureFolderAsync("q1");
    expect(provider.getFolders(tasks)).toEqual(["q1"]);
  });

  it("refuses a path that resolves to the list root", async () => {
    await expect(reportSet.ensureFolderAsync("")).rejects.toThrow(/list root/);
    await expect(reportSet.ensureFolderAsync("  /  ")).rejects.toThrow(
      /list root/,
    );
    expect(provider.getFolders(reports)).toEqual([]);
  });

  it("refuses a traversing path", async () => {
    await expect(reportSet.ensureFolderAsync("a/../b")).rejects.toThrow(
      /'\.\.' segments/,
    );
    expect(provider.getFolders(reports)).toEqual([]);
  });

  it("returns the folder's server-relative URL", async () => {
    const url = await reportSet.ensureFolderAsync("responses/r-1");
    expect(url).toBe("/sites/dev/Reports/responses/r-1");
  });

  it("returns the same URL when the folder was already there", async () => {
    const first = await reportSet.ensureFolderAsync("responses");
    const second = await reportSet.ensureFolderAsync("responses");
    expect(second).toBe(first);
  });

  it("returns the URL for a path given with surrounding slashes", async () => {
    const url = await taskSet.ensureFolderAsync("/inbox/");
    expect(url).toBe("/sites/dev/Tasks/inbox");
  });
});

describe("DbSet.deleteFolderAsync", () => {
  let provider: FakeStorageProvider;
  let reportSet: DbSet<Report>;
  let taskSet: DbSet<Task>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    taskSet = new DbSet<Task>(Task, model, provider, tracker);
  });

  it("deletes the folder, and its contents go with it", async () => {
    await reportSet.ensureFolderAsync("responses/r-1");
    await provider.uploadFileAsync(
      reports,
      "/sites/dev/Reports/responses/r-1",
      {
        fileName: "a.pdf",
        content: "x",
        overwrite: false,
        fields: [],
      },
    );

    await reportSet.deleteFolderAsync("responses/r-1");

    expect(provider.getFolders(reports)).toEqual(["responses"]);
    expect(provider.getFiles(reports)).toEqual([]);
  });

  it("recycles rather than destroys, matching remove()'s default", async () => {
    await reportSet.ensureFolderAsync("a");
    const up = await provider.uploadFileAsync(reports, "/sites/dev/Reports/a", {
      fileName: "a.pdf",
      content: "x",
      overwrite: false,
      fields: [],
    });
    await reportSet.deleteFolderAsync("a");
    expect(provider.recycledIds(reports)).toContain(up.id);
    expect(provider.hardDeletedIds(reports)).toEqual([]);
  });

  it("leaves sibling folders and their contents alone", async () => {
    await reportSet.ensureFolderAsync("a");
    await reportSet.ensureFolderAsync("b");
    const kept = await provider.uploadFileAsync(
      reports,
      "/sites/dev/Reports/b",
      { fileName: "b.pdf", content: "x", overwrite: false, fields: [] },
    );
    await reportSet.deleteFolderAsync("a");
    expect(provider.getFolders(reports)).toEqual(["b"]);
    expect(provider.getFiles(reports)).toEqual(["/sites/dev/Reports/b/b.pdf"]);
    expect(
      await provider.getItemByIdAsync(reports, kept.id, ["FileRef"]),
    ).not.toBeNull();
  });

  it("works on a plain list, not just a document library", async () => {
    await taskSet.ensureFolderAsync("q1");
    await taskSet.deleteFolderAsync("q1");
    expect(provider.getFolders(tasks)).toEqual([]);
  });

  it("normalizes the path before the provider sees it", async () => {
    await reportSet.ensureFolderAsync("a/b");
    await reportSet.deleteFolderAsync("/a//b/");
    expect(provider.getFolders(reports)).toEqual(["a"]);
  });

  it("refuses the list root and a traversing path", async () => {
    await expect(reportSet.deleteFolderAsync("")).rejects.toThrow(/list root/);
    await expect(reportSet.deleteFolderAsync("a/../b")).rejects.toThrow(
      /'\.\.' segments/,
    );
  });

  it("propagates a missing folder from the provider", async () => {
    await expect(reportSet.deleteFolderAsync("nope")).rejects.toThrow(
      /not found/,
    );
  });
});

describe("DbSet.ensureFoldersAsync", () => {
  let provider: FakeStorageProvider;
  let reportSet: DbSet<Report>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
  });

  it("results are aligned to the input, new and existing mixed", async () => {
    await reportSet.ensureFolderAsync("responses");
    const results = await reportSet.ensureFoldersAsync([
      "responses/r-1",
      "responses",
      "evidence",
    ]);
    expect(results).toEqual([
      { ok: true, value: "/sites/dev/Reports/responses/r-1" },
      { ok: true, value: "/sites/dev/Reports/responses" },
      { ok: true, value: "/sites/dev/Reports/evidence" },
    ]);
  });

  it("a failed parent fails its children and spares unrelated paths", async () => {
    provider.failFolderOn("responses", {
      status: 403,
      message: "Access denied.",
    });
    const results = await reportSet.ensureFoldersAsync([
      "responses/r-1",
      "responses/r-2",
      "evidence",
    ]);
    for (const r of results.slice(0, 2)) {
      expect(r.ok).toBe(false);
      expect(r.errors![0]!.code).toBe("parentFailed");
      expect((r.errors![0]!.cause as IError).target).toBe("responses");
    }
    expect(results[2]!.ok).toBe(true);
  });

  it("duplicates, including after normalization, hit the provider once per distinct path", async () => {
    const spy = vi.spyOn(provider, "ensureFoldersAsync");
    const results = await reportSet.ensureFoldersAsync([
      "a/b",
      "/a/b/",
      "a\\b",
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toEqual(["a/b"]);
    for (const r of results) {
      expect(r).toEqual({ ok: true, value: "/sites/dev/Reports/a/b" });
    }
  });

  it("invalid paths are per-path invalidPath failures, the rest still run", async () => {
    const spy = vi.spyOn(provider, "ensureFoldersAsync");
    const results = await reportSet.ensureFoldersAsync(["../x", "", "ok"]);
    expect(results[0]!.errors![0]).toMatchObject({
      code: "invalidPath",
      target: "../x",
    });
    expect(results[1]!.errors![0]).toMatchObject({
      code: "invalidPath",
      target: "",
    });
    expect(results[2]!.ok).toBe(true);
    expect(spy.mock.calls[0]![1]).toEqual(["ok"]);
  });

  it("all-invalid input does not call the provider", async () => {
    const spy = vi.spyOn(provider, "ensureFoldersAsync");
    const results = await reportSet.ensureFoldersAsync(["", "/"]);
    expect(results.map((r) => r.errors![0]!.code)).toEqual([
      "invalidPath",
      "invalidPath",
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("empty input returns [] without calling the provider", async () => {
    const spy = vi.spyOn(provider, "ensureFoldersAsync");
    expect(await reportSet.ensureFoldersAsync([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a path the provider omits is noResult", async () => {
    vi.spyOn(provider, "ensureFoldersAsync").mockResolvedValue(new Map());
    const [r] = await reportSet.ensureFoldersAsync(["a"]);
    expect(r!.errors![0]).toMatchObject({ code: "noResult", target: "a" });
  });

  it("rejects when the provider cannot attempt any path", async () => {
    vi.spyOn(provider, "ensureFoldersAsync").mockRejectedValue(
      new Error("list not found"),
    );
    await expect(reportSet.ensureFoldersAsync(["a"])).rejects.toThrow(
      "list not found",
    );
  });

  it("ensureFolderAsync throws OperationFailedException on a provider failure", async () => {
    provider.failFolderOn("x", { status: 403, message: "Access denied." });
    const err = await reportSet.ensureFolderAsync("x").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(OperationFailedException);
    expect((err as OperationFailedException).errors[0]!.code).toBe(
      "requestFailed",
    );
  });

  it("ensureFolderAsync still throws InvalidOperationException for root and '..'", async () => {
    await expect(reportSet.ensureFolderAsync("")).rejects.toBeInstanceOf(
      InvalidOperationException,
    );
    await expect(reportSet.ensureFolderAsync("a/../b")).rejects.toBeInstanceOf(
      InvalidOperationException,
    );
  });

  it("a provider-returned Result passes through unchanged", async () => {
    vi.spyOn(provider, "ensureFoldersAsync").mockResolvedValue(
      new Map([["a", Result.ok("/custom/a")]]),
    );
    expect(await reportSet.ensureFoldersAsync(["a"])).toEqual([
      { ok: true, value: "/custom/a" },
    ]);
  });
});
