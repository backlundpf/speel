import { describe, it, expect } from "vitest";
import { initSpeelDbContext, InvalidOperationException } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import { SiteUser } from "@speel/core";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { build, seedUser } from "./harness.js";

describe("UserManager", () => {
  it("resolves the current user and caches it", async () => {
    const h = build();
    h.ids.setCurrentUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    const first = await h.identity.users.me();
    const second = await h.identity.users.me();
    expect(first.Id).toBe(7);
    expect(first.Title).toBe("Ada");
    expect(second).toBe(first); // the same instance: one round trip, not two
  });

  it("does not cache a failed lookup", async () => {
    const h = build();
    let calls = 0;
    h.ids.getCurrentUserAsync = (): Promise<Record<string, unknown>> => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ Id: 7 });
    };
    await expect(h.identity.users.me()).rejects.toThrow("boom");
    expect((await h.identity.users.me()).Id).toBe(7);
  });

  it("clearCache forces the next me() to ask again", async () => {
    const h = build();
    h.ids.setCurrentUser({ Id: 7, Title: "Ada" });
    const first = await h.identity.users.me();
    h.identity.users.clearCache();
    expect(await h.identity.users.me()).not.toBe(first);
  });

  it("getByLoginName / getByEmail / getById read the siteUsers set", async () => {
    const h = build();
    // Seeded only in core's fake, so these pass only if they route through db.siteUsers.
    h.sp.seedPrincipal({
      Id: 42,
      Title: "Grace",
      LoginName: "grace",
      Email: "grace@x.com",
      PrincipalType: 1,
    });
    expect((await h.identity.users.getById(42))?.Title).toBe("Grace");
    expect((await h.identity.users.getByLoginName("grace"))?.Id).toBe(42);
    expect((await h.identity.users.getByEmail("grace@x.com"))?.Id).toBe(42);
    expect(await h.identity.users.getByLoginName("nobody")).toBeNull();
    expect((await h.identity.users.all()).map((u) => u.Id)).toEqual([42]);
  });

  it("returns null for a user that does not exist", async () => {
    const h = build();
    expect(await h.identity.users.getById(999)).toBeNull();
  });

  it("ensure goes through the identity provider and returns a SiteUser", async () => {
    const h = build();
    const created = await h.identity.users.ensure(
      "i:0#.f|membership|new@x.com",
    );
    expect(created).toBeInstanceOf(SiteUser);
    expect(created.LoginName).toBe("i:0#.f|membership|new@x.com");
    expect(created.Id).toBeGreaterThan(0);
    expect(h.ids.calls).toContain("ensureUserAsync");
    // the same login again is the same record, not a second one
    expect(
      (await h.identity.users.ensure("i:0#.f|membership|new@x.com")).Id,
    ).toBe(created.Id);
  });

  it("searches through the identity provider", async () => {
    const h = build();
    seedUser(h, { Id: 8, Title: "Grace Hopper", LoginName: "grace" });
    const hits = await h.identity.users.search("hopp");
    expect(hits.map((p) => p.Id)).toEqual([8]);
  });
});

describe("initSpeelIdentity", () => {
  it("throws when no provider is configured", () => {
    class Ctx extends IdentityDbContext {}
    const db = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(() => initSpeelIdentity(db, () => undefined)).toThrow(
      InvalidOperationException,
    );
  });
});
