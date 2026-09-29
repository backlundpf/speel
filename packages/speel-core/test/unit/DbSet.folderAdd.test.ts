import { describe, it, expect } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { DbContext } from "../../src/DbContext.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import {
  TestPrincipal as Principal,
  registerTestPrincipals,
} from "./fakes/testPrincipals.js";

class Doc {
  Id?: number;
  Title?: string;
}

function makeSet() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Doc>({
    ctor: Doc,
    list: { kind: "title", value: "Docs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const tracker = new ChangeTracker(model);
  const set = new DbSet<Doc>(Doc, model, new FakeStorageProvider(), tracker);
  return { set };
}

describe("DbSet.add folder option", () => {
  it("stages a normalized targetFolder when { folder } is passed", () => {
    const { set } = makeSet();
    const entry = set.add(new Doc(), { folder: "/folder1//nested/" });
    expect(entry.targetFolder).toBe("folder1/nested");
  });
  it("leaves targetFolder undefined for a plain add", () => {
    const { set } = makeSet();
    const entry = set.add(new Doc());
    expect(entry.targetFolder).toBeUndefined();
  });
  it("treats an empty/whitespace folder as no folder", () => {
    const { set } = makeSet();
    const entry = set.add(new Doc(), { folder: "   " });
    expect(entry.targetFolder).toBeUndefined();
  });
});

class Report {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: Principal;
}

class ReportCtx extends DbContext {
  public reports = this.set(Report);
  protected override onModelCreating(builder: ModelBuilder): void {
    registerTestPrincipals(builder, ["principals"]);
    builder.entity(Report, (b) => {
      b.toList("Reports");
      b.property((r) => r.Title).isText();
      b.hasOne(Principal, (r) => r.Owner)
        .withMany()
        .hasForeignKey((r) => r.OwnerId);
    });
  }
}

describe("DbContext folder add with a person column", () => {
  it("hands the person id to the provider as the FK's typed value; the provider resolves it", async () => {
    const provider = new FakeStorageProvider();
    provider.seedPrincipal({
      Id: 4,
      Title: "A",
      LoginName: "i:0#.f|membership|a@x",
      PrincipalType: 1,
    });
    const ctx = new ReportCtx({ provider });

    let sentOwner: unknown;
    const origExec = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (ops) => {
      for (const o of ops) {
        if (o.kind === "insert") {
          sentOwner = o.fields.find(
            (f) => f.property.columnName === "OwnerId",
          )?.value;
        }
      }
      return origExec(ops);
    };

    const r = new Report();
    r.Title = "Q2";
    r.OwnerId = 4;
    ctx.reports.add(r, { folder: "2026" });
    await ctx.saveChangesAsync();

    expect(sentOwner).toBe(4);
    // Core resolved nothing: the fake looked the id up in its own registry.
    expect(provider.principalResolves()).toEqual([4]);
  });

  it("reads a single-value person column back as the id it was given", async () => {
    const provider = new FakeStorageProvider();
    provider.seedPrincipal({
      Id: 4,
      Title: "A",
      LoginName: "i:0#.f|membership|a@x",
      PrincipalType: 1,
    });
    const ctx = new ReportCtx({ provider });

    const r = new Report();
    r.Title = "Q2";
    r.OwnerId = 4;
    ctx.reports.add(r, { folder: "2026" });
    await ctx.saveChangesAsync();

    // The typed insert carries the FK's own value, so the fake — which stores what
    // it is given — no longer has to guess a cardinality from a claims array.
    expect(
      await provider.getItemByIdAsync(
        { kind: "title", value: "Reports" },
        r.Id!,
        ["OwnerId"],
      ),
    ).toMatchObject({ OwnerId: 4 });
  });
});
