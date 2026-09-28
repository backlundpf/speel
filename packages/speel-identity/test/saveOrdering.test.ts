import { describe, it, expect } from "vitest";
import { itemIn, list, web } from "../src/resources.js";
import { build, seedGroup, seedUser, type Harness } from "./harness.js";

const CONTRIBUTE = 1073741827;
const READ = 1073741826;

function ready(): Harness {
  const h = build();
  seedUser(h, { Id: 7, Title: "Ada", LoginName: "ada" });
  seedUser(h, { Id: 8, Title: "Grace", LoginName: "grace" });
  seedGroup(h, { Id: 3, Title: "Auditors" });
  h.ids.seedRoleDefinition({
    Id: CONTRIBUTE,
    Name: "Contribute",
    RoleTypeKind: 3,
  });
  h.ids.seedRoleDefinition({ Id: READ, Name: "Read", RoleTypeKind: 2 });
  return h;
}

describe("save ordering", () => {
  it("breaks inheritance before granting on the same resource, whatever the staging order", async () => {
    const h = ready();
    const target = list("Contracts");
    // Staged the wrong way round on purpose: a grant applied while the resource still
    // inherits does not fail loudly — it edits the PARENT's assignments.
    h.identity.permissions.for(target).grant("ada", "Contribute");
    h.identity.permissions.for(target).breakInheritance();

    await h.identity.saveChangesAsync();

    expect(h.ids.calls).toEqual([
      "breakInheritance:list:Contracts:true:false",
      `addRole:list:Contracts:7:${CONTRIBUTE}`,
    ]);
  });

  it("revokes before granting within a resource", async () => {
    const h = ready();
    const target = list("Contracts");
    h.identity.permissions.for(target).grant("ada", "Contribute");
    h.identity.permissions.for(target).revoke("ada", "Read");

    await h.identity.saveChangesAsync();

    expect(h.ids.calls).toEqual([
      `removeRole:list:Contracts:7:${READ}`,
      `addRole:list:Contracts:7:${CONTRIBUTE}`,
    ]);
  });

  it("resets inheritance last, so nothing after it can land on the parent", async () => {
    const h = ready();
    const target = list("Contracts");
    h.identity.permissions.for(target).resetInheritance();
    h.identity.permissions.for(target).grant("ada", "Contribute");

    await h.identity.saveChangesAsync();

    // Staging a reset with a grant is incoherent either way — the reset discards what the
    // grant made. Reset-last makes that visible; reset-first would silently edit the parent.
    expect(h.ids.calls).toEqual([
      `addRole:list:Contracts:7:${CONTRIBUTE}`,
      "resetInheritance:list:Contracts",
    ]);
  });

  it("keeps resource groups in the order they were first touched", async () => {
    const h = ready();
    // Interleaved staging across two resources; each resource's work must stay together.
    h.identity.permissions.for(list("Contracts")).grant("ada", "Contribute");
    h.identity.permissions.for(list("Invoices")).grant("grace", "Read");
    h.identity.permissions.for(list("Contracts")).breakInheritance();
    h.identity.permissions.for(list("Invoices")).breakInheritance();

    await h.identity.saveChangesAsync();

    expect(h.ids.calls).toEqual([
      "breakInheritance:list:Contracts:true:false",
      `addRole:list:Contracts:7:${CONTRIBUTE}`,
      "breakInheritance:list:Invoices:true:false",
      `addRole:list:Invoices:8:${READ}`,
    ]);
  });

  it("treats two items in the same list as separate resources", async () => {
    const h = ready();
    h.identity.permissions
      .for(itemIn("Contracts", 4))
      .grant("ada", "Contribute");
    h.identity.permissions.for(itemIn("Contracts", 5)).breakInheritance();

    await h.identity.saveChangesAsync();

    // Item 5's break must NOT be hoisted ahead of item 4's grant: different resources.
    expect(h.ids.calls).toEqual([
      `addRole:item:Contracts:4:7:${CONTRIBUTE}`,
      "breakInheritance:item:Contracts:5:true:false",
    ]);
  });

  it("leaves membership operations in staging order among themselves", async () => {
    const h = ready();
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

  it("interleaves membership and resource work by first appearance", async () => {
    const h = ready();
    h.identity.groups.addMember("Auditors", "ada");
    h.identity.permissions
      .for(list("Contracts"))
      .grant("Auditors", "Contribute");
    h.identity.permissions.for(list("Contracts")).breakInheritance();

    await h.identity.saveChangesAsync();

    // Adding the member first is the point: the group has to hold the people before the
    // resource grant means anything for them.
    expect(h.ids.calls).toEqual([
      "addGroupMember:3:ada",
      "breakInheritance:list:Contracts:true:false",
      `addRole:list:Contracts:3:${CONTRIBUTE}`,
    ]);
  });

  it("reports a resource that cannot be resolved without abandoning the rest of the save", async () => {
    const h = ready();
    h.identity.permissions.for(web()).grant("ada", "Contribute");
    h.identity.permissions
      .for({ kind: "entity", entity: {} })
      .grant("ada", "Contribute");

    const error = (await h.identity
      .saveChangesAsync()
      .catch((e: unknown) => e)) as { applied: number };
    expect(error.applied).toBe(1);
    expect(h.ids.calls).toEqual([`addRole:web:7:${CONTRIBUTE}`]);
  });
});
