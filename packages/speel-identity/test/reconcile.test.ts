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
import { resourceKey } from "../src/resources.js";
import type {
  IdentityBatchOperation,
  IdentityBatchResult,
} from "../src/IIdentityProvider.js";

const CONTRACTS = { kind: "title", value: "Contracts" } as const;
const CONTRIBUTE_ID = 1073741827;
const READ_ID = 1073741826;
const FULL_CONTROL_ID = 1073741829;
/** The fake's default current user. */
const CALLER_ID = 1;

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
  ids.seedRoleDefinition({
    Id: FULL_CONTROL_ID,
    Name: "Full Control",
    RoleTypeKind: 5,
  });
  return { ctx, sp, ids, identity };
}

/**
 * SharePoint's own behaviour around a no-copy break, which the plain fake does not model:
 * `breakRoleInheritance(false, …)` leaves the securable holding exactly ONE assignment — the
 * caller, with Full Control — and a caller who no longer holds anything on a broken securable
 * cannot change it further (403), as for a site owner whose rights came by inheritance.
 */
class SharePointLikeFake extends FakeIdentityProvider {
  /** resource key → principal id → role definition ids. Only broken securables appear. */
  readonly held = new Map<string, Map<number, Set<number>>>();
  /** Grants to these principals fail regardless, to model a part-applied securable. */
  readonly failGrantsTo = new Set<number>();

  override executeBatchAsync(
    ops: readonly IdentityBatchOperation[],
  ): Promise<readonly IdentityBatchResult[]> {
    this.batches.push(ops.length);
    return Promise.resolve(ops.map((op) => this.#one(op)));
  }

  #one(op: IdentityBatchOperation): IdentityBatchResult {
    const { clientToken } = op;
    if (op.kind === "breakInheritance") {
      if (!op.copyExisting) {
        this.held.set(
          resourceKey(op.resource),
          new Map([[CALLER_ID, new Set([FULL_CONTROL_ID])]]),
        );
      }
      return { kind: "success", clientToken };
    }
    if (op.kind !== "grant" && op.kind !== "revoke") {
      return { kind: "success", clientToken };
    }
    const held = this.held.get(resourceKey(op.resource));
    if (held !== undefined && !held.has(CALLER_ID)) {
      return { kind: "failure", clientToken, status: 403, body: "Denied" };
    }
    if (op.kind === "grant" && this.failGrantsTo.has(op.principalId)) {
      return { kind: "failure", clientToken, status: 500, body: "Boom" };
    }
    if (held !== undefined) {
      const roles = held.get(op.principalId) ?? new Set<number>();
      if (op.kind === "grant") roles.add(op.roleDefinitionId);
      else roles.delete(op.roleDefinitionId);
      if (roles.size === 0) held.delete(op.principalId);
      else held.set(op.principalId, roles);
    }
    return { kind: "success", clientToken };
  }

  /** What a securable effectively holds now, as `principalId:roleId` strings. */
  effective(key: string): string[] {
    return [...(this.held.get(key) ?? new Map<number, Set<number>>())]
      .flatMap(([p, roles]) => [...roles].map((r) => `${p}:${r}`))
      .sort();
  }
}

function buildSharePointLike(): {
  ctx: Ctx;
  sp: FakeStorageProvider;
  ids: SharePointLikeFake;
  identity: ReturnType<typeof initSpeelIdentity>;
} {
  const sp = new FakeStorageProvider();
  const ids = new SharePointLikeFake();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(sp));
  const identity = initSpeelIdentity(ctx, (b) => b.useProvider(ids));
  ids.seedRoleDefinition({ Id: CONTRIBUTE_ID, Name: "Contribute" });
  ids.seedRoleDefinition({ Id: READ_ID, Name: "Read" });
  // A localised site: the caller's automatic role is found by its type, not its name.
  ids.seedRoleDefinition({
    Id: FULL_CONTROL_ID,
    Name: "Contrôle total",
    RoleTypeKind: 5,
  });
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
    // break + grant, then the revoke of the caller's automatic Full Control
    expect(results[0]).toEqual({ ok: true, applied: 3 });
    expect(results[1]!.applied).toBe(0);
    expect((results[1] as { message: string }).message).toMatch(/failed/);

