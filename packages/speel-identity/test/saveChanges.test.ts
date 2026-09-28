import { describe, it, expect } from "vitest";
import { IdentitySaveException } from "../src/errors.js";
import { build, seedGroup, seedUser, type Harness } from "./harness.js";

function withAuditors(): Harness {
  const h = build();
  seedUser(h, { Id: 7, Title: "Ada", LoginName: "ada" });
  seedGroup(h, { Id: 3, Title: "Auditors" });
  return h;
}

describe("saveChangesAsync", () => {
  it("stages membership changes and applies them only on save", async () => {
    const h = withAuditors();
    h.identity.groups.addMember("Auditors", "ada");
    expect(h.identity.hasChanges).toBe(true);
    expect(h.ids.calls).toEqual([]); // nothing reached the wire

    const result = await h.identity.saveChangesAsync();
    expect(result.applied).toBe(1);
    expect(h.ids.calls).toEqual(["addGroupMember:3:ada"]);
    expect(h.identity.hasChanges).toBe(false);
    expect(
      (await h.identity.groups.members("Auditors")).map((u) => u.Id),
    ).toEqual([7]);
  });

  it("removes by id even when the caller passed a login", async () => {
    const h = withAuditors();
    h.ids.seedMembership(3, 7);
    h.identity.groups.removeMember("Auditors", "ada");
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual(["removeGroupMember:3:7"]);
  });

  it("resolves references at save time, not at staging time", async () => {
    const h = withAuditors();
    // The group does not exist yet when the change is staged.
    h.identity.groups.addMember("Created Later", "ada");
    seedGroup(h, { Id: 9, Title: "Created Later" });
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual(["addGroupMember:9:ada"]);
  });

  it("defaults an omitted user to the current one", async () => {
    const h = withAuditors();
    h.ids.setCurrentUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    h.identity.groups.addMember("Auditors");
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual(["addGroupMember:3:ada"]);
  });

  it("applies what it can and throws with the tally", async () => {
    const h = withAuditors();
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.groups.addMember("Auditors", "nobody"); // the fake rejects unknown logins
    h.identity.groups.addMember("Nope", "ada"); // and this group does not exist

    const error = await h.identity.saveChangesAsync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentitySaveException);
    const failure = error as IdentitySaveException;
    expect(failure.applied).toBe(1);
    expect(failure.failures).toHaveLength(2);
    expect(failure.failures[0]?.operation.op).toBe("addGroupMember");
    expect(failure.message).toMatch(/2 of 3/);
    // The queue is emptied either way: a retry re-stages rather than silently re-running
    // the operation that already landed.
    expect(h.identity.hasChanges).toBe(false);
  });

  it("is a no-op with nothing staged", async () => {
    const h = withAuditors();
    expect((await h.identity.saveChangesAsync()).applied).toBe(0);
    expect(h.ids.calls).toEqual([]);
  });

  it("applies operations in the order they were staged", async () => {
    const h = withAuditors();
    seedGroup(h, { Id: 4, Title: "Owners" });
    h.identity.groups.addMember("Owners", "ada");
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.groups.removeMember("Owners", "ada");
    await h.identity.saveChangesAsync();
    expect(h.ids.calls).toEqual([
      "addGroupMember:4:ada",
      "addGroupMember:3:ada",
      "removeGroupMember:4:7",
    ]);
  });
});
