import { describe, it, expect } from "vitest";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";

const CONTRIBUTE = 1073741827;

function seeded(): FakeIdentityProvider {
  const ids = new FakeIdentityProvider();
  ids.seedRoleDefinition(
    { Id: CONTRIBUTE, Name: "Contribute", RoleTypeKind: 3 },
    ["viewListItems", "addListItems"],
  );
  return ids;
}

describe("FakeIdentityProvider role-definition writes", () => {
  it("creates a custom level and records the call", async () => {
    const ids = seeded();
    const rec = await ids.createRoleDefinitionAsync({
      name: "Reviewer",
      permissions: ["viewListItems", "approveItems"],
    });

    expect(rec.Name).toBe("Reviewer");
    expect(rec.RoleTypeKind).toBe(0); // anything created is custom
    expect(ids.roleKinds(rec.Id as number).sort()).toEqual([
      "approveItems",
      "viewListItems",
    ]);
    expect(ids.calls).toContain("createRole:Reviewer");
  });

  it("rejects a duplicate name, as SharePoint does", async () => {
    const ids = seeded();
    await expect(
      ids.createRoleDefinitionAsync({
        name: "Contribute",
        permissions: ["viewListItems"],
      }),
    ).rejects.toThrow("already exists");
  });

  it("clones a level's kinds with add and remove applied", async () => {
    const ids = seeded();
    const rec = await ids.cloneRoleDefinitionAsync(CONTRIBUTE, {
      name: "Contribute + Manage Permissions",
      add: ["managePermissions"],
      remove: ["addListItems"],
    });

    expect(ids.roleKinds(rec.Id as number).sort()).toEqual([
      "managePermissions",
      "viewListItems",
    ]);
  });

  it("rejects a clone of a level that does not exist", async () => {
    const ids = seeded();
    await expect(
      ids.cloneRoleDefinitionAsync(999, { name: "Nope" }),
    ).rejects.toThrow("999");
  });

  it("replaces a permission set on update", async () => {
    const ids = seeded();
    await ids.updateRoleDefinitionAsync(CONTRIBUTE, {
      permissions: ["manageWeb"],
    });
    expect(ids.roleKinds(CONTRIBUTE)).toEqual(["manageWeb"]);
  });

  it("applies a delta on update, remove winning over add", async () => {
    const ids = seeded();
    await ids.updateRoleDefinitionAsync(CONTRIBUTE, {
      add: ["manageWeb", "approveItems"],
      remove: ["manageWeb", "addListItems"],
    });
    expect(ids.roleKinds(CONTRIBUTE).sort()).toEqual([
      "approveItems",
      "viewListItems",
    ]);
  });

  it("updates the fields it is given and returns the record", async () => {
    const ids = seeded();
    const rec = await ids.updateRoleDefinitionAsync(CONTRIBUTE, {
      name: "Contribute (renamed)",
      description: "New words",
    });
    expect(rec).toMatchObject({
      Name: "Contribute (renamed)",
      Description: "New words",
    });
  });

  it("deletes a level so the catalogue no longer reports it", async () => {
    const ids = seeded();
    await ids.deleteRoleDefinitionAsync(CONTRIBUTE);
    expect(await ids.getRoleDefinitionsAsync()).toEqual([]);
    expect(ids.calls).toContain(`deleteRole:${CONTRIBUTE}`);
  });
});
