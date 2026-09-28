import { describe, it, expect } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { DbContext, ModelBuilder } from "../../../src/index.js";
import { DbUpdateException } from "../../../src/errors.js";
import type {
  IBatchOperation,
  IWriteField,
} from "../../../src/providers/ISharePointProvider.js";
import {
  TestPrincipal as Principal,
  registerTestPrincipals,
} from "../fakes/testPrincipals.js";

class Tag {
  Id?: number;
  Title?: string;
}

class Doc {
  Id?: number;
  Title?: string;
  Tags?: Tag[];
  TagsId?: number[];
  Reviewers?: Principal[];
  ReviewersId?: number[];
  Cats?: string[];
}

// The person navigation targets a provider-source entity — the fake validates a
// person column by its target's source, exactly as the real provider resolves it.
class DocCtx extends DbContext {
  protected onModelCreating(b: ModelBuilder): void {
    registerTestPrincipals(b, ["principals"]);
    b.entity(Tag, (e) => {
      e.toList("Tags");
      e.property((t) => t.Title).isText();
    });
    b.entity(Doc, (e) => {
      e.toList("Docs");
      e.property((d) => d.Title).isText();
      e.property((d) => d.Cats)
        .isMultiChoice()
        .hasOptions(["Red", "Blue"]);
      e.hasMany(Tag, (d) => d.Tags)
        .withMany()
        .hasForeignKey((d) => d.TagsId);
      e.hasMany(Principal, (d) => d.Reviewers)
        .withMany()
        .hasForeignKey((d) => d.ReviewersId);
    });
  }
}

function setup() {
  const provider = new FakeStorageProvider();
  const model = new DocCtx({ provider }).model;
  const tracker = new ChangeTracker(model);
  const ops: IBatchOperation[] = [];
  const origExec = provider.executeBatchAsync.bind(provider);
  provider.executeBatchAsync = async (batch) => {
    ops.push(...batch);
    return origExec(batch);
  };
  return {
    model,
    provider,
    tracker,
    ops,
    et: model.findEntityType(Doc)!,
    list: { kind: "title" as const, value: "Docs" },
  };
}

function byColumn(fields: readonly IWriteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [f.property.columnName, f.value]),
  );
}

function inserts(ops: readonly IBatchOperation[]) {
  return ops.filter(
    (o): o is Extract<IBatchOperation, { kind: "insert" }> =>
      o.kind === "insert",
  );
}

describe("SaveExecutor folder placement", () => {
  it("ensures folders and routes a foldered add through insert with the folder URL, reconciling the id", async () => {
    const s = setup();
    const d = new Doc();
    d.Title = "Report";
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFolder = "folder1/nested";

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync()).toBe(1);

    expect(s.ops.map((o) => o.kind)).toEqual(["insert"]);
    expect(inserts(s.ops)[0]!.folderServerRelativeUrl).toBe(
      "/sites/dev/Docs/folder1/nested",
    );
    expect(s.provider.getFolders(s.list).sort()).toEqual([
      "folder1",
      "folder1/nested",
    ]);
    expect(d.Id).toBeGreaterThan(0);
    expect(entry.state).toBe(EntityState.Unchanged);
  });

  it("a plain add and a foldered add are both inserts — the root one with a null folder", async () => {
    const s = setup();
    const plain = new Doc();
    plain.Title = "root";
    s.tracker.track(plain, EntityState.Added);
    const foldered = new Doc();
    foldered.Title = "inFolder";
    s.tracker.track(foldered, EntityState.Added).targetFolder = "a";

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync()).toBe(2);
    expect(
      inserts(s.ops).map((o) => [
        byColumn(o.fields).Title,
        o.folderServerRelativeUrl,
      ]),
    ).toEqual([
      ["root", null],
      ["inFolder", "/sites/dev/Docs/a"],
    ]);
  });

  it("hands the same typed fields to both paths — no form encoder in core", async () => {
    const s = setup();
    const plain = new Doc();
    plain.Title = "Report";
    plain.TagsId = [3, 7];
    plain.Cats = ["Red", "Blue"];
    s.tracker.track(plain, EntityState.Added);
    const foldered = new Doc();
    foldered.Title = "Report";
    foldered.TagsId = [3, 7];
    foldered.Cats = ["Red", "Blue"];
    s.tracker.track(foldered, EntityState.Added).targetFolder = "a";

    await new SaveExecutor(s.model, s.provider, s.tracker).saveChangesAsync();

    const [root, inFolder] = inserts(s.ops);
    const expected = { Title: "Report", TagsId: [3, 7], Cats: ["Red", "Blue"] };
    expect(byColumn(root!.fields)).toEqual(expected);
    expect(byColumn(inFolder!.fields)).toEqual(expected);
    // The provider gets the model's own Property, not a copy of its members.
    for (const f of inFolder!.fields) {
      expect(f.property).toBe(s.et.findProperty(f.property.propertyName));
    }
    expect(
      await s.provider.getItemByIdAsync(s.list, foldered.Id!, [
        "Title",
        "TagsId",
        "Cats",
        "__folder",
      ]),
    ).toMatchObject({
      Title: "Report",
      TagsId: [3, 7],
      Cats: ["Red", "Blue"],
      __folder: "/sites/dev/Docs/a",
    });
  });
});

