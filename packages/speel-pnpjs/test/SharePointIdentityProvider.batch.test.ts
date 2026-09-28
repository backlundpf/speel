import { describe, it, expect } from "vitest";
import type { IdentityBatchOperation } from "@speel/identity";
import { SharePointIdentityProvider } from "../src/identity/SharePointIdentityProvider.js";

// A structural double in the style of SharePointIdentityProvider.permissions.test.ts:
// securables record which scope they were addressed as, and `batched()` hands back the same
// object plus an execute that records its own marker, so ordering is assertable.
function makeFakeSp() {
  const calls: string[] = [];

  const securable = (scope: string) => ({
    breakRoleInheritance: async (copy: boolean, clear: boolean) => {
      calls.push(`break:${scope}:${copy}:${clear}`);
    },
    resetRoleInheritance: async () => {
      calls.push(`reset:${scope}`);
    },
    roleAssignments: {
      add: async (principalId: number, roleDefId: number) => {
        calls.push(`addRole:${scope}:${principalId}:${roleDefId}`);
      },
      remove: async (principalId: number, roleDefId: number) => {
        calls.push(`removeRole:${scope}:${principalId}:${roleDefId}`);
      },
    },
  });

  const web = Object.assign(securable("web"), {
    lists: {
      getByTitle: (title: string) =>
        Object.assign(securable(`list:${title}`), {
          items: { getById: (id: number) => securable(`item:${title}:${id}`) },
        }),
    },
    siteGroups: {
      getById: (groupId: number) => ({
        users: {
          add: async (loginName: string) => {
            if (loginName === "reject-me") {
              throw Object.assign(new Error("boom"), { status: 404 });
            }
            calls.push(`addMember:${groupId}:${loginName}`);
          },
          removeById: async (userId: number) => {
            calls.push(`removeMember:${groupId}:${userId}`);
          },
        },
      }),
    },
  });

  const sp = {
    web,
    batched: () => [
      sp,
      async () => {
        calls.push("$execute");
      },
    ],
  };
  return { sp, calls };
}

const CONTRACTS = { kind: "list", list: "Contracts" } as const;

describe("SharePointIdentityProvider.executeBatchAsync", () => {
  it("queues every op kind on one batch and correlates results by token", async () => {
    const { sp, calls } = makeFakeSp();
    const provider = new SharePointIdentityProvider(sp as never);
    const ops: IdentityBatchOperation[] = [
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
        resource: { kind: "item", list: "Contracts", id: 4 },
        principalId: 7,
        roleDefinitionId: 1073741827,
        clientToken: "t3",
      },
      {
        kind: "resetInheritance",
        resource: { kind: "web" },
        clientToken: "t4",
      },
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "ada",
        clientToken: "t5",
      },
      { kind: "removeGroupMember", groupId: 3, userId: 7, clientToken: "t6" },
    ];
    const results = await provider.executeBatchAsync(ops);
    expect(results.map((r) => `${r.clientToken}:${r.kind}`)).toEqual([
      "t1:success",
      "t2:success",
      "t3:success",
      "t4:success",
      "t5:success",
      "t6:success",
    ]);
    expect(calls).toEqual([
      "break:list:Contracts:true:false",
      "addRole:list:Contracts:7:1073741827",
      "removeRole:item:Contracts:4:7:1073741827",
      "reset:web",
      "addMember:3:ada",
      "removeMember:3:7",
      "$execute",
    ]);
  });

  it("maps a rejection to a failure result without disturbing its neighbors", async () => {
    const { sp } = makeFakeSp();
    const provider = new SharePointIdentityProvider(sp as never);
    const results = await provider.executeBatchAsync([
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "reject-me",
        clientToken: "t1",
      },
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "ada",
        clientToken: "t2",
      },
    ]);
    expect(results[0]).toEqual({
      kind: "failure",
      clientToken: "t1",
      status: 404,
      body: "boom",
    });
    expect(results[1]).toEqual({ kind: "success", clientToken: "t2" });
  });

  it("does nothing at all for an empty op list", async () => {
    const { sp, calls } = makeFakeSp();
    const provider = new SharePointIdentityProvider(sp as never);
    expect(await provider.executeBatchAsync([])).toEqual([]);
    expect(calls).toEqual([]); // no batch created, no $execute
  });
});
