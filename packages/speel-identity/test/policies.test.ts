import { describe, it, expect } from "vitest";
import { initSpeelDbContext, InvalidOperationException } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import type { PolicyBuilder } from "../src/PolicyBuilder.js";
import { list } from "../src/resources.js";

class TestContext extends IdentityDbContext {}

const SHARED_VIEWS = { kind: "list", list: "Speel Shared Views" } as const;

function build(policies: Record<string, (p: PolicyBuilder) => void>) {
  const sp = new FakeStorageProvider();
  const ids = new FakeIdentityProvider();
  sp.seedPrincipal({
    Id: 3,
    Title: "Internal Auditors",
    LoginName: "Internal Auditors",
    PrincipalType: 8,
  });
  const db = initSpeelDbContext(TestContext, (b) => b.useProvider(sp));
  const identity = initSpeelIdentity(db, (b) => {
    b.useProvider(ids);
    for (const [name, build_] of Object.entries(policies))
      b.addPolicy(name, build_);
  });
  return { identity, ids, sp };
}

describe("policies", () => {
  it("authorizes on a permission at the policy's own scope", async () => {
    // A real-world canPublish policy, entire.
    const { identity, ids } = build({
      PublishViews: (p) =>
        p.requirePermission("addListItems").onList("Speel Shared Views"),
    });
    ids.seedPermissions(SHARED_VIEWS, ["addListItems"]);
    expect(await identity.authorization.authorize("PublishViews")).toBe(true);
  });

  it("denies when the permission is absent", async () => {
    const { identity, ids } = build({
      PublishViews: (p) =>
        p.requirePermission("addListItems").onList("Speel Shared Views"),
    });
    ids.seedPermissions(SHARED_VIEWS, ["viewListItems"]);
    expect(await identity.authorization.authorize("PublishViews")).toBe(false);
  });

  it("authorizes on group membership", async () => {
    const { identity, ids } = build({
      Auditor: (p) => p.requireGroup("Internal Auditors"),
    });
    ids.setCurrentUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    ids.seedGroup({ Id: 3, Title: "Internal Auditors" });
    expect(await identity.authorization.authorize("Auditor")).toBe(false);
    ids.seedMembership(3, 7);
    expect(await identity.authorization.authorize("Auditor")).toBe(true);
  });

  it("requires every requirement to hold", async () => {
    const { identity, ids } = build({
      Both: (p) =>
        p
          .requirePermission("addListItems")
          .requireGroup("Internal Auditors")
          .onList("Speel Shared Views"),
    });
    ids.setCurrentUser({ Id: 7, LoginName: "ada" });
    ids.seedGroup({ Id: 3, Title: "Internal Auditors" });
    ids.seedPermissions(SHARED_VIEWS, ["addListItems"]);
    expect(await identity.authorization.authorize("Both")).toBe(false); // permission yes, group no
    ids.seedMembership(3, 7);
    expect(await identity.authorization.authorize("Both")).toBe(true);
  });

  it("short-circuits after the first failure", async () => {
    let ran = false;
    const { identity, ids } = build({
      Ordered: (p) =>
        p.requirePermission("manageWeb").require(() => {
          ran = true;
          return true;
        }),
    });
    ids.seedPermissions({ kind: "web" }, []);
    expect(await identity.authorization.authorize("Ordered")).toBe(false);
    // Requirements cost round trips; a policy that has already failed cannot pass.
    expect(ran).toBe(false);
  });

  it("hands a custom requirement the resolved resource and the ability to ask more", async () => {
    const seen: unknown[] = [];
    const { identity, ids } = build({
      Custom: (p) =>
        p.on(list("Contracts")).require(async (ctx) => {
          seen.push(ctx.resource);
          return ctx.hasPermission("addListItems");
        }),
    });
    ids.seedPermissions({ kind: "list", list: "Contracts" }, ["addListItems"]);
    expect(await identity.authorization.authorize("Custom")).toBe(true);
    expect(seen).toEqual([{ kind: "list", list: "Contracts" }]);
  });

  it("lets the authorize argument win over the policy scope", async () => {
    const { identity, ids } = build({
      Publish: (p) =>
        p.requirePermission("addListItems").onList("Speel Shared Views"),
    });
    ids.seedPermissions(SHARED_VIEWS, []);
    ids.seedPermissions({ kind: "list", list: "Contracts" }, ["addListItems"]);
    expect(await identity.authorization.authorize("Publish")).toBe(false);
    expect(
      await identity.authorization.authorize("Publish", list("Contracts")),
    ).toBe(true);
  });

  it("throws on an unregistered policy rather than reading as denied", async () => {
    const { identity } = build({
      Known: (p) => p.requirePermission("manageWeb"),
    });
    await expect(identity.authorization.authorize("Typo")).rejects.toThrow(
      InvalidOperationException,
    );
    // The message names what does exist, because the mistake is almost always a typo.
    await expect(identity.authorization.authorize("Typo")).rejects.toThrow(
      /Known/,
    );
  });

  it("re-registering a name replaces the policy", async () => {
    const sp = new FakeStorageProvider();
    const ids = new FakeIdentityProvider();
    const db = initSpeelDbContext(TestContext, (b) => b.useProvider(sp));
    // Two registrations of one name; the last wins, which is how a host overrides a policy
    // a shared module declared.
    const identity = initSpeelIdentity(db, (b) =>
      b
        .useProvider(ids)
        .addPolicy("Publish", (p) => p.requirePermission("manageWeb"))
        .addPolicy("Publish", (p) => p.requirePermission("addListItems")),
    );

    ids.seedPermissions({ kind: "web" }, ["addListItems"]); // granted, but not manageWeb
    expect(await identity.authorization.authorize("Publish")).toBe(true);
  });
});
