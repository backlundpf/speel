import { describe, it, expect } from "vitest";
import {
  initSpeelDbContext,
  SpeelEntity,
  type ModelBuilder,
} from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import { asRoleAssignments } from "../src/securableExpand.js";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { seedSecurable } from "../src/testing/seedSecurable.js";

const CONTRACTS = { kind: "title", value: "Contracts" } as const;
const CONTRIBUTE = 1073741827;

class Contract extends SpeelEntity {
  Title?: string;
}
class Ctx extends IdentityDbContext {
  contracts = this.set(Contract);
  protected override onModelCreating(mb: ModelBuilder): void {
    super.onModelCreating(mb);
    mb.entity(Contract, (b) => {
      b.toList("Contracts");
      b.property((e) => e.Title).isText();
    });
  }
}

function build(): {
  ctx: Ctx;
  sp: FakeStorageProvider;
  ids: FakeIdentityProvider;
  identity: ReturnType<typeof initSpeelIdentity>;
} {
  const sp = new FakeStorageProvider();
  const ids = new FakeIdentityProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(sp));
  const identity = initSpeelIdentity(ctx, (b) => b.useProvider(ids));
  return { ctx, sp, ids, identity };
}

describe("permissions.for(entity)", () => {
  it("accepts the entity itself and applies against its item", async () => {
    const { identity, ids } = build();
    const contract = new Contract();
    contract.Id = 4;

    identity.permissions.for(contract).grant(7, CONTRIBUTE);
    await identity.saveChangesAsync();

    expect(ids.calls).toEqual([`addRole:item:Contracts:4:7:${CONTRIBUTE}`]);
  });

  it("still accepts explicit resource refs unchanged", async () => {
    const { identity, ids } = build();
    identity.permissions.for({ kind: "web" }).grant(7, CONTRIBUTE);
    await identity.saveChangesAsync();
    expect(ids.calls).toEqual([`addRole:web:7:${CONTRIBUTE}`]);
  });
});

describe("seedSecurable", () => {
  it("round-trips: simple shape in, wire shape out, simple shape back", async () => {
    const { ctx, sp } = build();
    sp.seedRow(CONTRACTS, { Title: "C" });
    const stated = [
      {
        member: { Id: 7, Title: "Ada", PrincipalType: 1 },
        roles: ["Contribute", "Read"],
      },
      { member: { Id: 3, Title: "Auditors", PrincipalType: 8 }, roles: [] },
    ];
    seedSecurable(sp, CONTRACTS, 1, { unique: true, assignments: stated });

    const [row] = await ctx.contracts
      .expand((x) => x.RoleAssignments)
      .toArrayAsync();

    expect(row!.HasUniqueRoleAssignments).toBe(true);
    // The entity carries the wire shape…
    expect(row!.RoleAssignments![0]!.RoleDefinitionBindings[0]!.Name).toBe(
      "Contribute",
    );
    // …and the converter restores exactly what was stated.
    expect(asRoleAssignments(row!.RoleAssignments)).toEqual(stated);
  });

  it("states an inheriting row when unique is omitted", async () => {
    const { ctx, sp } = build();
    sp.seedRow(CONTRACTS, { Title: "C" });
    seedSecurable(sp, CONTRACTS, 1, { assignments: [] });

    const [row] = await ctx.contracts
      .expand((x) => x.RoleAssignments)
      .toArrayAsync();
    expect(row!.HasUniqueRoleAssignments).toBe(false);
    expect(row!.RoleAssignments).toEqual([]);
  });
});
