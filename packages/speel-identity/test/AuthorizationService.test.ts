import { describe, it, expect } from "vitest";
import { initSpeelDbContext, InvalidOperationException } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import type { PolicyBuilder } from "../src/PolicyBuilder.js";
import { list, web } from "../src/resources.js";

class TestContext extends IdentityDbContext {}

const CONTRACTS = { kind: "list", list: "Contracts" } as const;
const CONTRIBUTE = 1073741827;

function build(policies: Record<string, (p: PolicyBuilder) => void> = {}) {
  const sp = new FakeStorageProvider();
  const ids = new FakeIdentityProvider();
  const db = initSpeelDbContext(TestContext, (b) => b.useProvider(sp));
  const identity = initSpeelIdentity(db, (b) => {
    b.useProvider(ids);
    for (const [name, build_] of Object.entries(policies))
      b.addPolicy(name, build_);
  });
  return { identity, ids, sp };
}

describe("AuthorizationService", () => {
  it("asks about the web and the current user by default", async () => {
    const { identity, ids } = build();
    ids.seedPermissions({ kind: "web" }, ["manageWeb"]);
    expect(await identity.authorization.hasPermission("manageWeb")).toBe(true);
    expect(await identity.authorization.hasPermission("manageLists")).toBe(
      false,
    );
    expect(ids.reads).toEqual(["web|"]);
  });

  it("scopes the question to a resource", async () => {
    const { identity, ids } = build();
    ids.seedPermissions(CONTRACTS, ["addListItems"]);
    expect(
      await identity.authorization.hasPermission(
        "addListItems",
        list("Contracts"),
      ),
    ).toBe(true);
    expect(
      await identity.authorization.hasPermission("addListItems", web()),
    ).toBe(false);
  });

  it("fetches the mask once per resource and reuses it across kinds", async () => {
    const { identity, ids } = build();
    ids.seedPermissions(CONTRACTS, ["viewListItems", "addListItems"]);
    await identity.authorization.hasPermission(
      "viewListItems",
      list("Contracts"),
    );
    await identity.authorization.hasPermission(
      "addListItems",
      list("Contracts"),
    );
    await identity.authorization.hasPermission(
      "manageLists",
      list("Contracts"),
    );
    // Three questions, one round trip — the entire reason the seam returns a mask.
    expect(ids.reads).toEqual(["list:Contracts|"]);
  });

  it("caches per user, not just per resource", async () => {
    const { identity, ids, sp } = build();
    sp.seedPrincipal({
      Id: 8,
      Title: "Grace",
      LoginName: "grace",
      PrincipalType: 1,
    });
    ids.seedPermissions(CONTRACTS, ["addListItems"]);
    ids.seedPermissions(CONTRACTS, [], "grace");
    expect(
      await identity.authorization.hasPermission(
        "addListItems",
        list("Contracts"),
      ),
    ).toBe(true);
    expect(
      await identity.authorization.hasPermission(
        "addListItems",
        list("Contracts"),
        "grace",
      ),
    ).toBe(false);
    expect(ids.reads).toEqual(["list:Contracts|", "list:Contracts|grace"]);
  });

  it("does not cache a failed read", async () => {
    const { identity, ids } = build();
    let calls = 0;
    ids.getEffectivePermissionsAsync = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ High: 0, Low: 0 });
    };
    await expect(
      identity.authorization.hasPermission("manageWeb"),
    ).rejects.toThrow("boom");
    await identity.authorization.hasPermission("manageWeb");
    expect(calls).toBe(2);
  });

  it("drops the cache after a save, because the save changed the answers", async () => {
    const { identity, ids, sp } = build();
    sp.seedPrincipal({
      Id: 3,
      Title: "Auditors",
      LoginName: "Auditors",
      PrincipalType: 8,
    });
    ids.seedRoleDefinition({
      Id: CONTRIBUTE,
      Name: "Contribute",
      RoleTypeKind: 3,
    });
    ids.seedPermissions(CONTRACTS, ["viewListItems"]);

    await identity.authorization.hasPermission(
      "viewListItems",
      list("Contracts"),
    );
    identity.permissions.for(list("Contracts")).grant("Auditors", "Contribute");
    await identity.saveChangesAsync();
    await identity.authorization.hasPermission(
      "viewListItems",
      list("Contracts"),
    );

    expect(ids.reads).toEqual(["list:Contracts|", "list:Contracts|"]);
  });

  it("exposes the whole mask for surfaces that display capability", async () => {
    const { identity, ids } = build();
    ids.seedPermissions(CONTRACTS, ["addListItems"]);
    const mask = await identity.authorization.effectivePermissions(
      list("Contracts"),
    );
    expect(ids.hasPermission(mask, "addListItems")).toBe(true);
  });
});
