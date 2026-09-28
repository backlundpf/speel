import { describe, it, expect } from "vitest";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";

describe("FakeIdentityProvider", () => {
  it("returns the seeded current user", async () => {
    const p = new FakeIdentityProvider();
    p.setCurrentUser({
      Id: 7,
      Title: "Ada",
      LoginName: "i:0#.f|membership|ada@x.com",
    });
    expect((await p.getCurrentUserAsync()).Id).toBe(7);
  });

  it("reports membership in both directions and records writes", async () => {
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
    expect((await p.getUserGroupsAsync(7)).map((g) => g.Id)).toEqual([3]);
    expect(p.calls).toContain("addGroupMember:3:ada");
    await p.executeBatchAsync([
      { kind: "removeGroupMember", groupId: 3, userId: 7, clientToken: "t2" },
    ]);
    expect(await p.getGroupMembersAsync(3)).toEqual([]);
  });

  it("answers an unknown login with a failure result", async () => {
    const p = new FakeIdentityProvider();
    p.seedGroup({ Id: 3, Title: "Auditors" });
    const [result] = await p.executeBatchAsync([
      {
        kind: "addGroupMember",
        groupId: 3,
        loginName: "nobody",
        clientToken: "t",
      },
    ]);
    expect(result?.kind).toBe("failure");
    if (result?.kind === "failure") expect(result.body).toMatch(/nobody/);
  });

  it("searches seeded users by title or login, case-insensitively", async () => {
    const p = new FakeIdentityProvider();
    p.seedUser({ Id: 7, Title: "Ada Lovelace", LoginName: "ada" });
    p.seedUser({ Id: 8, Title: "Grace Hopper", LoginName: "grace" });
    expect(
      (await p.searchPrincipalsAsync("LOVE", 10)).map((u) => u.Id),
    ).toEqual([7]);
    expect((await p.searchPrincipalsAsync("a", 1)).length).toBe(1);
  });
});
