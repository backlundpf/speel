import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../src/ChangeTracker/EntityEntry.js";
import { DbSet } from "../../src/DbSet.js";
import { SpeelDocument } from "../../src/SpeelDocument.js";
import { SpeelEntity } from "../../src/SpeelEntity.js";
import { InvalidOperationException } from "../../src/errors.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { textProperty } from "../../src/testing/properties.js";
import type { IListHandle } from "../../src/types.js";
import { TestPrincipal as Principal } from "./fakes/testPrincipals.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}
class Task extends SpeelEntity {
  Title: string | null = null;
}

const reports: IListHandle = { kind: "title", value: "Reports" };

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

describe("DbSet.renameFileAsync", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let tracker: ChangeTracker;
  let reportSet: DbSet<Report>;
  let taskSet: DbSet<Task>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    model = buildModel();
    tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    taskSet = new DbSet<Task>(Task, model, provider, tracker);
  });

  /** Upload a file into the fake library and return its new list item id. */
  async function seedFile(
    name = "q2.pdf",
    folder = "reports",
  ): Promise<number> {
    const url = (await provider.ensureFoldersAsync(reports, [folder])).get(
      folder,
    )!;
    const res = await provider.uploadFileAsync(reports, url, {
      fileName: name,
      content: "bytes",
      overwrite: false,
      fields: [{ property: textProperty("Title"), value: "Q2" }],
    });
    return res.id;
  }

  /** Upload, then load it through the set so the entity is tracked. */
  async function seedDoc(name = "q2.pdf", folder = "reports"): Promise<Report> {
    const id = await seedFile(name, folder);
    const loaded = await reportSet.findAsync(id);
    if (!loaded) throw new Error("seed failed");
    return loaded;
  }

  it("renames the file and refreshes FileLeafRef/FileRef on the entity", async () => {
    const doc = await seedDoc();
    await reportSet.renameFileAsync(doc, "q2-final.pdf");
    expect(doc.FileLeafRef).toBe("q2-final.pdf");
    expect(doc.FileRef).toBe("/sites/dev/Reports/reports/q2-final.pdf");
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/reports/q2-final.pdf",
    ]);
  });

  it("leaves a tracked, unchanged entity unchanged (the rename is not a pending edit)", async () => {
    const doc = await seedDoc();
    await reportSet.renameFileAsync(doc, "renamed.pdf");
    tracker.detectChanges();
    expect(tracker.findEntry(Report, doc.Id!)?.state).toBe(
      EntityState.Unchanged,
    );
  });

  it("keeps pending scalar edits on a dirty entity", async () => {
    const doc = await seedDoc();
    doc.Title = "edited";
    await reportSet.renameFileAsync(doc, "renamed.pdf");
    tracker.detectChanges();
    const entry = tracker.findEntry(Report, doc.Id!)!;
    expect(entry.state).toBe(EntityState.Modified);
    expect(entry.getDirtyColumns()).toContain("Title");
  });

  it("works on an untracked instance (never loaded through the set)", async () => {
    const id = await seedFile();
    const loose = new Report();
    loose.Id = id;
    await reportSet.renameFileAsync(loose, "loose.pdf");
    expect(loose.FileLeafRef).toBe("loose.pdf");
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/reports/loose.pdf",
    ]);
  });

  it("rejects a non-document entity before any I/O", async () => {
    const t = new Task();
    t.Id = 3;
    await expect(taskSet.renameFileAsync(t, "x.pdf")).rejects.toThrow(
      InvalidOperationException,
    );
    await expect(taskSet.renameFileAsync(t, "x.pdf")).rejects.toThrow(
      /SpeelDocument/,
    );
  });

  it("rejects an unsaved entity (no Id)", async () => {
    await expect(
      reportSet.renameFileAsync(new Report(), "x.pdf"),
    ).rejects.toThrow(/requires a saved entity/);
  });

  it("rejects an empty name and a name carrying a path separator", async () => {
    const doc = await seedDoc();
    await expect(reportSet.renameFileAsync(doc, "   ")).rejects.toThrow(
      /non-empty name/,
    );
    await expect(reportSet.renameFileAsync(doc, "a/b.pdf")).rejects.toThrow(
      /path separator/,
    );
    // Nothing moved.
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/reports/q2.pdf",
    ]);
  });

  it("propagates a destination collision from the provider", async () => {
    const doc = await seedDoc("a.pdf");
    await seedDoc("b.pdf");
    await expect(reportSet.renameFileAsync(doc, "b.pdf")).rejects.toThrow(
      /already exists/,
    );
    expect(doc.FileLeafRef).toBe("a.pdf"); // untouched on failure
  });
});

describe("DbSet.renameFolderAsync", () => {
  let provider: FakeStorageProvider;
  let model: ReturnType<typeof buildModel>;
  let reportSet: DbSet<Report>;
  let taskSet: DbSet<Task>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    taskSet = new DbSet<Task>(Task, model, provider, tracker);
  });

  it("renames a folder and takes its contents with it", async () => {
    await provider.ensureFoldersAsync(reports, ["responses/r-1"]);
    await provider.uploadFileAsync(
      reports,
      "/sites/dev/Reports/responses/r-1",
      { fileName: "a.pdf", content: "x", overwrite: false, fields: [] },
    );
    await reportSet.renameFolderAsync("responses/r-1", "r-1-approved");
    expect(provider.getFolders(reports).sort()).toEqual([
      "responses",
      "responses/r-1-approved",
    ]);
    expect(provider.getFiles(reports)).toEqual([
      "/sites/dev/Reports/responses/r-1-approved/a.pdf",
    ]);
  });

  it("works on a plain list, not just a document library", async () => {
    await provider.ensureFoldersAsync({ kind: "title", value: "Tasks" }, [
      "q1",
    ]);
    await taskSet.renameFolderAsync("q1", "q1-done");
    expect(provider.getFolders({ kind: "title", value: "Tasks" })).toEqual([
      "q1-done",
    ]);
  });

  it("normalizes the folder path before it reaches the provider", async () => {
    await provider.ensureFoldersAsync(reports, ["a/b"]);
    await reportSet.renameFolderAsync("/a//b/", "c");
    expect(provider.getFolders(reports).sort()).toEqual(["a", "a/c"]);
  });

  it("refuses the list root, a traversing path, and a bad new name", async () => {
    await expect(reportSet.renameFolderAsync("", "x")).rejects.toThrow(
      /list root/,
    );
    await expect(reportSet.renameFolderAsync("a/../b", "x")).rejects.toThrow(
      /'\.\.' segments/,
    );
    await expect(reportSet.renameFolderAsync("a", "  ")).rejects.toThrow(
      /non-empty name/,
    );
    await expect(reportSet.renameFolderAsync("a", "b/c")).rejects.toThrow(
      /path separator/,
    );
  });

  it("propagates a destination collision from the provider", async () => {
    await provider.ensureFoldersAsync(reports, ["a", "b"]);
    await expect(reportSet.renameFolderAsync("a", "b")).rejects.toThrow(
      /already exists/,
    );
  });
});