describe("SaveExecutor person columns", () => {
  const ada = {
    Id: 1,
    Title: "Ada",
    LoginName: "i:0#.f|m|a@x",
    PrincipalType: 1 as const,
  };
  const members = {
    Id: 2,
    Title: "Audit Members",
    LoginName: "Audit Members",
    PrincipalType: 8 as const,
  };

  it("hands person ids to the provider typed; the provider resolves them — core runs no pre-pass", async () => {
    const s = setup();
    s.provider.seedPrincipal(ada);
    s.provider.seedPrincipal(members);
    let principalReads = 0;
    const origByIds = s.provider.getItemsByIdsAsync.bind(s.provider);
    s.provider.getItemsByIdsAsync = async (source, ids, fields, opts) => {
      if (source.kind === "provider") principalReads++;
      return origByIds(source, ids, fields, opts);
    };

    const d = new Doc();
    d.Title = "Report";
    d.ReviewersId = [1, 2];
    s.tracker.track(d, EntityState.Added).targetFolder = "a";
    expect(
      await new SaveExecutor(s.model, s.provider, s.tracker).saveChangesAsync(),
    ).toBe(1);

    // The ids went across as the field's typed value, under the FK's Property…
    const [op] = inserts(s.ops);
    expect(byColumn(op!.fields).ReviewersId).toEqual([1, 2]);
    // …core read no principal itself; the FAKE resolved both ids against its
    // registry, which is what the real provider does with claims.
    expect(principalReads).toBe(0);
    expect(s.provider.principalResolves()).toEqual([1, 2]);
    expect(
      await s.provider.getItemByIdAsync(s.list, d.Id!, [
        "Title",
        "ReviewersId",
      ]),
    ).toMatchObject({ Title: "Report", ReviewersId: [1, 2] });
  });

  it("a file upload carries its person column the same way", async () => {
    const s = setup();
    s.provider.seedPrincipal(ada);
    let sent: readonly IWriteField[] | undefined;
    const origUpload = s.provider.uploadFileAsync.bind(s.provider);
    s.provider.uploadFileAsync = async (list, folderUrl, request) => {
      sent = request.fields;
      return origUpload(list, folderUrl, request);
    };

    const d = new Doc();
    d.Title = "Report";
    d.ReviewersId = [1];
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFile = {
      fileName: "q2.pdf",
      content: "data!",
      overwrite: false,
    };
    await new SaveExecutor(s.model, s.provider, s.tracker).saveChangesAsync();

    expect(byColumn(sent!)).toEqual({ Title: "Report", ReviewersId: [1] });
    expect(s.provider.principalResolves()).toEqual([1]);
    expect(
      await s.provider.getItemByIdAsync(s.list, d.Id!, ["ReviewersId"]),
    ).toMatchObject({ ReviewersId: [1] });
  });

  it("a person the provider cannot resolve fails the save as a write failure, never a dropped value", async () => {
    const s = setup();
    const d = new Doc();
    d.Title = "Report";
    d.ReviewersId = [1]; // no such principal anywhere
    s.tracker.track(d, EntityState.Added).targetFolder = "a";

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(exe.saveChangesAsync()).rejects.toThrow(DbUpdateException);
    expect(d.Id).toBeUndefined();
  });
});
