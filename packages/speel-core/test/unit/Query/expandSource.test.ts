import { describe, it, expect } from "vitest";
import { DbContext } from "../../../src/DbContext.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../../src/initSpeelDbContext.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { resolveExpandFields } from "../../../src/Query/expandResolution.js";
import type {
  IExpandClause,
  IGetItemsOptions,
  ISourceHandle,
} from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Person {
  Id?: number;
  Title?: string;
  LoginName?: string;
  Email?: string;
  PrincipalType?: number;
}
class Program {
  Id?: number;
  Title?: string;
}
class Doc {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: Person;
  ProgramId?: number;
  Program?: Program;
}
const PRINCIPALS = { kind: "provider", key: "principals" } as const;

class Ctx extends DbContext {
  docs = this.set(Doc);
  protected onModelCreating(mb: ModelBuilder): void {
    mb.entity(Person, (b) => {
      b.toProviderSource(PRINCIPALS);
      b.property((p) => p.Title).isText();
      b.property((p) => p.LoginName).isText();
      b.property((p) => p.Email).isText();
      b.property((p) => p.PrincipalType).isNumber();
    });
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((p) => p.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      b.hasOne(Person, (d) => d.Owner)
        .withMany()
        .hasForeignKey((d) => d.OwnerId);
      b.hasOne(Program, (d) => d.Program)
        .withMany()
        .hasForeignKey((d) => d.ProgramId);
    });
  }
}
const docs: IListHandle = { kind: "title", value: "Docs" };

describe("expand clauses carry the target's source", () => {
  it("a provider-targeted nav defaults to the target's FULL column set (the provider trims), a list nav to its key and display field", () => {
    const ctx = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    const doc = ctx.model.findEntityType(Doc)!;
    expect(resolveExpandFields(doc, "Owner")).toEqual(
      ctx.model.findEntityType(Person)!.columnNames,
    );
    expect(resolveExpandFields(doc, "Owner")).toContain("PrincipalType"); // not core's business to drop
    expect(resolveExpandFields(doc, "Program")).toEqual([
      doc.findNavigation("Program")!.target.key.columnName,
      "Title",
    ]);
  });

  it("the paged read's expand clauses name each target's sourceHandle", async () => {
    class Recording extends FakeStorageProvider {
      seen: IExpandClause[][] = [];
      override getItemsPagedAsync(
        src: ISourceHandle,
        f: readonly string[],
        n: number,
        c?: string,
        o?: IGetItemsOptions,
      ) {
        if (o?.expand) this.seen.push([...o.expand]);
        return super.getItemsPagedAsync(src, f, n, c, o);
      }
    }
    const fake = new Recording();
    fake.seedRow(docs, { Title: "d", OwnerId: 1, ProgramId: 1 });
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
    await ctx.docs
      .expand((d) => d.Owner)
      .expand((d) => d.Program)
      .toArrayAsync();
    const byNav = new Map(fake.seen[0]!.map((e) => [e.navColumn, e]));
    expect(byNav.get("Owner")!.source).toEqual(PRINCIPALS);
    expect(byNav.get("Program")!.source).toEqual({
      kind: "title",
      value: "Programs",
    });
    expect(byNav.get("Owner")!.properties).toBe(
      ctx.model.findEntityType(Person)!.properties,
    );
  });

  it("the fake joins a provider-targeted expand against its principal registry, projecting only what an inline person expand answers", async () => {
    const fake = new FakeStorageProvider();
    fake.seedPrincipal({
      Id: 1,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      Email: "ada@x",
      PrincipalType: 1,
    });
    fake.seedRow(docs, { Title: "d", OwnerId: 1 });
    fake.registerJoin(docs, "Owner", {
      foreignKey: "OwnerId",
      targetSource: PRINCIPALS,
    });
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
    const [d] = await ctx.docs.expand((x) => x.Owner).toArrayAsync();
    expect(d!.Owner).toBeInstanceOf(Person);
    expect(d!.Owner).toMatchObject({
      Id: 1,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      Email: "ada@x",
    });
    expect(d!.Owner!.PrincipalType).toBeUndefined();
  });
});
