import { describe, it, expect, vi } from "vitest";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Materialize } from "../../../src/Query/Materialize.js";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";
import { DbSet } from "../../../src/DbSet.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";
import { SiteUser } from "../../../src/SiteUser.js";

class Doc extends SpeelEntity {
  Title: string | null = null;
}

class Plain {
  Id?: number;
  Title?: string;
} // does NOT extend SpeelEntity

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Doc, (b) => {
    b.toList("Docs");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Plain, (b) => {
    b.toList("Plains");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

describe("SpeelEntity class", () => {
  it("a fresh subclass instance has all system fields undefined (so add() is not tripped)", () => {
    const d = new Doc() as unknown as Record<string, unknown>;
    for (const name of [
      "Id",
      "Created",
      "Modified",
      "AuthorId",
      "Author",
      "EditorId",
      "Editor",
    ]) {
      expect(d[name]).toBeUndefined();
    }
  });

  it("system fields physically exist on the instance (own enumerable, undefined-valued)", () => {
    const d = new Doc();
    expect("Created" in d).toBe(true);
    expect("Author" in d).toBe(true);
  });
});

describe("SpeelEntity system columns", () => {
  it("declares read-only Created/Modified DateTime columns", () => {
    const et = buildModel().findEntityType(Doc)!;
    for (const name of ["Created", "Modified"]) {
      const p = et.findProperty(name)!;
      expect(p.config.kind).toBe("DateTime");
      expect(p.readOnly).toBe(true);
    }
  });

  it("a non-SpeelEntity entity has no system columns", () => {
    const et = buildModel().findEntityType(Plain)!;
    expect(et.findProperty("Created")).toBeUndefined();
    expect(et.findProperty("Modified")).toBeUndefined();
  });
});

describe("SpeelEntity system navigations", () => {
  it("declares read-only AuthorId/EditorId User columns", () => {
    const et = buildModel().findEntityType(Doc)!;
    for (const name of ["AuthorId", "EditorId"]) {
      const p = et.findProperty(name)!;
      expect(p.config.kind).toBe("Lookup");
      if (p.config.kind === "Lookup") expect(p.config.multi).toBe(false);
      expect(p.readOnly).toBe(true);
    }
  });

  it("declares Author/Editor reference navigations targeting SiteUser (pulled in by reference)", () => {
    const m = buildModel();
    const et = m.findEntityType(Doc)!;
    const author = et.findNavigation("Author")!;
    expect(author.kind).toBe("reference");
    expect(author.target).toBe(m.findEntityType(SiteUser));
    expect(author.foreignKey).toBe(et.findProperty("AuthorId"));
    const editor = et.findNavigation("Editor")!;
    expect(editor.foreignKey).toBe(et.findProperty("EditorId"));
  });

  it("a non-SpeelEntity entity has no system navigations", () => {
    const et = buildModel().findEntityType(Plain)!;
    expect(et.findNavigation("Author")).toBeUndefined();
  });

  it("user-defined navigation FK columns stay writable (readOnly defaults to false)", () => {
    class Owned extends SpeelEntity {
      Manager?: Principal;
      ManagerId?: number;
    }
    const mb = new ModelBuilder();
    mb.entity(Principal, (b) =>
      b.toProviderSource({ kind: "provider", key: "principals" }),
    );
    mb.entity(Owned, (b) => {
      b.toList("Owned");
      b.hasOne(Principal, (e) => e.Manager)
        .withMany()
        .hasForeignKey((e) => e.ManagerId);
    });
    const fk = mb.build().findEntityType(Owned)!.findProperty("ManagerId")!;
    expect(fk.config.kind).toBe("Lookup");
    expect(fk.readOnly).toBe(false);
  });
});

describe("SpeelEntity end-to-end behavior", () => {
  it("PayloadBuilder.buildForAdd excludes all system columns", () => {
    const et = buildModel().findEntityType(Doc)!;
    const d = new Doc();
    d.Title = "X";
    expect(
      PayloadBuilder.buildForAdd(d, et).map((f) => f.property.columnName),
    ).toEqual(["Title"]);
  });

  it("Materialize populates system columns from a typed provider record", () => {
    const et = buildModel().findEntityType(Doc)!;
    const d = Materialize.item(
      {
        ID: 5,
        Title: "Hi",
        Created: new Date("2026-01-02T03:04:05Z"),
        Modified: new Date("2026-02-03T04:05:06Z"),
        AuthorId: 9,
        EditorId: 11,
      },
      et,
    );
    expect(d.Created instanceof Date).toBe(true);
    expect(d.Created!.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect((d as unknown as { AuthorId?: number }).AuthorId).toBe(9);
    expect((d as unknown as { EditorId?: number }).EditorId).toBe(11);
  });

  it("DbSet.add succeeds on a fresh SpeelEntity subclass instance", () => {
    const model = buildModel();
    const provider = new FakeStorageProvider();
    const tracker = new ChangeTracker(model);
    const set = new DbSet<Doc>(Doc, model, provider, tracker);
    const d = new Doc();
    d.Title = "X";
    const entry = set.add(d);
    expect(entry.state).toBe(EntityState.Added);
  });

  it("DbSet.add warns about (and never writes) a set read-only system field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = buildModel();
    const provider = new FakeStorageProvider();
    const tracker = new ChangeTracker(model);
    const set = new DbSet<Doc>(Doc, model, provider, tracker);
    const d = new Doc();
    d.Title = "X";
    (d as unknown as { AuthorId?: number }).AuthorId = 3;
    expect(set.add(d).state).toBe(EntityState.Added);
    expect(String(warn.mock.calls[0]![0])).toContain("AuthorId");
    warn.mockRestore();
  });
});
