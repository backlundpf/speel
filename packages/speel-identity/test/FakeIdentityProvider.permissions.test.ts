import { describe, it, expect } from "vitest";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import type { ResolvedResource } from "../src/resources.js";

const CONTRACTS: ResolvedResource = { kind: "list", list: "Contracts" };
const OTHER: ResolvedResource = { kind: "list", list: "Other" };

describe("FakeIdentityProvider permissions", () => {
  it("answers from what was seeded for the resource", async () => {
    const p = new FakeIdentityProvider();
    p.seedPermissions(CONTRACTS, ["viewListItems", "addListItems"]);
    const mask = await p.getEffectivePermissionsAsync(CONTRACTS);
    expect(p.hasPermission(mask, "addListItems")).toBe(true);
    expect(p.hasPermission(mask, "manageLists")).toBe(false);
  });

  it("scopes permissions per resource", async () => {
    const p = new FakeIdentityProvider();
    p.seedPermissions(CONTRACTS, ["addListItems"]);
    const other = await p.getEffectivePermissionsAsync(OTHER);
    expect(p.hasPermission(other, "addListItems")).toBe(false);
  });

  it("prefers a per-user seeding over the wildcard", async () => {
    const p = new FakeIdentityProvider();
    p.seedPermissions(CONTRACTS, ["addListItems"]); // everyone
    p.seedPermissions(CONTRACTS, [], "ada"); // …except Ada
    expect(
      p.hasPermission(
        await p.getEffectivePermissionsAsync(CONTRACTS, "ada"),
        "addListItems",
      ),
    ).toBe(false);
    expect(
      p.hasPermission(
        await p.getEffectivePermissionsAsync(CONTRACTS, "grace"),
        "addListItems",
      ),
    ).toBe(true);
  });

  it("records reads apart from mutations", async () => {
    const p = new FakeIdentityProvider();
    await p.getEffectivePermissionsAsync(CONTRACTS, "ada");
    expect(p.reads).toEqual(["list:Contracts|ada"]);
    expect(p.calls).toEqual([]);
  });

  it("records each mutation with its resource", async () => {
    const p = new FakeIdentityProvider();
    await p.executeBatchAsync([
      {
        kind: "breakInheritance",
        resource: CONTRACTS,
        copyExisting: true,
        clearSubscopes: false,
        clientToken: "t1",
      },
      {
        kind: "grant",
        resource: CONTRACTS,
        principalId: 7,
        roleDefinitionId: 1073741827,
        clientToken: "t2",
      },
      {
        kind: "revoke",
        resource: CONTRACTS,
        principalId: 7,
        roleDefinitionId: 1073741827,
        clientToken: "t3",
      },
      { kind: "resetInheritance", resource: CONTRACTS, clientToken: "t4" },
    ]);
    expect(p.calls).toEqual([
      "breakInheritance:list:Contracts:true:false",
      "addRole:list:Contracts:7:1073741827",
      "removeRole:list:Contracts:7:1073741827",
      "resetInheritance:list:Contracts",
    ]);
  });

  it("returns seeded role assignments", async () => {
    const p = new FakeIdentityProvider();
    p.seedRoleAssignments(CONTRACTS, [{ PrincipalId: 7 }]);
    expect(await p.getRoleAssignmentsAsync(CONTRACTS)).toEqual([
      { PrincipalId: 7 },
    ]);
    expect(await p.getRoleAssignmentsAsync(OTHER)).toEqual([]);
  });
});
