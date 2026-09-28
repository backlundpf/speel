import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../src/DbSet.js";
import { SpeelDocument } from "../../src/SpeelDocument.js";
import { SpeelEntity } from "../../src/SpeelEntity.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../src/types.js";
import { TestPrincipal as Principal } from "./fakes/testPrincipals.js";

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
