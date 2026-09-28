import { describe, it, expect } from "vitest";
import {
  initSpeelDbContext,
  InvalidOperationException,
  SpeelEntity,
  type ModelBuilder,
} from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import {
  applySecurable,
  applySecurables,
  diffSecurable,
  planOperations,
  type DesiredPermissions,
} from "../src/reconcile.js";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { seedSecurable } from "../src/testing/seedSecurable.js";

const CONTRACTS = { kind: "title", value: "Contracts" } as const;
const CONTRIBUTE_ID = 1073741827;
const READ_ID = 1073741826;

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
  ids.seedRoleDefinition({ Id: CONTRIBUTE_ID, Name: "Contribute" });
  ids.seedRoleDefinition({ Id: READ_ID, Name: "Read" });
  return { ctx, sp, ids, identity };
}

async function seededContract(
  sp: FakeStorageProvider,
  ctx: Ctx,
  state: Parameters<typeof seedSecurable>[3],
): Promise<Contract> {
  const id = sp.seedRow(CONTRACTS, { Title: "C" });
  seedSecurable(sp, CONTRACTS, id, state);
  const rows = await ctx.contracts
    .where((b) => b.Id.eq(id))
    .expand((x) => x.RoleAssignments)
    .toArrayAsync();
  return rows[0]!;
}

const ada = { Id: 7, Title: "Ada", PrincipalType: 1 };
const auditors = { Id: 3, Title: "Auditors", PrincipalType: 8 };

const wantAdaContribute: DesiredPermissions = {
  inherits: false,
  assignments: [{ member: ada, roles: ["Contribute"] }],
};

describe("diffSecurable", () => {
  it("matches when the securable grants exactly what is wanted (system roles ignored)", async () => {
    const { sp, ctx } = build();
    const entity = await seededContract(sp, ctx, {
      unique: true,
      assignments: [
        { member: ada, roles: ["Contribute"] },
        { member: auditors, roles: ["Limited Access"] }, // SharePoint's own bookkeeping
      ],
    });

    const report = diffSecurable(entity, wantAdaContribute);
    expect(report.status).toBe("matches");
    expect(report.differences).toEqual([]);
    expect(report.unique).toBe(true);
    // The report speaks the library dialect.
    expect(report.assignments[0]!.member.Title).toBe("Ada");
  });

  it("reports missing, wrong-role (exact set), and extra", async () => {
    const { sp, ctx } = build();
    const entity = await seededContract(sp, ctx, {
      unique: true,
      assignments: [
        { member: ada, roles: ["Read"] }, // wanted Contribute
        { member: auditors, roles: ["Contribute"] }, // not wanted at all
      ],
    });
    const desired: DesiredPermissions = {
      inherits: false,
      assignments: [
        { member: ada, roles: ["Contribute"] },
        { member: { Id: 9 }, roles: ["Read"] }, // title-less principal, absent
      ],
    };

    const report = diffSecurable(entity, desired);
    expect(report.status).toBe("drift");
    const kinds = report.differences.map((d) => d.kind).sort();
    expect(kinds).toEqual(["extra", "missing", "wrong-role"]);
    // A title-less principal is still nameable.
    expect(
      report.differences.find((d) => d.kind === "missing")!.detail,
    ).toContain("#9");
  });

  it("treats the inherits claim as inheritance alone", async () => {
    const { sp, ctx } = build();
    const inheriting = await seededContract(sp, ctx, {
      assignments: [],
    });
    const unique = await seededContract(sp, ctx, {
      unique: true,
      assignments: [{ member: ada, roles: ["Read"] }],
    });
    const wantInherit: DesiredPermissions = { inherits: true, assignments: [] };

    expect(diffSecurable(inheriting, wantInherit).status).toBe("matches");
    const report = diffSecurable(unique, wantInherit);
    expect(report.status).toBe("drift");
    expect(report.differences[0]!.kind).toBe("inheritance");
  });

  it("refuses an entity whose snapshot was never loaded", () => {
    const bare = new Contract();
    bare.Id = 1;
    expect(() => diffSecurable(bare, wantAdaContribute)).toThrow(
      InvalidOperationException,
    );
    expect(() => planOperations(bare, wantAdaContribute)).toThrow(/expand/i);
  });
});

