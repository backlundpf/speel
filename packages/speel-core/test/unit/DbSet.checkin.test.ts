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

describe("DbSet.checkinFileAsync", () => {
  let provider: FakeStorageProvider;
  let tracker: ChangeTracker;
  let reportSet: DbSet<Report>;
  let taskSet: DbSet<Task>;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    tracker = new ChangeTracker(model, provider);
    reportSet = new DbSet<Report>(Report, model, provider, tracker);
    taskSet = new DbSet<Task>(Task, model, provider, tracker);
  });

  /** Upload a file into the fake library, checked out to `userId` unless null. */
  async function seedFile(userId: number | null = 7): Promise<number> {
    const url = (await provider.ensureFoldersAsync(reports, ["a"])).get("a")!;
    const res = await provider.uploadFileAsync(reports, url, {
      fileName: "q2.pdf",
      content: "bytes",
      overwrite: false,
      fields: [{ property: textProperty("Title"), value: "Q2" }],
    });
    if (userId !== null) provider.checkOutFile(reports, res.id, userId);
    return res.id;
  }

  /** Upload, then load it through the set so the entity is tracked. */
  async function seedDoc(userId: number | null = 7): Promise<Report> {
    const id = await seedFile(userId);
    const loaded = await reportSet.findAsync(id);
    if (!loaded) throw new Error("seed failed");
    return loaded;
  }

  it("checks the file in and clears CheckedOutById/CheckedOutBy in memory", async () => {
    const doc = await seedDoc();
    expect(doc.CheckedOutById).toBe(7);

    await reportSet.checkinFileAsync(doc);

    // Cleared the way a re-read would present it: materialization maps an empty
    // SharePoint value to undefined, so that is what "checked in" looks like.
    expect(doc.CheckedOutById).toBeUndefined();
    expect(doc.CheckedOutBy).toBeUndefined();
    expect(provider.checkins(reports)).toEqual([{ id: doc.Id, comment: "" }]);
  });

  it("passes the comment through", async () => {
    const doc = await seedDoc();
    await reportSet.checkinFileAsync(doc, "ready for review");
    expect(provider.checkins(reports)).toEqual([
      { id: doc.Id, comment: "ready for review" },
    ]);
  });

  it("leaves a tracked, unchanged entity unchanged (the checkin is not a pending edit)", async () => {
    const doc = await seedDoc();
    await reportSet.checkinFileAsync(doc);
    tracker.detectChanges();
    expect(tracker.findEntry(Report, doc.Id!)?.state).toBe(
      EntityState.Unchanged,
    );
  });

  it("keeps pending scalar edits on a dirty entity", async () => {
    const doc = await seedDoc();
    doc.Title = "edited";
    await reportSet.checkinFileAsync(doc);
    tracker.detectChanges();
    const entry = tracker.findEntry(Report, doc.Id!)!;
    expect(entry.state).toBe(EntityState.Modified);
    expect(entry.getDirtyColumns()).toContain("Title");
  });

  it("works on an untracked instance (never loaded through the set)", async () => {
    const id = await seedFile();
    const loose = new Report();
    loose.Id = id;
    await reportSet.checkinFileAsync(loose, "loose");
    expect(loose.CheckedOutById).toBeUndefined();
    expect(provider.checkins(reports)).toEqual([{ id, comment: "loose" }]);
  });

  it("rejects a non-document entity before any I/O", async () => {
    const t = new Task();
    t.Id = 3;
    await expect(taskSet.checkinFileAsync(t)).rejects.toThrow(
      InvalidOperationException,
    );
    await expect(taskSet.checkinFileAsync(t)).rejects.toThrow(/SpeelDocument/);
  });

  it("rejects an unsaved entity (no Id)", async () => {
    await expect(reportSet.checkinFileAsync(new Report())).rejects.toThrow(
      /requires a saved entity/,
    );
  });

  it("surfaces the server's refusal when the file is not checked out", async () => {
    // No client-side pre-check: a loaded-but-checked-in document materializes
    // CheckedOutById as undefined, exactly like one that never loaded the
    // column, so the only honest arbiter is the server.
    const doc = await seedDoc(null);
    expect(doc.CheckedOutById).toBeUndefined();
    await expect(reportSet.checkinFileAsync(doc)).rejects.toThrow(
      /not checked out/,
    );
    expect(provider.checkins(reports)).toEqual([]);
  });

  it("still calls out for an entity whose checkout state was never loaded", async () => {
    const id = await seedFile(7);
    const loose = new Report();
    loose.Id = id;
    expect(loose.CheckedOutById).toBeUndefined(); // unknown, not "checked in"
    await expect(reportSet.checkinFileAsync(loose)).resolves.toBeUndefined();
    expect(provider.checkins(reports)).toEqual([{ id, comment: "" }]);
  });
});
