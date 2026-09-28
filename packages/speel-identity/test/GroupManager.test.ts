import { describe, it, expect } from "vitest";
import { InvalidOperationException } from "@speel/core";
import { SiteGroup } from "@speel/core";
import { build, seedGroup, seedUser, type Harness } from "./harness.js";

function withAuditors(): Harness {
  const h = build();
  seedUser(h, { Id: 7, Title: "Ada", LoginName: "ada" });
  seedGroup(h, { Id: 3, Title: "Auditors" });
  seedGroup(h, { Id: 4, Title: "Owners" });
  h.ids.seedMembership(3, 7);
  return h;
}

describe("GroupManager", () => {
  it("getByName reads the siteGroups set by Title", async () => {
    const h = build();
    seedGroup(h, { Id: 5, Title: "Auditors" });
    expect((await h.identity.groups.getByName("Auditors"))?.Id).toBe(5);
    expect(await h.identity.groups.getByName("Nope")).toBeNull();
  });

  it("lists members by title, by id, and by entity", async () => {
    const h = withAuditors();
    const byEntity = new SiteGroup();
    byEntity.Id = 3;
    expect(
      (await h.identity.groups.members("Auditors")).map((u) => u.Id),
    ).toEqual([7]);
    expect((await h.identity.groups.members(3)).map((u) => u.Id)).toEqual([7]);
    expect(
      (await h.identity.groups.members(byEntity)).map((u) => u.Id),
    ).toEqual([7]);
  });

  it("lists the groups a user belongs to", async () => {
    const h = withAuditors();
    expect((await h.identity.groups.groupsFor(7)).map((g) => g.Title)).toEqual([
      "Auditors",
    ]);
  });

  it("answers isMember for the current user by default", async () => {
    const h = withAuditors();
    h.ids.setCurrentUser({ Id: 7, Title: "Ada", LoginName: "ada" });
    expect(await h.identity.groups.isMember("Auditors")).toBe(true);
    expect(await h.identity.groups.isMember("Owners")).toBe(false);
  });

  it("answers isMember for someone else when asked", async () => {
    const h = withAuditors();
    seedUser(h, { Id: 8, Title: "Grace", LoginName: "grace" });
    h.ids.setCurrentUser({ Id: 7, LoginName: "ada" });
    expect(await h.identity.groups.isMember("Auditors", 8)).toBe(false);
    expect(await h.identity.groups.isMember("Auditors", "ada")).toBe(true);
  });

  it("reads the whole group list through the context", async () => {
    const h = withAuditors();
    expect((await h.identity.groups.all()).map((g) => g.Title).sort()).toEqual([
      "Auditors",
      "Owners",
    ]);
    expect((await h.identity.groups.get("Auditors"))?.Id).toBe(3);
  });

  it("names the group it could not find rather than failing anonymously", async () => {
    const h = withAuditors();
    await expect(h.identity.groups.members("Nope")).rejects.toThrow(
      InvalidOperationException,
    );
    await expect(h.identity.groups.members("Nope")).rejects.toThrow(/Nope/);
  });

  it("names the login it could not resolve", async () => {
    const h = withAuditors();
    await expect(h.identity.groups.groupsFor("ghost")).rejects.toThrow(/ghost/);
  });

  it("lists every group with its members in one provider call", async () => {
    const h = withAuditors();
    seedUser(h, { Id: 8, Title: "Grace", LoginName: "grace" });
    h.ids.seedMembership(4, 8);

    const all = await h.identity.groups.allWithMembers();

    expect(all.map((m) => m.group.Title)).toEqual(["Auditors", "Owners"]);
    expect(all.map((m) => m.members.map((u) => u.Title))).toEqual([
      ["Ada"],
      ["Grace"],
    ]);
  });

  it("gives a group with no members an empty array rather than omitting it", async () => {
    const h = build();
    seedGroup(h, { Id: 9, Title: "Empty" });

    const all = await h.identity.groups.allWithMembers();

    expect(all).toHaveLength(1);
    expect(all[0]!.group.Title).toBe("Empty");
    expect(all[0]!.members).toEqual([]);
  });

  it("creates a group and returns it, without waiting for a save", async () => {
    const h = build();

    const created = await h.identity.groups.create("New Auditors");

    expect(created.Title).toBe("New Auditors");
    expect(created.Id).toBeGreaterThan(0);
    // Immediate, unlike every staged mutation: the caller needs the new id.
    expect(h.ids.calls).toContain("createGroup:New Auditors");
    expect(h.identity.hasChanges).toBe(false);
  });

  it("carries a description through when one is given", async () => {
    const h = build();

    await h.identity.groups.create("Described", {
      description: "why it exists",
    });

    expect(h.ids.calls).toContain("createGroup:Described");
  });

  it("rejects a duplicate title rather than returning the existing group", async () => {
    const h = build();
    seedGroup(h, { Id: 3, Title: "Auditors" });

    await expect(h.identity.groups.create("Auditors")).rejects.toThrow(
      /Auditors/,
    );
  });

  it("returns the web's three associated groups in one call", async () => {
    const h = build();
    h.ids.seedAssociatedGroups({
      owners: { Id: 3, Title: "Site Owners" },
      members: { Id: 4, Title: "Site Members" },
      visitors: { Id: 5, Title: "Site Visitors" },
    });

    const associated = await h.identity.groups.associated();

    expect(associated.owners?.Id).toBe(3);
    expect(associated.owners?.Title).toBe("Site Owners");
    expect(associated.members?.Title).toBe("Site Members");
    expect(associated.visitors?.Title).toBe("Site Visitors");
  });

  it("reports a group the web does not have as null, without disturbing the others", async () => {
    const h = build();
    h.ids.seedAssociatedGroups({
      owners: { Id: 3, Title: "Site Owners" },
      members: { Id: 4, Title: "Site Members" },
    });

    const associated = await h.identity.groups.associated();

    expect(associated.owners?.Title).toBe("Site Owners");
    expect(associated.members?.Title).toBe("Site Members");
    // A web can genuinely lack one; that is a fact to report, not an error.
    expect(associated.visitors).toBeNull();
  });

  it("returns all nulls for a web with no associated groups rather than throwing", async () => {
    const h = build();

    const associated = await h.identity.groups.associated();

    expect(associated).toEqual({ owners: null, members: null, visitors: null });
  });
});
