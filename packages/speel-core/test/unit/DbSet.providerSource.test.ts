import { describe, it, expect } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../src/initSpeelDbContext.js";
import { InvalidOperationException } from "../../src/errors.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import {
  TestPrincipal,
  TestSiteUser,
  registerTestPrincipals,
} from "./fakes/testPrincipals.js";

class Ctx extends DbContext {
  principals = this.set(TestPrincipal);
  siteUsers = this.set(TestSiteUser);
  protected onModelCreating(mb: ModelBuilder): void {
    registerTestPrincipals(mb, ["principals", "siteUsers"]);
  }
}

describe("a provider-source DbSet", () => {
  const build = () => {
    const fake = new FakeStorageProvider();
    fake.seedPrincipal({
      Id: 1,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      Email: "ada@x",
      PrincipalType: 1,
    });
    fake.seedPrincipal({
      Id: 2,
      Title: "Auditors",
      LoginName: "Auditors",
      PrincipalType: 8,
    });
    return { fake, ctx: initSpeelDbContext(Ctx, (b) => b.useProvider(fake)) };
  };

  it("reads through the provider source: toArrayAsync, where, findAsync", async () => {
    const { ctx } = build();
    expect((await ctx.principals.toArrayAsync()).map((p) => p.Id)).toEqual([
      1, 2,
    ]);
    const ada = await ctx.siteUsers
      .where((b) => b.LoginName.eq("i:0#.f|m|ada"))
      .firstOrDefaultAsync();
    expect(ada).toBeInstanceOf(TestSiteUser);
    expect(ada!.Email).toBe("ada@x");
    expect((await ctx.principals.findAsync(2))!.PrincipalType).toBe(8);
    expect(await ctx.principals.findAsync(999)).toBeNull();
  });

  it("refuses add and remove, naming @speel/identity", () => {
    const { ctx } = build();
    expect(() => ctx.principals.add(new TestPrincipal())).toThrow(
      InvalidOperationException,
    );
    expect(() => ctx.principals.add(new TestPrincipal())).toThrow(
      /read-only.*@speel\/identity/,
    );
    const p = Object.assign(new TestPrincipal(), { Id: 1 });
    expect(() => ctx.principals.remove(p)).toThrow(
      /read-only.*@speel\/identity/,
    );
  });

  it("refuses folder operations through the list getter", async () => {
    const { ctx } = build();
    await expect(ctx.principals.ensureFolderAsync("x")).rejects.toThrow(
      /not list-backed/,
    );
  });
});
