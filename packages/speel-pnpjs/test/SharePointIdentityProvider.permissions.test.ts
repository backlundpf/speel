import { describe, it, expect, vi } from "vitest";
import { PermissionKind } from "@pnp/sp/security/index.js";
import { SharePointIdentityProvider } from "../src/identity/SharePointIdentityProvider.js";

// A structural double whose securables record which scope they were addressed as, so the
// tests assert the pnp path each method takes rather than the values it passes through.
function makeFakeSp() {
  const calls: string[] = [];

  const securable = (scope: string) => ({
    getCurrentUserEffectivePermissions: async () => {
      calls.push(`effectiveCurrent:${scope}`);
      return { High: 0, Low: 2 };
    },
    getUserEffectivePermissions: async (login: string) => {
      calls.push(`effectiveUser:${scope}:${login}`);
      return { High: 0, Low: 1 };
    },
    breakRoleInheritance: async (copy: boolean, clear: boolean) => {
      calls.push(`break:${scope}:${copy}:${clear}`);
    },
    resetRoleInheritance: async () => {
      calls.push(`reset:${scope}`);
    },
    // The real thing is PnP's pure mask test, mixed onto every securable.
    hasPermissions: (mask: { Low: number }, perm: PermissionKind) =>
      mask.Low === perm,
    roleAssignments: Object.assign(() => undefined, {
      expand:
        (...fields: string[]) =>
        async () => {
          calls.push(`assignments:${scope}:${fields.join(",")}`);
          return [{ PrincipalId: 7 }];
        },
      add: vi.fn(async (principalId: number, roleDefId: number) => {
        calls.push(`addRole:${scope}:${principalId}:${roleDefId}`);
      }),
      remove: vi.fn(async (principalId: number, roleDefId: number) => {
        calls.push(`removeRole:${scope}:${principalId}:${roleDefId}`);
      }),
    }),
  });

  const web = Object.assign(securable("web"), {
    lists: {
      getByTitle: (title: string) =>
        Object.assign(securable(`list:${title}`), {
          items: { getById: (id: number) => securable(`item:${title}:${id}`) },
        }),
    },
  });

  return { sp: { web }, calls };
}

function build() {
  const { sp, calls } = makeFakeSp();
  return { provider: new SharePointIdentityProvider(sp as never), calls };
}

describe("SharePointIdentityProvider permissions", () => {
  it("addresses the web, a list, and an item as securables", async () => {
    const { provider, calls } = build();
    await provider.getEffectivePermissionsAsync({ kind: "web" });
    await provider.getEffectivePermissionsAsync({
      kind: "list",
      list: "Contracts",
    });
    await provider.getEffectivePermissionsAsync({
      kind: "item",
      list: "Contracts",
      id: 4,
    });
    expect(calls).toEqual([
      "effectiveCurrent:web",
      "effectiveCurrent:list:Contracts",
      "effectiveCurrent:item:Contracts:4",
    ]);
  });

  it("reads another user's permissions when a login is supplied", async () => {
    const { provider, calls } = build();
    await provider.getEffectivePermissionsAsync(
      { kind: "list", list: "Contracts" },
      "ada",
    );
    expect(calls).toEqual(["effectiveUser:list:Contracts:ada"]);
  });

  it("maps the speel vocabulary onto PnP permission kinds", () => {
    const { provider } = build();
    // The double's hasPermissions returns Low === perm, so this asserts the mapped number:
    // AddListItems is 2, ViewListItems is 1.
    expect(provider.hasPermission({ High: 0, Low: 2 }, "addListItems")).toBe(
      true,
    );
    expect(provider.hasPermission({ High: 0, Low: 2 }, "viewListItems")).toBe(
      false,
    );
    expect(provider.hasPermission({ High: 0, Low: 1 }, "viewListItems")).toBe(
      true,
    );
    expect(
      provider.hasPermission({ High: 0, Low: 26 }, "managePermissions"),
    ).toBe(true);
  });

  it("expands the principal and role bindings when reading assignments", async () => {
    const { provider, calls } = build();
    // Without the expand the records come back as ids, which no caller can display.
    expect(
      await provider.getRoleAssignmentsAsync({
        kind: "list",
        list: "Contracts",
      }),
    ).toEqual([{ PrincipalId: 7 }]);
    expect(calls).toEqual([
      "assignments:list:Contracts:Member,RoleDefinitionBindings",
    ]);
  });

  // Permission mutations now travel only through executeBatchAsync — covered by
  // SharePointIdentityProvider.batch.test.ts.
});