    // The plans' save, then one more for the callers' automatic assignments — which must
    // land after the grants. copyExisting: false rides the break.
    expect(ids.batches).toEqual([4, 2]);
    expect(ids.calls).toContain(
      `removeRole:item:Contracts:${first.Id}:${CALLER_ID}:${FULL_CONTROL_ID}`,
    );
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
    expect(result).toEqual({ ok: true, applied: 3 });
  });
});

describe("applySecurables after a no-copy break (SharePoint adds the caller)", () => {
  const me = { Id: CALLER_ID, Title: "Test User", PrincipalType: 1 };

  it("leaves exactly the wanted assignments — the caller's automatic Full Control is revoked last", async () => {
    const { sp, ctx, ids, identity } = buildSharePointLike();
    const entity = await seededContract(sp, ctx, { assignments: [] });

    const result = await applySecurable(
      identity,
      entity,
      planOperations(entity, wantAdaContribute),
    );

    expect(result).toEqual({ ok: true, applied: 3 });
    expect(ids.effective(`item:Contracts:${entity.Id}`)).toEqual([
      `${ada.Id}:${CONTRIBUTE_ID}`,
    ]);
  });

  it("keeps the caller's wanted roles but still drops the Full Control nobody asked for", async () => {
    const { sp, ctx, ids, identity } = buildSharePointLike();
    const entity = await seededContract(sp, ctx, { assignments: [] });

    await applySecurable(
      identity,
      entity,
      planOperations(entity, {
        inherits: false,
        assignments: [{ member: me, roles: ["Read"] }],
      }),
    );

    expect(ids.effective(`item:Contracts:${entity.Id}`)).toEqual([
      `${CALLER_ID}:${READ_ID}`,
    ]);
  });

  it("leaves the caller's Full Control alone when the policy grants it", async () => {
    const { sp, ctx, ids, identity } = buildSharePointLike();
    const entity = await seededContract(sp, ctx, { assignments: [] });

    const result = await applySecurable(
      identity,
      entity,
      planOperations(entity, {
        inherits: false,
        assignments: [{ member: me, roles: ["Contrôle total"] }],
      }),
    );

    expect(result).toEqual({ ok: true, applied: 2 });
    expect(ids.batches).toHaveLength(1);
    expect(ids.effective(`item:Contracts:${entity.Id}`)).toEqual([
      `${CALLER_ID}:${FULL_CONTROL_ID}`,
    ]);
  });

  it("does not revoke the caller from a part-applied securable, so a re-run can still converge it", async () => {
    const { sp, ctx, ids, identity } = buildSharePointLike();
    const entity = await seededContract(sp, ctx, { assignments: [] });
    ids.failGrantsTo.add(ada.Id);

    const result = await applySecurable(
      identity,
      entity,
      planOperations(entity, wantAdaContribute),
    );

    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1); // the break
    expect(ids.batches).toHaveLength(1);
    expect(ids.effective(`item:Contracts:${entity.Id}`)).toEqual([
      `${CALLER_ID}:${FULL_CONTROL_ID}`,
    ]);
  });

  it("converges several broken securables with one extra save", async () => {
    const { sp, ctx, ids, identity } = buildSharePointLike();
    const a = await seededContract(sp, ctx, { assignments: [] });
    const b = await seededContract(sp, ctx, { assignments: [] });

    const results = await applySecurables(identity, [
      { resource: a, plan: planOperations(a, wantAdaContribute) },
      { resource: b, plan: planOperations(b, wantAdaContribute) },
    ]);

    expect(results).toEqual([
      { ok: true, applied: 3 },
      { ok: true, applied: 3 },
    ]);
    expect(ids.batches).toEqual([4, 2]);
    for (const e of [a, b]) {
      expect(ids.effective(`item:Contracts:${e.Id}`)).toEqual([
        `${ada.Id}:${CONTRIBUTE_ID}`,
      ]);
    }
  });

  it("refuses before sending anything when the site has no Full Control role to revoke", async () => {
    const sp = new FakeStorageProvider();
    const ids = new SharePointLikeFake();
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(sp));
    const identity = initSpeelIdentity(ctx, (b) => b.useProvider(ids));
    ids.seedRoleDefinition({ Id: CONTRIBUTE_ID, Name: "Contribute" });
    const entity = await seededContract(sp, ctx, { assignments: [] });

    await expect(
      applySecurable(
        identity,
        entity,
        planOperations(entity, wantAdaContribute),
      ),
    ).rejects.toBeInstanceOf(InvalidOperationException);
    expect(ids.batches).toHaveLength(0);
  });
});
