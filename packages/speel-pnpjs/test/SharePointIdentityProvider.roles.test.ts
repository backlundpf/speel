import { describe, it, expect } from "vitest";
import { SharePointIdentityProvider } from "../src/identity/SharePointIdentityProvider.js";
import { maskFor } from "../src/identity/permissionMask.js";

type Rec = Record<string, unknown>;

/**
 * A structural double for web.roleDefinitions. `getById` is callable (PnP invokables are
 * functions with methods hung off them), so the provider's read-back path is exercised
 * exactly as it runs.
 */
function makeFakeSp(seed: Rec[]) {
  const calls: string[] = [];
  const defs = new Map<number, Rec>(seed.map((r) => [r.Id as number, r]));

  const getById = (id: number) =>
    Object.assign(
      async () => {
        calls.push(`read:${id}`);
        const rec = defs.get(id);
        if (!rec) throw new Error(`no role definition ${id}`);
        return { ...rec };
      },
      {
        update: async (props: Rec) => {
          calls.push(`update:${id}:${JSON.stringify(props)}`);
          defs.set(id, { ...defs.get(id), ...props });
          return { data: {}, definition: {} };
        },
        delete: async () => {
          calls.push(`delete:${id}`);
          defs.delete(id);
        },
      },
    );

  const roleDefinitions = Object.assign(async () => [...defs.values()], {
    getById,
    add: async (
      name: string,
      description: string,
      order: number,
      basePermissions: { High: number; Low: number },
    ) => {
      calls.push(
        `add:${name}:${description}:${order}:${basePermissions.High}/${basePermissions.Low}`,
      );
      const rec: Rec = {
        Id: 1073741900 + defs.size,
        Name: name,
        Description: description,
        Order: order,
        RoleTypeKind: 0,
        BasePermissions: basePermissions,
      };
      defs.set(rec.Id as number, rec);
      return { data: { ...rec }, definition: {} };
    },
  });

  const sp = { web: { roleDefinitions } };
  return { sp, calls, defs };
}

const CONTRIBUTE: Rec = {
  Id: 1073741827,
  Name: "Contribute",
  RoleTypeKind: 3,
  BasePermissions: maskFor(["viewListItems", "addListItems"]),
};

describe("SharePointIdentityProvider role-definition writes", () => {
  it("creates a level from permission names", async () => {
    const { sp, calls } = makeFakeSp([]);
    const provider = new SharePointIdentityProvider(sp as never);

    const rec = await provider.createRoleDefinitionAsync({
      name: "Reviewer",
      description: "Reads and approves",
      order: 5,
      permissions: ["viewListItems", "approveItems"],
    });

    const expected = maskFor(["viewListItems", "approveItems"]);
    expect(calls).toEqual([
      `add:Reviewer:Reads and approves:5:${expected.High}/${expected.Low}`,
    ]);
    expect(rec.Name).toBe("Reviewer");
  });

  it("defaults description to empty and order to 0", async () => {
    const { sp, calls } = makeFakeSp([]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.createRoleDefinitionAsync({
      name: "Minimal",
      permissions: ["viewListItems"],
    });

    expect(calls[0]).toContain("add:Minimal::0:");
  });

  it("clones a level's mask and adds to it", async () => {
    const { sp, calls } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.cloneRoleDefinitionAsync(1073741827, {
      name: "Contribute + Manage Permissions",
      add: ["managePermissions"],
    });

    const expected = maskFor([
      "viewListItems",
      "addListItems",
      "managePermissions",
    ]);
    // The source is read first — the mask it carries is what a clone is.
    expect(calls).toEqual([
      "read:1073741827",
      `add:Contribute + Manage Permissions::0:${expected.High}/${expected.Low}`,
    ]);
  });

  it("clones with a removal", async () => {
    const { sp, calls } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.cloneRoleDefinitionAsync(1073741827, {
      name: "Read-only Contribute",
      remove: ["addListItems"],
    });

    const expected = maskFor(["viewListItems"]);
    expect(calls[1]).toContain(`${expected.High}/${expected.Low}`);
  });

  it("updates a whole permission set without reading first", async () => {
    const { sp, calls } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.updateRoleDefinitionAsync(1073741827, {
      permissions: ["viewListItems"],
    });

    // A replacement needs no current mask: update, then read back for the record.
    expect(calls[0]).toContain("update:1073741827:");
    expect(calls[0]).toContain(`"Low":${maskFor(["viewListItems"]).Low}`);
    expect(calls[1]).toBe("read:1073741827");
  });

  it("reads the current mask before applying a delta", async () => {
    const { sp, calls } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.updateRoleDefinitionAsync(1073741827, {
      add: ["manageWeb"],
    });

    expect(calls[0]).toBe("read:1073741827");
    const expected = maskFor(["viewListItems", "addListItems", "manageWeb"]);
    expect(calls[1]).toContain(`"Low":${expected.Low}`);
  });

  it("sends only the fields it was given", async () => {
    const { sp, calls } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.updateRoleDefinitionAsync(1073741827, {
      description: "New words",
    });

    expect(calls[0]).toBe('update:1073741827:{"Description":"New words"}');
  });

  it("returns the record as it stands after the update", async () => {
    const { sp } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    const rec = await provider.updateRoleDefinitionAsync(1073741827, {
      name: "Renamed",
    });

    expect(rec.Name).toBe("Renamed");
  });

  it("deletes by id", async () => {
    const { sp, calls, defs } = makeFakeSp([CONTRIBUTE]);
    const provider = new SharePointIdentityProvider(sp as never);

    await provider.deleteRoleDefinitionAsync(1073741827);

    expect(calls).toEqual(["delete:1073741827"]);
    expect(defs.size).toBe(0);
  });
});
