import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "@speel/core/testing";
import { SpeelEntity, type ModelBuilder } from "@speel/core";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import {
  asRoleAssignments,
  materializeSPRoleAssignments,
} from "../src/securableExpand.js";

const CONTRACTS = { kind: "title", value: "Contracts" } as const;

class Contract extends SpeelEntity {
  Title?: string;
}

/** Extending IdentityDbContext is the whole opt-in — no explicit registration here. */
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

// The raw wire shape, including SharePoint's `{ results: [] }` wrapper variant.
const RA_WIRE = [
  {
    Member: { Id: 7, Title: "Ada", PrincipalType: 1 },
    RoleDefinitionBindings: [
      { Id: 1073741827, Name: "Contribute", RoleTypeKind: 3 },
    ],
  },
  {
    Member: { Id: 3, Title: "Auditors", PrincipalType: 8 },
    RoleDefinitionBindings: {
      results: [{ Id: 1073741826, Name: "Read", RoleTypeKind: 2 }],
    },
  },
];

async function seeded(): Promise<{
  ctx: Ctx;
  provider: FakeStorageProvider;
}> {
  const provider = new FakeStorageProvider();
  const ctx = new Ctx({ provider });
  provider.seedRow(CONTRACTS, { Title: "C" });
  provider.seedExpandPayload(CONTRACTS, 1, "RoleAssignments", RA_WIRE);
  provider.seedItemFields(CONTRACTS, 1, { HasUniqueRoleAssignments: true });
  return { ctx, provider };
}

describe("the securable snapshot expand", () => {
  it("loads wire-accurate SPRoleAssignments plus the unique flag in one clause", async () => {
    const { ctx } = await seeded();

    const [row] = await ctx.contracts
      .expand((x) => x.RoleAssignments)
      .toArrayAsync();

    // Typed access with no casts — the module augmentation is what compiles this.
    expect(row!.HasUniqueRoleAssignments).toBe(true);
    const ra = row!.RoleAssignments!;
    expect(ra).toHaveLength(2);
    expect(ra[0]!.Member.Title).toBe("Ada");
    expect(ra[0]!.Member.PrincipalType).toBe(1);
    expect(ra[0]!.RoleDefinitionBindings[0]).toMatchObject({
      Name: "Contribute",
      RoleTypeKind: 3,
    });
    // The `{ results: [] }` wrapper unwraps.
    expect(ra[1]!.RoleDefinitionBindings[0]!.Name).toBe("Read");
  });

  it("leaves both members untouched when the expand is not requested", async () => {
    const { ctx } = await seeded();
    const [row] = await ctx.contracts.toArrayAsync();
    expect(row!.RoleAssignments).toBeUndefined();
    expect(row!.HasUniqueRoleAssignments).toBeUndefined();
  });

  it("reports an inheriting row's flag as false when the wire says so", async () => {
    const provider = new FakeStorageProvider();
    const ctx = new Ctx({ provider });
    provider.seedRow(CONTRACTS, { Title: "C" });
    provider.seedExpandPayload(CONTRACTS, 1, "RoleAssignments", []);
    provider.seedItemFields(CONTRACTS, 1, { HasUniqueRoleAssignments: false });

    const [row] = await ctx.contracts
      .expand((x) => x.RoleAssignments)
      .toArrayAsync();
    expect(row!.HasUniqueRoleAssignments).toBe(false);
    expect(row!.RoleAssignments).toEqual([]);
  });
});

describe("materializeSPRoleAssignments", () => {
  it("reads a member in model spelling, ID accepted for Id", () => {
    // The member goes through the same seam as every other principal: a
    // SP.Principal record spells Email and LoginName as the model does.
    const [ra] = materializeSPRoleAssignments([
      {
        Member: {
          ID: 7,
          Title: "Ada",
          Email: "ada@x.com",
          LoginName: "i:0#.f|ada",
        },
        RoleDefinitionBindings: [],
      },
    ]);
    expect(ra!.Member.Id).toBe(7);
    expect(ra!.Member.Email).toBe("ada@x.com");
    expect(ra!.Member.LoginName).toBe("i:0#.f|ada");
  });
});

describe("asRoleAssignments", () => {
  it("collapses the wire shape to the library's { member, roles }", async () => {
    const { ctx } = await seeded();
    const [row] = await ctx.contracts
      .expand((x) => x.RoleAssignments)
      .toArrayAsync();

    expect(asRoleAssignments(row!.RoleAssignments)).toEqual([
      {
        member: { Id: 7, Title: "Ada", PrincipalType: 1 },
        roles: ["Contribute"],
      },
      {
        member: { Id: 3, Title: "Auditors", PrincipalType: 8 },
        roles: ["Read"],
      },
    ]);
  });

  it("treats undefined as no assignments", () => {
    expect(asRoleAssignments(undefined)).toEqual([]);
  });
});
