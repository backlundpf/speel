import { describe, it, expect, vi } from "vitest";
import { SaveAbortedException } from "@speel/core";
import { IdentitySaveException } from "../src/errors.js";
import { itemIn } from "../src/resources.js";
import { build, seedGroup, seedUser, type Harness } from "./harness.js";

const CONTRIBUTE = 1073741827;

function ready(): Harness {
  const h = build();
  seedUser(h, { Id: 7, Title: "Ada", LoginName: "ada" });
  seedGroup(h, { Id: 3, Title: "Auditors" });
  seedGroup(h, { Id: 4, Title: "Owners" });
  h.ids.seedRoleDefinition({
    Id: CONTRIBUTE,
    Name: "Contribute",
    RoleTypeKind: 3,
  });
  return h;
}

describe("saveChangesAsync batching", () => {
  it("sends everything in one batch by default", async () => {
    const h = ready();
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.groups.addMember("Owners", "ada");
    h.identity.permissions.for(itemIn("Contracts", 1)).grant(7, CONTRIBUTE);
    await h.identity.saveChangesAsync();
    expect(h.ids.batches).toEqual([3]);
  });

  it("chunks at maxBatchSize, preserving order across chunks", async () => {
    const h = ready();
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.groups.addMember("Owners", "ada");
    h.identity.groups.removeMember("Auditors", "ada");
    await h.identity.saveChangesAsync({ maxBatchSize: 2 });
    expect(h.ids.batches).toEqual([2, 1]);
    expect(h.ids.calls).toEqual([
      "addGroupMember:3:ada",
      "addGroupMember:4:ada",
      "removeGroupMember:3:7",
    ]);
  });

  it("resolves a repeated reference once per save", async () => {
    const h = ready();
    const roleSpy = vi.spyOn(h.ids, "getRoleDefinitionsAsync");
    // principalId resolves a bare string through `principals`, not `siteUsers`:
    // the reference may name a claims group, which is not a site user.
    let principalReads = 0;
    const origPaged = h.sp.getItemsPagedAsync.bind(h.sp);
    h.sp.getItemsPagedAsync = async (
      source,
      fields,
      pageSize,
      cursor,
      opts,
    ) => {
      if (source.kind === "provider" && source.key === "principals")
        principalReads++;
      return origPaged(source, fields, pageSize, cursor, opts);
    };
    for (let i = 1; i <= 5; i += 1) {
      h.identity.permissions
        .for(itemIn("Contracts", i))
        .grant("ada", "Contribute");
    }
    await h.identity.saveChangesAsync();
    expect(roleSpy).toHaveBeenCalledTimes(1);
    expect(principalReads).toBe(1);
    expect(h.ids.calls).toEqual(
      [1, 2, 3, 4, 5].map((i) => `addRole:item:Contracts:${i}:7:${CONTRIBUTE}`),
    );
  });

  it("reports an unresolvable reference without sending anything", async () => {
    const h = ready();
    h.identity.groups.addMember("Nope", "ada");
    const error = await h.identity.saveChangesAsync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentitySaveException);
    expect(h.ids.batches).toEqual([]);
    expect(h.ids.calls).toEqual([]);
  });

  it("throws immediately and leaves the queue intact when already aborted", async () => {
    const h = ready();
    h.identity.groups.addMember("Auditors", "ada");
    const controller = new AbortController();
    controller.abort();
    await expect(
      h.identity.saveChangesAsync({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(SaveAbortedException);
    expect(h.identity.hasChanges).toBe(true);
    expect(h.ids.calls).toEqual([]);
  });

  it("re-stages what did not land when aborted between chunks", async () => {
    const h = ready();
    const controller = new AbortController();
    const original = h.ids.executeBatchAsync.bind(h.ids);
    vi.spyOn(h.ids, "executeBatchAsync").mockImplementation(async (ops) => {
      const results = await original(ops);
      controller.abort(); // fires after the first chunk lands
      return results;
    });
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.groups.addMember("Owners", "ada");
    await expect(
      h.identity.saveChangesAsync({
        maxBatchSize: 1,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(SaveAbortedException);
    expect(h.ids.calls).toEqual(["addGroupMember:3:ada"]); // chunk 1 landed
    expect(h.identity.hasChanges).toBe(true);
    expect(h.identity.pendingChanges).toHaveLength(1);
    expect((h.identity.pendingChanges[0] as { group: unknown }).group).toBe(
      "Owners",
    );
  });
});
