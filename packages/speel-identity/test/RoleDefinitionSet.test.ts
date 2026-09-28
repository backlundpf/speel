import { describe, it, expect, vi } from "vitest";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { RoleDefinitionSet } from "../src/RoleDefinitionSet.js";

describe("RoleDefinitionSet", () => {
  it("resolves by name, type, and id", async () => {
    const provider = new FakeIdentityProvider();
    provider.seedRoleDefinition({
      Id: 1073741827,
      Name: "Edit",
      RoleTypeKind: 6,
    });
    provider.seedRoleDefinition({
      Id: 1073741826,
      Name: "Read",
      RoleTypeKind: 2,
    });
    const set = new RoleDefinitionSet(provider);

    const edit = await set.getByNameAsync("Edit");
    expect(edit).toMatchObject({
      Id: 1073741827,
      Name: "Edit",
      RoleTypeKind: 6,
    });
    const read = await set.getByTypeAsync(2);
    expect(read!.Name).toBe("Read");
    const byId = await set.getByIdAsync(1073741827);
    expect(byId!.Name).toBe("Edit");
    expect(await set.getByNameAsync("Nope")).toBeNull();
  });

  it("returns all role definitions as a Map keyed by name", async () => {
    const provider = new FakeIdentityProvider();
    provider.seedRoleDefinition({
      Id: 1073741827,
      Name: "Edit",
      RoleTypeKind: 6,
    });
    provider.seedRoleDefinition({
      Id: 1073741826,
      Name: "Read",
      RoleTypeKind: 2,
    });
    const set = new RoleDefinitionSet(provider);

    const map = await set.getAllByNameAsync();
    expect(map).toBeInstanceOf(Map);
    expect([...map.keys()].sort()).toEqual(["Edit", "Read"]);
    expect(map.get("Edit")).toMatchObject({ Id: 1073741827, RoleTypeKind: 6 });
    expect(map.get("Read")!.Id).toBe(1073741826);
  });

  it("caches the fetch: many lookups hit the provider once; clearCache refetches", async () => {
    const provider = new FakeIdentityProvider();
    provider.seedRoleDefinition({ Id: 1, Name: "Edit", RoleTypeKind: 6 });
    provider.seedRoleDefinition({ Id: 2, Name: "Read", RoleTypeKind: 2 });
    const spy = vi.spyOn(provider, "getRoleDefinitionsAsync");
    const set = new RoleDefinitionSet(provider);

    await set.getByNameAsync("Edit");
    await set.getByIdAsync(2);
    await set.getByTypeAsync(6);
    await set.getAllByNameAsync();
    expect(spy).toHaveBeenCalledTimes(1);

    set.clearCache();
    await set.getByNameAsync("Read");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