describe("planOperations", () => {
  it("revokes before granting on an already-unique securable — and plans nothing on a match", async () => {
    const { sp, ctx } = build();
    const entity = await seededContract(sp, ctx, {
      unique: true,
      assignments: [
        { member: ada, roles: ["Read"] }, // wrong role → revoke + grant
        { member: auditors, roles: ["Contribute"] }, // unwanted → revoke
      ],
    });

    const plan = planOperations(entity, wantAdaContribute);
    expect(plan.map((op) => op.kind)).toEqual(["revoke", "revoke", "grant"]);
    expect(plan[2]).toMatchObject({ principal: ada, role: "Contribute" });

    const matching = await seededContract(sp, ctx, {
      unique: true,
      assignments: [{ member: ada, roles: ["Contribute"] }],
    });
    expect(planOperations(matching, wantAdaContribute)).toEqual([]);
  });

  it("breaks then grants the WHOLE desired set on an inheriting securable — no revokes", async () => {
    // What the row shows is the PARENT's: it dies with the break (copyExisting: false), so
    // revoking any of it targets ghosts, and skipping a grant because inheritance already
    // provided the role would lose that access the moment the break lands.
    const { sp, ctx } = build();
    const entity = await seededContract(sp, ctx, {
      assignments: [
        { member: ada, roles: ["Contribute"] }, // inherited AND wanted — still granted
        { member: auditors, roles: ["Contribute"] }, // inherited, unwanted — NOT revoked
      ],
    });

    const plan = planOperations(entity, wantAdaContribute);
    expect(plan).toEqual([
      { kind: "break" },
      { kind: "grant", principal: ada, role: "Contribute" },
    ]);
  });

  it("plans a lone reset for a unique securable the policy wants inheriting", async () => {
    const { sp, ctx } = build();
    const entity = await seededContract(sp, ctx, {
      unique: true,
      assignments: [{ member: ada, roles: ["Read"] }],
    });
    expect(planOperations(entity, { inherits: true, assignments: [] })).toEqual(
      [{ kind: "reset" }],
    );
  });
});

describe("applySecurables", () => {
  it("converges several securables in one save, attributing failures per entry", async () => {
    const { sp, ctx, ids, identity } = build();
    const first = await seededContract(sp, ctx, { assignments: [] });
    const third = await seededContract(sp, ctx, { assignments: [] });
    const unsaved = new Contract(); // no Id → its operations fail resolution

    const results = await applySecurables(identity, [
      { resource: first, plan: planOperations(first, wantAdaContribute) },
      {
        resource: unsaved,
        plan: [{ kind: "grant", principal: ada, role: "Read" }],
      },
      { resource: third, plan: planOperations(third, wantAdaContribute) },
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[0]).toEqual({ ok: true, applied: 2 }); // break + grant
    expect(results[1]!.applied).toBe(0);
    expect((results[1] as { message: string }).message).toMatch(/failed/);

    // One save; copyExisting: false rides the break.
    expect(ids.batches).toHaveLength(1);
    expect(ids.calls).toContain(
      `breakInheritance:item:Contracts:${first.Id}:false:false`,
    );
    expect(ids.calls).toContain(
      `addRole:item:Contracts:${first.Id}:${ada.Id}:${CONTRIBUTE_ID}`,
    );
    expect(ids.calls).toContain(
      `addRole:item:Contracts:${third.Id}:${ada.Id}:${CONTRIBUTE_ID}`,
    );
  });

  it("costs nothing when every plan is empty", async () => {
    const { sp, ctx, ids, identity } = build();
    const entity = await seededContract(sp, ctx, {
      unique: true,
      assignments: [{ member: ada, roles: ["Contribute"] }],
    });
    const results = await applySecurables(identity, [
      { resource: entity, plan: planOperations(entity, wantAdaContribute) },
    ]);
    expect(results).toEqual([{ ok: true, applied: 0 }]);
    expect(ids.batches).toHaveLength(0);
  });

  it("applySecurable is one-entry sugar", async () => {
    const { sp, ctx, identity } = build();
    const entity = await seededContract(sp, ctx, { assignments: [] });
    const result = await applySecurable(
      identity,
      entity,
      planOperations(entity, wantAdaContribute),
    );
    expect(result).toEqual({ ok: true, applied: 2 });
  });
});
