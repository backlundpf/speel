import { describe, it, expect, beforeEach } from "vitest";
import {
  DbContext,
  DbSet,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import {
  TestSiteUser as SiteUser,
  registerTestPrincipals,
} from "../fakes/testPrincipals.js";

class Programs {
  Id?: number;
  Title?: string;
}
class Doc {
  Id?: number;
  Title?: string;
  Owner?: SiteUser; // person field
  OwnerId?: number;
  Program?: Programs; // lookup field
  ProgramId?: number;
}

class DocCtx extends DbContext {
  public docs: DbSet<Doc> = this.set(Doc);
  public programs: DbSet<Programs> = this.set(Programs);
  protected override onModelCreating(mb: ModelBuilder): void {
    registerTestPrincipals(mb, ["siteUsers"]);
    mb.entity(Programs, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Title).isText();
      b.hasOne(SiteUser, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId);
      b.hasOne(Programs, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId);
    });
  }
}

const docs: IListHandle = { kind: "title", value: "Docs" };

describe("person-field expand", () => {
  let provider: FakeStorageProvider;
  let ctx: DocCtx;

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    provider.seedPrincipal({
      Id: 1,
      Title: "Jane",
      Email: "jane@x.com",
      LoginName: "i:0#.f|m|jane",
      PrincipalType: 1,
    });
    provider.seedRow(docs, { Title: "Doc", OwnerId: 1 });
    // An inline expand of a person column joins the principal registry.
    provider.registerJoin(docs, "Owner", {
      foreignKey: "OwnerId",
      targetSource: { kind: "provider", key: "siteUsers" },
    });
    ctx = initSpeelDbContext(DocCtx, (b) => b.useProvider(provider));
  });

  it("defaults a person-field expand to the target's whole column set", () => {
    // Which of these an inline person $expand can project (SharePoint rejects
    // PrincipalType) is the provider's business: the clause carries the target's
    // provider source, and the provider drops what the wire cannot answer.
    const su = ctx.model.findEntityType(SiteUser)!;
    const q = ctx.docs.expand((d) => d.Owner);
    expect(q.state.expands[0]!.fields).toEqual(su.columnNames);
  });

  it("leaves a lookup-field expand defaulting to its key and display field", () => {
    const q = ctx.docs.expand((d) => d.Program);
    expect(q.state.expands[0]!.fields).toEqual(["ID", "Title"]);
  });

  it("returns a fully-populated SiteUser from a person expand", async () => {
    const rows = await ctx.docs.expand((d) => d.Owner).toArrayAsync();
    expect(rows[0]!.Owner).toBeInstanceOf(SiteUser);
    expect(rows[0]!.Owner!.Title).toBe("Jane");
    expect(rows[0]!.Owner!.Email).toBe("jane@x.com");
    expect(rows[0]!.Owner!.LoginName).toBe("i:0#.f|m|jane");
  });
});
