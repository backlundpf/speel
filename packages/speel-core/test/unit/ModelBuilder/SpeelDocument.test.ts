import { describe, it, expect } from "vitest";
import { and } from "../../../src/Query/FilterNode.js";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";
import { SiteUser } from "../../../src/SiteUser.js";

class Report extends SpeelDocument {
  Title: string | null = null;
}
class Task extends SpeelEntity {
  Title: string | null = null;
}
class Custom extends SpeelDocument {
  Title: string | null = null;
  FileLeafRef?: string; // explicitly configured below — refines the inherited declaration
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) => {
    b.toProviderSource({ kind: "provider", key: "principals" });
    b.property((e) => e.Title).isText();
  });
  mb.entity(Report, (b) => {
    b.toList("Reports");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Task, (b) => {
    b.toList("Tasks");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Custom, (b) => {
    b.toList("Customs");
    b.property((e) => e.Title).isText();
    b.property((e) => e.FileLeafRef)
      .isText()
      .hasDisplayName("Name")
      .isReadOnly(false)
      .isVisible(true);
  });
  return mb.build();
}

describe("SpeelDocument class", () => {
  it("fresh instances have the file fields undefined (so add() is not tripped)", () => {
    const r = new Report() as unknown as Record<string, unknown>;
    for (const name of [
      "FSObjType",
      "FileDirRef",
      "FileLeafRef",
      "FileRef",
      "FileSize",
      "CheckedOutById",
      "CheckedOutBy",
    ]) {
      expect(name in r).toBe(true);
      expect(r[name]).toBeUndefined();
    }
  });
});

describe("file system columns on SpeelEntity", () => {
  it("every SpeelEntity subclass gets FSObjType, FileDirRef, FileLeafRef and FileRef, read-only and invisible", () => {
    const et = buildModel().findEntityType(Task)!;
    const fso = et.findProperty("FSObjType")!;
    expect(fso.config.kind).toBe("Number");
    expect(fso.readOnly).toBe(true);
    expect(fso.visible).toBe(false);
    // FileLeafRef/FileRef are valid on every list item — and a folder row's
    // FileLeafRef is its name, which is what makes folders queryable on plain lists.
    for (const name of ["FileDirRef", "FileLeafRef", "FileRef"]) {
      const p = et.findProperty(name)!;
      expect(p.config.kind).toBe("Text");
      expect(p.readOnly).toBe(true);
      expect(p.visible).toBe(false);
    }
    // The document-only member stays document-only.
    expect(et.findProperty("FileSize")).toBeUndefined();
    // …so no path-shaped column reaches $select, and no $expand is ever derived.
    expect(et.columnNames.some((c) => c.includes("/"))).toBe(false);
  });

  it("a folder row on a plain list is queryable by FSObjType + FileLeafRef", async () => {
    const model = buildModel();
    const provider = new FakeStorageProvider();
    const tracker = new ChangeTracker(model);
    const set = new DbSet<Task>(Task, model, provider, tracker);
    provider.seedRow(
      { kind: "title", value: "Tasks" },
      { Title: "REQ-1", FSObjType: 1, FileLeafRef: "REQ-1" },
    );
    provider.seedRow(
      { kind: "title", value: "Tasks" },
      { Title: "an item", FSObjType: 0, FileLeafRef: "2_.000" },
    );

    const folders = await set
      .where((b) =>
        and(b.includeFolders(), b.FSObjType.eq(1), b.FileLeafRef.eq("REQ-1")),
      )
      .toArrayAsync();
    expect(folders).toHaveLength(1);
    expect(folders[0]!.FileLeafRef).toBe("REQ-1");
    expect(folders[0]!.FSObjType).toBe(1);
  });

  it("a SpeelDocument subclass additionally gets FileLeafRef + FileRef (Text, read-only, invisible)", () => {
    const et = buildModel().findEntityType(Report)!;
    for (const name of ["FileLeafRef", "FileRef"]) {
      const p = et.findProperty(name)!;
      expect(p.config.kind).toBe("Text");
      expect(p.readOnly).toBe(true);
      expect(p.visible).toBe(false);
    }
  });

  it("a SpeelDocument subclass gets FileSize, mapped to the expanded File/Length path", () => {
    const et = buildModel().findEntityType(Report)!;
    const p = et.findProperty("FileSize")!;
    expect(p.columnName).toBe("File/Length"); // NOT the computed 'File_x0020_Size' column
    expect(p.config.kind).toBe("Number");
    expect(p.readOnly).toBe(true);
    expect(p.visible).toBe(false);
    expect(et.columnNames).toContain("File/Length");
  });

  it("a SpeelDocument subclass gets CheckedOutById, mapped to the CheckoutUserId column", () => {
    const et = buildModel().findEntityType(Report)!;
    const p = et.findProperty("CheckedOutById")!;
    // SharePoint's field is 'CheckoutUser'; REST surfaces the User field's id as
    // '<Name>Id', exactly as it does for Author/Editor.
    expect(p.columnName).toBe("CheckoutUserId");
    expect(p.config.kind).toBe("Lookup");
    expect(p.readOnly).toBe(true);
    expect(et.columnNames).toContain("CheckoutUserId");
    // Plain SpeelEntity does not get it — 'CheckoutUser' only exists on libraries.
    const task = buildModel().findEntityType(Task)!;
    expect(task.findProperty("CheckedOutById")).toBeUndefined();
    expect(task.columnNames).not.toContain("CheckoutUserId");
  });

  it("a SpeelDocument subclass gets a read-only CheckedOutBy nav onto SiteUser", () => {
    const et = buildModel().findEntityType(Report)!;
    const nav = et.findNavigation("CheckedOutBy")!;
    expect(nav.columnName).toBe("CheckoutUser");
    expect(nav.readOnly).toBe(true);
    expect(nav.visible).toBe(false); // stays out of forms and default columns
    expect(nav.target.ctor).toBe(SiteUser);
    expect(nav.foreignKey.propertyName).toBe("CheckedOutById");
    expect(
      buildModel().findEntityType(Task)!.findNavigation("CheckedOutBy"),
    ).toBeUndefined();
  });

  it("materializes CheckoutUserId off a read onto CheckedOutById", async () => {
    const model = buildModel();
    const provider = new FakeStorageProvider();
    const tracker = new ChangeTracker(model);
    const set = new DbSet<Report>(Report, model, provider, tracker);
    provider.seedRow(
      { kind: "title", value: "Reports" },
      { Title: "Q2", CheckoutUserId: 42 },
    );
    const [row] = await set.toArrayAsync();
    expect(row!.CheckedOutById).toBe(42);
  });

  it("resolves CheckedOutBy through .include(), the people-field path", async () => {
    const model = buildModel();
    const provider = new FakeStorageProvider();
    // Same route Author/Editor use: an itemsByIds read on the principals
    // provider source, not an inline $expand of the people field.
    provider.seedPrincipal({
      Id: 42,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      PrincipalType: 1,
    });
    const tracker = new ChangeTracker(model, provider);
    const set = new DbSet<Report>(Report, model, provider, tracker);
    provider.seedRow(
      { kind: "title", value: "Reports" },
      { Title: "Q2", CheckoutUserId: 42 },
    );
    const [row] = await set.include((e) => e.CheckedOutBy).toArrayAsync();
    expect(row!.CheckedOutBy).toMatchObject({ Id: 42, Title: "Ada" });
  });

  it("rejects a model mapping any property to the computed 'File_x0020_Size' column", () => {
    class Legacy extends SpeelDocument {
      Title: string | null = null;
      Size?: number = undefined;
    }
    const mb = new ModelBuilder();
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    );
    mb.entity(Legacy, (b) => {
      b.toList("Legacies");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Size)
        .isNumber()
        .hasColumnName("File_x0020_Size")
        .isReadOnly();
    });
    // Without this the model builds fine and the tenant answers the query with
    // "The field or property 'File_x0020_Size' does not exist."
    expect(() => mb.build()).toThrow(/File_x0020_Size/);
    expect(() => mb.build()).toThrow(/FileSize/);
  });

  it("explicit fluent configuration refines an inherited system member (the fluent call lands on the decorator's builder)", () => {
    const et = buildModel().findEntityType(Custom)!;
    const p = et.findProperty("FileLeafRef")!;
    expect(p.displayName).toBe("Name"); // the user's config, layered over the inherited one
    expect(p.readOnly).toBe(false);
    expect(p.visible).toBe(true);
  });
});

describe("SpeelDocument + Phase 2 save reflection (integration)", () => {
  it("a SpeelDocument saved with { file } gets FileLeafRef/FileRef populated, no per-model config", async () => {
    const model = buildModel();
    const provider = new FakeStorageProvider();
    const tracker = new ChangeTracker(model);
    const set = new DbSet<Report>(Report, model, provider, tracker);

    const r = new Report();
    r.Title = "Q2";
    const entry = set.add(r, { file: { name: "q2.pdf", content: "data" } });

    const exe = new SaveExecutor(model, provider, tracker);
    expect(await exe.saveChangesAsync()).toBe(1);

    expect(r.Id).toBeGreaterThan(0);
    expect(r.FileLeafRef).toBe("q2.pdf");
    expect(r.FileRef).toBe("/sites/dev/Reports/q2.pdf");
    expect(entry.state).toBe(EntityState.Unchanged);
    expect(entry.getDirtyColumns()).toEqual([]); // snapshot covers the reflections
  });
});
