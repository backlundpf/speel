import { describe, it, expect } from "vitest";
import type { RoleUpdate } from "../src/RoleManager.js";
import { build } from "./harness.js";

const CONTRIBUTE = 1073741827;
const FULL_CONTROL = 1073741829;

/** Counts catalogue fetches, so "no refetch" is asserted rather than assumed. */
function countFetches(h: ReturnType<typeof build>): () => number {
  let n = 0;
  const original = h.ids.getRoleDefinitionsAsync.bind(h.ids);
  h.ids.getRoleDefinitionsAsync = async () => {
    n++;
    return original();
  };
  return () => n;
}

function withCatalogue() {
  const h = build();
  h.ids.seedRoleDefinition(
    { Id: CONTRIBUTE, Name: "Contribute", RoleTypeKind: 3 },
    ["viewListItems", "addListItems"],
  );
  h.ids.seedRoleDefinition({
    Id: FULL_CONTROL,
    Name: "Full Control",
    RoleTypeKind: 5,
  });
  return h;
}

describe("roles.create", () => {
  it("provisions a level and returns it", async () => {
    const h = withCatalogue();
    const level = await h.identity.roles.create("Reviewer", {
      description: "Reads and approves",
      permissions: ["viewListItems", "approveItems"],
    });

    expect(level.Name).toBe("Reviewer");
    expect(h.ids.roleKinds(level.Id).sort()).toEqual([
      "approveItems",
      "viewListItems",
    ]);
  });

  it("leaves a cold catalogue cold", async () => {
    const h = withCatalogue();
    const fetches = countFetches(h);

    await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });

    // Nothing needed looking up, so nothing was fetched. (The fake records mutations in
    // `calls`, not reads — counting there would prove nothing.)
    expect(fetches()).toBe(0);

    // And the cache is still cold rather than warmed to a partial one: the next lookup of
    // a level the write never absorbed still fetches, and still finds it.
    expect((await h.identity.roles.getByName("Contribute"))?.Id).toBe(
      CONTRIBUTE,
    );
    expect(fetches()).toBe(1);
  });

  it("is visible to the catalogue afterwards, without a refetch", async () => {
    const h = withCatalogue();
    const fetches = countFetches(h);
    await h.identity.roles.getByName("Contribute"); // warms the cache
    const level = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });

    expect((await h.identity.roles.getByName("Reviewer"))?.Id).toBe(level.Id);
    expect((await h.identity.roles.getById(level.Id))?.Name).toBe("Reviewer");
    expect(fetches()).toBe(1); // the warm-up, and nothing since
  });
});

describe("roles.clone", () => {
  it("clones by name, adding a permission", async () => {
    const h = withCatalogue();
    const level = await h.identity.roles.clone(
      "Contribute",
      "Contribute + Manage Permissions",
      { add: ["managePermissions"] },
    );

    expect(h.ids.roleKinds(level.Id).sort()).toEqual([
      "addListItems",
      "managePermissions",
      "viewListItems",
    ]);
  });

  it("clones by id and by entity too", async () => {
    const h = withCatalogue();
    const byId = await h.identity.roles.clone(CONTRIBUTE, "By id");
    const source = (await h.identity.roles.getByName("Contribute"))!;
    const byEntity = await h.identity.roles.clone(source, "By entity");

    expect(byId.Name).toBe("By id");
    expect(byEntity.Name).toBe("By entity");
  });

  it("clones a built-in level — that is the point of clone", async () => {
    const h = withCatalogue();
    const level = await h.identity.roles.clone("Full Control", "Nearly full", {
      remove: ["manageWeb"],
    });
    expect(level.Name).toBe("Nearly full");
  });

  it("throws for a source that names nothing", async () => {
    const h = withCatalogue();
    await expect(h.identity.roles.clone("Nope", "Whatever")).rejects.toThrow(
      "No role definition named 'Nope'.",
    );
  });
});

describe("roles.update", () => {
  it("replaces a permission set", async () => {
    const h = withCatalogue();
    const custom = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });
    await h.identity.roles.update(custom.Id, {
      permissions: ["manageWeb"],
    });
    expect(h.ids.roleKinds(custom.Id)).toEqual(["manageWeb"]);
  });

  it("applies a delta", async () => {
    const h = withCatalogue();
    const custom = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });
    await h.identity.roles.update(custom.Id, { add: ["approveItems"] });
    expect(h.ids.roleKinds(custom.Id).sort()).toEqual([
      "approveItems",
      "viewListItems",
    ]);
  });

  it("refuses both a replacement and a delta in one call", async () => {
    const h = withCatalogue();
    const custom = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });
    await expect(
      // The type forbids this; the cast is how a JS caller reaches past it, which is
      // exactly what the runtime check is for.
      h.identity.roles.update(custom.Id, {
        permissions: ["manageWeb"],
        add: ["approveItems"],
      } as unknown as RoleUpdate),
    ).rejects.toThrow("not both");
  });

  it("refuses a built-in level", async () => {
    const h = withCatalogue();
    await expect(
      h.identity.roles.update("Full Control", { description: "mine now" }),
    ).rejects.toThrow("built-in");
  });

  it("refreshes the catalogue entry it changed", async () => {
    const h = withCatalogue();
    const custom = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });
    await h.identity.roles.update(custom.Id, { name: "Approver" });

    expect((await h.identity.roles.getById(custom.Id))?.Name).toBe("Approver");
    expect(await h.identity.roles.getByName("Reviewer")).toBeNull();
  });
});

describe("roles.delete", () => {
  it("removes a custom level from the site and the catalogue", async () => {
    const h = withCatalogue();
    const custom = await h.identity.roles.create("Reviewer", {
      permissions: ["viewListItems"],
    });
    await h.identity.roles.delete(custom.Id);

    expect(await h.identity.roles.getById(custom.Id)).toBeNull();
    expect(h.ids.calls).toContain(`deleteRole:${custom.Id}`);
  });

  it("refuses a built-in level", async () => {
    const h = withCatalogue();
    await expect(h.identity.roles.delete("Contribute")).rejects.toThrow(
      "built-in",
    );
  });

  it("throws for an id that names no level", async () => {
    const h = withCatalogue();
    await expect(h.identity.roles.delete(4242)).rejects.toThrow("4242");
  });
});
