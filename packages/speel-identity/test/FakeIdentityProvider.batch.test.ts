import { describe, it, expect } from "vitest";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import type { IdentityBatchOperation } from "../src/IIdentityProvider.js";

const CONTRACTS = { kind: "list", list: "Contracts" } as const;

describe("FakeIdentityProvider.executeBatchAsync", () => {
  it("applies every op kind in order and records one batch", async () => {
    const p = new FakeIdentityProvider();
    p.seedUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    p.seedGroup({ Id: 3, Title: "Auditors" });
    const ops: IdentityBatchOperation[] = [
      {
        kind: "breakInheritance",
        resource: CONTRACTS,
        copyExisting: true,
        clearSubscopes: false,
        clientToken: "t1",
      },
      {
        kind: "revoke",
        resource: CONTRACTS,
        principalId: 7,
        roleDefinitionId: 1073741826,
        clientToken: "t2",
      },
      {
        kind: "grant",
        resource: CONTRACTS,
        principalId: 7,
        roleDefinitionId: 1073741827,
        clientToken: "t3",
      },
      { kind: "resetInheritance", resource: CONTRACTS, clientToken: "t4" },
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "ada",
        clientToken: "t5",
      },
      { kind: "removeGroupMember", groupId: 3, userId: 7, clientToken: "t6" },
    ];
    const results = await p.executeBatchAsync(ops);
    expect(results.map((r) => r.kind)).toEqual(
      Array<string>(6).fill("success"),
    );
    expect(results.map((r) => r.clientToken)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
      "t6",
    ]);
    expect(p.calls).toEqual([
      "breakInheritance:list:Contracts:true:false",
      "removeRole:list:Contracts:7:1073741826",
      "addRole:list:Contracts:7:1073741827",
      "resetInheritance:list:Contracts",
      "addGroupMember:3:ada",
      "removeGroupMember:3:7",
    ]);
    expect(p.batches).toEqual([6]);
  });

  it("turns an unknown login into a failure result, not a rejection", async () => {
    const p = new FakeIdentityProvider();
    p.seedGroup({ Id: 3, Title: "Auditors" });
    const results = await p.executeBatchAsync([
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "nobody",
        clientToken: "t1",
      },
    ]);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.kind).toBe("failure");
    if (r.kind === "failure") expect(r.body).toMatch(/nobody/);
  });

  it("actually mutates membership so later reads see it", async () => {
    const p = new FakeIdentityProvider();
    p.seedUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    p.seedGroup({ Id: 3, Title: "Auditors" });
    await p.executeBatchAsync([
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "ada",
        clientToken: "t1",
      },
    ]);
    expect((await p.getGroupMembersAsync(3)).map((u) => u.Id)).toEqual([7]);
  });
});
