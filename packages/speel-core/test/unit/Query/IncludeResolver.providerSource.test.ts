import { describe, it, expect } from "vitest";
import { planIncludeLevel } from "../../../src/Query/IncludeResolver.js";
import { dedupeReadOperations } from "../../../src/Query/ReadBatch.js";
import { DbContext } from "../../../src/DbContext.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../../src/initSpeelDbContext.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import {
  TestPrincipal,
  TestSiteUser,
  PRINCIPALS,
  SITE_USERS,
  registerTestPrincipals,
} from "../fakes/testPrincipals.js";

class Doc {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: TestPrincipal;
  ReviewersId?: number[];
  Reviewers?: TestPrincipal[];
  EditorUserId?: number;
  EditorUser?: TestSiteUser;
}
class Ctx extends DbContext {
  docs = this.set(Doc);
  protected onModelCreating(mb: ModelBuilder): void {
    registerTestPrincipals(mb, ["principals", "siteUsers"]);
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      b.hasOne(TestPrincipal, (d) => d.Owner)
        .withMany()
        .hasForeignKey((d) => d.OwnerId);
      b.hasMany(TestPrincipal, (d) => d.Reviewers)
        .withMany()
        .hasForeignKey((d) => d.ReviewersId);
      b.hasOne(TestSiteUser, (d) => d.EditorUser)
        .withMany()
        .hasForeignKey((d) => d.EditorUserId);
    });
  }
}

describe("include over a provider-source target", () => {
  it("plans itemsByIds against the target's provider source with its properties", () => {
    const fake = new FakeStorageProvider();
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
    const doc = ctx.model.findEntityType(Doc)!;
    const ops = planIncludeLevel(
      [{ Id: 1, OwnerId: 7 }],
      doc.findNavigation("Owner")!,
      fake,
      () => "t0",
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "itemsByIds",
      source: PRINCIPALS,
      ids: [7],
    });
    expect((ops[0] as { properties: unknown }).properties).toBe(
      ctx.model.findEntityType(TestPrincipal)!.properties,
    );
    expect((ops[0] as { fields: readonly string[] }).fields).toEqual(
      ctx.model.findEntityType(TestPrincipal)!.columnNames,
    );
  });

  it("two navs against the same source merge into one read; a different source stays separate", () => {
    const fake = new FakeStorageProvider();
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
    const doc = ctx.model.findEntityType(Doc)!;
    let n = 0;
    const ops = [
      ...planIncludeLevel(
        [{ Id: 1, OwnerId: 7 }],
        doc.findNavigation("Owner")!,
        fake,
        () => `t${n++}`,
      ),
      ...planIncludeLevel(
        [{ Id: 1, ReviewersId: [7, 8] }],
        doc.findNavigation("Reviewers")!,
        fake,
        () => `t${n++}`,
      ),
      ...planIncludeLevel(
        [{ Id: 1, EditorUserId: 7 }],
        doc.findNavigation("EditorUser")!,
        fake,
        () => `t${n++}`,
      ),
    ];
    const { ops: merged, remap } = dedupeReadOperations(ops);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ source: PRINCIPALS, ids: [7, 8] });
    expect(merged[1]).toMatchObject({ source: SITE_USERS, ids: [7] });
    expect(remap.get("t1")).toBe("t0");
    expect(remap.has("t2")).toBe(false);
  });

  it("resolves the include end to end and reports PrincipalType", async () => {
    const fake = new FakeStorageProvider();
    fake.seedPrincipal({
      Id: 7,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      PrincipalType: 1,
    });
    fake.seedPrincipal({
      Id: 8,
      Title: "Auditors",
      LoginName: "Auditors",
      PrincipalType: 8,
    });
    fake.seedRow(
      { kind: "title", value: "Docs" },
      { Title: "d", OwnerId: 7, ReviewersId: [7, 8] },
    );
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
    const [d] = await ctx.docs
      .include((x) => x.Owner)
      .include((x) => x.Reviewers)
      .toArrayAsync();
    expect(d!.Owner).toBeInstanceOf(TestPrincipal);
    expect(d!.Owner!.PrincipalType).toBe(1);
    expect(d!.Reviewers!.map((r) => r.PrincipalType)).toEqual([1, 8]);
    expect(d!.Reviewers![0]).toBe(d!.Owner); // identity map: one instance per id
  });
});
