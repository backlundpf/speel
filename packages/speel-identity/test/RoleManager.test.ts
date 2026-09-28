import { describe, it, expect } from "vitest";
import { build } from "./harness.js";

const CONTRIBUTE = 1073741827;

describe("RoleManager", () => {
  it("resolves a role definition by name, id, and type", async () => {
    const h = build();
    h.ids.seedRoleDefinition({
      Id: CONTRIBUTE,
      Name: "Contribute",
      RoleTypeKind: 3,
    });
    expect((await h.identity.roles.getByName("Contribute"))?.Id).toBe(
      CONTRIBUTE,
    );
    expect((await h.identity.roles.getById(CONTRIBUTE))?.Name).toBe(
      "Contribute",
    );
    expect((await h.identity.roles.getByType(3))?.Name).toBe("Contribute");
  });

  it("returns null for a role that does not exist rather than throwing", async () => {
    const h = build();
    expect(await h.identity.roles.getByName("Nope")).toBeNull();
  });

  it("lists the catalogue by name", async () => {
    const h = build();
    h.ids.seedRoleDefinition({
      Id: CONTRIBUTE,
      Name: "Contribute",
      RoleTypeKind: 3,
    });
    h.ids.seedRoleDefinition({ Id: 1073741826, Name: "Read", RoleTypeKind: 2 });
    expect([...(await h.identity.roles.allByName()).keys()].sort()).toEqual([
      "Contribute",
      "Read",
    ]);
  });
});
