import { describe, it, expect } from "vitest";
import {
  initSpeelDbContext,
  type ModelBuilder,
  SpeelEntity,
  TextField,
  Key,
  Entity,
  Principal,
  SiteUser,
  SiteGroup,
} from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { IdentityDbContext } from "../src/IdentityDbContext.js";

class Ctx extends IdentityDbContext {}

@Entity({ list: "Notes" })
class Note extends SpeelEntity {
  @Key public override Id?: number = undefined;
  @TextField() public Title: string | null = null;
}
class NoteCtx extends IdentityDbContext {
  notes = this.set(Note);
}

const seeded = () => {
  const sp = new FakeStorageProvider();
  sp.seedPrincipal({
    Id: 1,
    Title: "Ada",
    LoginName: "i:0#.f|m|ada",
    Email: "ada@x",
    PrincipalType: 1,
  });
  sp.seedPrincipal({
    Id: 2,
    Title: "Auditors",
    LoginName: "Auditors",
    PrincipalType: 8,
    Description: "d",
  });
  sp.seedPrincipal({
    Id: 3,
    Title: "Everyone",
    LoginName: "c:0-.f|x",
    PrincipalType: 4,
  });
  return sp;
};

describe("IdentityDbContext principal sets", () => {
  it("declares principals, siteUsers, siteGroups as sets over the three provider sources, in model spelling", () => {
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(seeded()));
    expect(ctx.model.findEntityType(Principal)!.source).toEqual({
      kind: "provider",
      key: "principals",
    });
    expect(ctx.model.findEntityType(SiteUser)!.source).toEqual({
      kind: "provider",
      key: "siteUsers",
    });
    expect(ctx.model.findEntityType(SiteGroup)!.source).toEqual({
      kind: "provider",
      key: "siteGroups",
    });
    expect(ctx.model.findEntityType(SiteGroup)!.columnNames).toEqual(
      expect.arrayContaining([
        "ID",
        "Title",
        "LoginName",
        "Email",
        "PrincipalType",
        "Description",
        "OwnerTitle",
      ]),
    );
  });

  it("reads each view: the UIL collapses 4 into 8, siteUsers keeps 4, siteGroups is the 8s", async () => {
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(seeded()));
    expect(
      (await ctx.principals.toArrayAsync()).map((p) => [p.Id, p.PrincipalType]),
    ).toEqual([
      [1, 1],
      [2, 8],
      [3, 8],
    ]);
    expect(
      (await ctx.siteUsers.toArrayAsync()).map((p) => [p.Id, p.PrincipalType]),
    ).toEqual([
      [1, 1],
      [3, 4],
    ]);
    const groups = await ctx.siteGroups.toArrayAsync();
    expect(groups.map((g) => g.Id)).toEqual([2]);
    expect(groups[0]).toBeInstanceOf(SiteGroup);
    expect(groups[0]!.Description).toBe("d");
  });

  it("SpeelEntity's Author targets SiteUser on an IdentityDbContext", () => {
    const ctx = initSpeelDbContext(NoteCtx, (b) => b.useProvider(seeded()));
    expect(
      ctx.model.findEntityType(Note)!.findNavigation("Author")!.target,
    ).toBe(ctx.model.findEntityType(SiteUser));
  });

  it("a fluent hasOne(Principal) in onModelCreating resolves against the set()-declared Principal at build", () => {
    class Proj {
      Id?: number;
      Title?: string;
      OwnerId?: number;
      Owner?: Principal;
    }
    class ProjCtx extends IdentityDbContext {
      projects = this.set(Proj);
      protected override onModelCreating(b: ModelBuilder): void {
        super.onModelCreating(b);
        b.entity(Proj, (e) => {
          e.toList("Projects");
          e.property((p) => p.Title).isText();
          e.hasOne(Principal, (p) => p.Owner)
            .withMany()
            .hasForeignKey((p) => p.OwnerId);
        });
      }
    }
    const ctx = initSpeelDbContext(ProjCtx, (b) => b.useProvider(seeded()));
    const nav = ctx.model.findEntityType(Proj)!.findNavigation("Owner")!;
    expect(nav.target).toBe(ctx.model.findEntityType(Principal));
    expect(nav.foreignKey.config.kind).toBe("Lookup");
  });

  it("an app refines Principal by merging onto the decorator's builder", () => {
    class RefinedCtx extends IdentityDbContext {
      protected override onModelCreating(b: ModelBuilder): void {
        super.onModelCreating(b);
        b.entity(Principal, (e) => {
          // The decorator already typed Title; isText() returns that same builder.
          e.property((p) => p.Title)
            .isText()
            .hasDisplayName("Display name");
        });
      }
    }
    const ctx = initSpeelDbContext(RefinedCtx, (b) => b.useProvider(seeded()));
    const et = ctx.model.findEntityType(Principal)!;
    expect(et.findProperty("Title")!.displayName).toBe("Display name");
    expect(et.findProperty("LoginName")).toBeDefined(); // the decorator's columns survive the merge
    expect(et.source).toEqual({ kind: "provider", key: "principals" });
  });
});
