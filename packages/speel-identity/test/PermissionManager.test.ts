import { describe, it, expect } from "vitest";
import { InvalidOperationException } from "@speel/core";
import { list, web } from "../src/resources.js";
import { build, seedGroup, seedUser, type Harness } from "./harness.js";

const CONTRIBUTE = 1073741827;

function ready(): Harness {
  const h = build();
  seedUser(h, { Id: 7, Title: "Ada", LoginName: "ada" });
  seedGroup(h, { Id: 3, Title: "Auditors" });
  h.ids.seedRoleDefinition({
    Id: CONTRIBUTE,
    Name: "Contribute",
    RoleTypeKind: 3,
  });
  return h;
}

describe("PermissionManager", () => {
  it("stages every mutation and applies none of them until save", async () => {
    const h = ready();
    h.identity.permissions
      .for(list("Contracts"))
      .breakInheritance()
      .grant("ada", "Contribute");

    expect(h.identity.hasChanges).toBe(true);
    expect(h.ids.calls).toEqual([]);

    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([
      "breakInheritance:list:Contracts:true:false",
      `addRole:list:Contracts:7:${CONTRIBUTE}`,
    ]);
  });

  it("grants to a group as readily as to a person", async () => {
    const h = ready();
    h.identity.permissions.for(web()).grant("Auditors", "Contribute");
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([`addRole:web:3:${CONTRIBUTE}`]);
  });

  it("grants to a claims security group, which no site-group listing holds", async () => {
    // A claims security group — "Everyone except external users" is the canonical
    // one — lives in `web/siteusers` with PrincipalType 4 and appears in
    // `web/siteGroups` not at all. So the group-title fallback cannot save this
    // lookup: the by-login read has to answer it, and it has to answer as a
    // Principal, because a group is not a SiteUser.
    const h = ready();
    const claim = "c:0-.f|rolemanager|spo-grid-all-users/1a2b3c";
    h.sp.seedPrincipal({
      Id: 20,
      Title: "Everyone except external users",
      LoginName: claim,
      PrincipalType: 4,
    });

    h.identity.permissions.for(web()).grant(claim, "Contribute");
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([`addRole:web:20:${CONTRIBUTE}`]);
  });

  it("still refuses a login the site has never seen", async () => {
    // The by-login read widening to Principal must not turn a genuine miss into a
    // silent success — the throw is the only thing standing between a typo'd claim
    // and a permission grant that goes to nobody.
    const h = ready();
    h.identity.permissions
      .for(web())
      .grant("c:0-.f|rolemanager|nobody", "Contribute");
    await expect(h.identity.saveChangesAsync()).rejects.toThrow(
      /No principal with login/,
    );
  });

  it("accepts a role by id and a principal by id", async () => {
    const h = ready();
    h.identity.permissions.for(list("Contracts")).grant(7, CONTRIBUTE);
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([`addRole:list:Contracts:7:${CONTRIBUTE}`]);
  });

  it("revokes and resets", async () => {
    const h = ready();
    h.identity.permissions.for(list("Contracts")).revoke("ada", "Contribute");
    h.identity.permissions.for(list("Contracts")).resetInheritance();
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([
      `removeRole:list:Contracts:7:${CONTRIBUTE}`,
      "resetInheritance:list:Contracts",
    ]);
  });

  it("carries the inheritance options through", async () => {
    const h = ready();
    h.identity.permissions
      .for(web())
      .breakInheritance({ copyExisting: false, clearSubscopes: true });
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual(["breakInheritance:web:false:true"]);
  });

  it("names an unknown role rather than granting nothing quietly", async () => {
    const h = ready();
    h.identity.permissions.for(web()).grant("ada", "Nonexistent");
    const error = await h.identity.saveChangesAsync().catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/Nonexistent/);
  });

  it("names an unknown principal", async () => {
    const h = ready();
    h.identity.permissions.for(web()).grant("ghost", "Contribute");
    const error = await h.identity.saveChangesAsync().catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/ghost/);
  });

  it("reads assignments immediately, without a save", async () => {
    const h = ready();
    h.ids.seedRoleAssignments({ kind: "list", list: "Contracts" }, [
      {
        PrincipalId: 7,
        Member: {
          Id: 7,
          Title: "Auditors",
          LoginName: "c:0(.s|true",
          PrincipalType: 8,
        },
        RoleDefinitionBindings: [{ Name: "Contribute" }, { Name: "Read" }],
      },
    ]);

    const assignments = await h.identity.permissions
      .for(list("Contracts"))
      .assignments();

    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.member.Id).toBe(7);
    expect(assignments[0]!.member.Title).toBe("Auditors");
    expect(assignments[0]!.member.PrincipalType).toBe(8);
    expect(assignments[0]!.roles).toEqual(["Contribute", "Read"]);
    expect(h.identity.hasChanges).toBe(false);
  });

  it("reports an assignment with no expanded member as an empty principal, not a crash", async () => {
    const h = ready();
    h.ids.seedRoleAssignments({ kind: "list", list: "Contracts" }, [
      { PrincipalId: 7 },
    ]);

    const assignments = await h.identity.permissions
      .for(list("Contracts"))
      .assignments();

    expect(assignments[0]!.member.Id).toBeUndefined();
    expect(assignments[0]!.roles).toEqual([]);
  });

  it("refuses an unsaved entity as a resource", async () => {
    const h = ready();
    expect(() =>
      h.identity.permissions.for({ kind: "entity", entity: {} }).assignments(),
    ).toThrow(InvalidOperationException);
  });
});
