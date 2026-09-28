import { describe, it, expect } from "vitest";
import type { RoleAssignment, BasePermissions } from "../../src/permissions";

describe("permissions types", () => {
  it("compose a RoleAssignment value", () => {
    const ra: RoleAssignment = {
      Member: { Id: 7, Title: "Owners", PrincipalType: 8 },
      RoleDefinitionBindings: [
        { Id: 1073741829, Name: "Full Control", RoleTypeKind: 5 },
      ],
    };
    expect(ra.Member.Id).toBe(7);
    expect(ra.RoleDefinitionBindings[0]!.Name).toBe("Full Control");
  });

  it("compose a BasePermissions value", () => {
    const bp: BasePermissions = { High: 432, Low: 1012866047 };
    expect(bp.Low).toBe(1012866047);
  });
});
