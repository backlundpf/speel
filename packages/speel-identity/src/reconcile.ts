import { InvalidOperationException } from "@speel/core";
import { IdentitySaveException } from "./errors.js";
import { asRoleAssignments } from "./securableExpand.js";

import type { IEntity } from "@speel/core";
import type { Principal, SiteUser } from "@speel/core";
import type { RoleAssignment } from "./PermissionManager.js";
import type { ISecurable, RoleDefinition } from "./permissionTypes.js";
import type { ResourceRef } from "./resources.js";
import type { SpeelIdentity } from "./SpeelIdentity.js";
import type { IdentityOperation } from "./IdentityChangeQueue.js";

/**
 * Roles SharePoint manages itself. Granting anyone rights to a child securable gives them
 * `Limited Access` on every ancestor, so comparing these would put nearly every resource in
 * drift and bury the real findings. They are displayed, never compared.
 */
export const SYSTEM_ROLES: readonly string[] = [
  "Limited Access",
  "System.LimitedView",
  "System.LimitedEdit",
];

/** What a policy wants one securable to grant. The engine's only input type of its own. */
export interface DesiredPermissions {
  /** The resource should inherit; `assignments` is then empty. */
  inherits: boolean;
  assignments: RoleAssignment[];
}

export interface SecurableDifference {
  kind: "inheritance" | "missing" | "extra" | "wrong-role";
  detail: string;
}

export interface SecurableReport {
  status: "matches" | "drift";
  unique: boolean;
  /** What the securable holds, in the library dialect. */
  assignments: RoleAssignment[];
  differences: SecurableDifference[];
}

export interface PlannedOperation {
  /**
   * A `break` means "break inheritance, leaving only what this plan grants": applying it
   * also revokes the Full Control SharePoint hands the caller on a no-copy break, unless the
   * plan grants the caller that role (see `applySecurables`).
   */
  kind: "break" | "reset" | "revoke" | "grant";
  /** Absent for a break and a reset. */
  principal?: Principal;
  /** Absent for a break and a reset. */
  role?: string;
}

export type ApplyResult =
  | { ok: true; applied: number }
  | { ok: false; applied: number; message: string };

/** One securable and the operations that would converge it. */
export interface SecurablePlan {
  /** An entity is `item(entity)` sugar, exactly as on `permissions.for`. */
  resource: ResourceRef | IEntity;
  plan: readonly PlannedOperation[];
}

const nameOf = (p: Principal): string => p.Title ?? `#${p.Id}`;

/**
 * The securable's held state, or a loud refusal.
 *
 * `ISecurable`'s members are optional, so an entity read WITHOUT the securable expand would
 * otherwise diff as "inherits, holds nothing" — the worst silent default a diff engine could
 * have. The materializer always writes `[]` when the expand ran, so `undefined` reliably
 * means the snapshot was never loaded.
 */
function heldState(actual: ISecurable): {
  unique: boolean;
  held: RoleAssignment[];
} {
  if (actual.RoleAssignments === undefined) {
    throw new InvalidOperationException(
      "This securable's snapshot is not loaded — read it with .expand((x) => x.RoleAssignments) first.",
    );
  }
  return {
    unique: actual.HasUniqueRoleAssignments === true,
    held: asRoleAssignments(actual.RoleAssignments),
  };
}

/** Roles that count for comparison — everything SharePoint did not add on its own. */
const comparable = (a: RoleAssignment): string[] =>
  a.roles.filter((r) => !SYSTEM_ROLES.includes(r));

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((r) => b.includes(r));

/**
 * Compare one securable's held state with what the policy wants on it.
 *
 * Pure — the actual state arrives ON the securable (an entity carrying the snapshot, or any
 * structurally `ISecurable` object built from a raw read). `desired.inherits` is a claim
 * about inheritance alone; otherwise principals are compared by exact role SETS, with
 * `SYSTEM_ROLES` filtered from every side.
 */
export function diffSecurable(
  actual: ISecurable,
  desired: DesiredPermissions,
): SecurableReport {
  const { unique, held } = heldState(actual);
  const differences: SecurableDifference[] = [];

  if (desired.inherits) {
    if (unique) {
      differences.push({
        kind: "inheritance",
        detail:
          "Has unique permissions; the policy expects it to inherit from the site.",
      });
    }
    return {
      status: differences.length === 0 ? "matches" : "drift",
      unique,
      assignments: held,
      differences,
    };
  }

  if (!unique) {
    differences.push({
      kind: "inheritance",
      detail:
        "Inherits its permissions; the policy expects unique permissions.",
    });
  }

  const heldByPrincipal = new Map(held.map((a) => [a.member.Id, a]));
  const wantedIds = new Set(desired.assignments.map((a) => a.member.Id));

  for (const wanted of desired.assignments) {
    const has = heldByPrincipal.get(wanted.member.Id);
    const roles = has === undefined ? [] : comparable(has);
    if (roles.length === 0) {
      differences.push({
        kind: "missing",
        detail: `${nameOf(wanted.member)} should have ${wanted.roles.join(", ")}.`,
      });
    } else if (!sameSet(roles, wanted.roles)) {
      differences.push({
        kind: "wrong-role",
        detail: `${nameOf(wanted.member)} has ${roles.join(", ")}; the policy expects ${wanted.roles.join(", ")}.`,
      });
    }
  }

  for (const has of held) {
    if (wantedIds.has(has.member.Id)) continue;
    const roles = comparable(has);
    if (roles.length === 0) continue;
    differences.push({
      kind: "extra",
      detail: `${nameOf(has.member)} has ${roles.join(", ")}, which the policy does not grant.`,
    });
  }

  return {
    status: differences.length === 0 ? "matches" : "drift",
    unique,
    assignments: held,
    differences,
  };
}

/**
 * The exact operations an apply would stage, in order — what a confirmation dialog renders
 * is what runs. Pure, like the diff.
 *
 * An INHERITING securable plans a break plus the whole desired set: what its snapshot shows
 * is the parent's, and it dies with the break (`copyExisting: false`) — revoking any of it
 * would target assignments that no longer exist, and skipping a grant because inheritance
 * already provided the role would lose that access the moment the break lands. The caller's
 * automatic Full Control from the break is not planned here — the plan is pure and does not
 * know who the caller is — but the `break` op carries it: applying it removes that assignment.
 *
 * An already-UNIQUE securable reconciles by set difference: revokes before grants, and a
 * reset is never mixed with grants (the queue phase-orders resets last, which would discard
 * them).
 */
export function planOperations(
  actual: ISecurable,
  desired: DesiredPermissions,
): PlannedOperation[] {
  const { unique, held } = heldState(actual);

  if (desired.inherits) {
    return unique ? [{ kind: "reset" }] : [];
  }

  if (!unique) {
    return [
      { kind: "break" },
      ...desired.assignments.flatMap((wanted) =>
        wanted.roles.map((role): PlannedOperation => ({
          kind: "grant",
          principal: wanted.member,
          role,
        })),
      ),
    ];
  }

  const revokes: PlannedOperation[] = [];
  const grants: PlannedOperation[] = [];
  const heldByPrincipal = new Map(held.map((a) => [a.member.Id, a]));
  const wantedIds = new Set(desired.assignments.map((a) => a.member.Id));

  for (const wanted of desired.assignments) {
    const has = heldByPrincipal.get(wanted.member.Id);
    const roles = has === undefined ? [] : comparable(has);
    for (const role of roles.filter((r) => !wanted.roles.includes(r))) {
      revokes.push({ kind: "revoke", principal: wanted.member, role });
    }
    for (const role of wanted.roles.filter((r) => !roles.includes(r))) {
      grants.push({ kind: "grant", principal: wanted.member, role });
    }
  }

  for (const has of held) {
    if (wantedIds.has(has.member.Id)) continue;
    for (const role of comparable(has)) {
      revokes.push({ kind: "revoke", principal: has.member, role });
    }
  }

  return [...revokes, ...grants];
}

/**
 * SharePoint's `RoleTypeKind` for Full Control. The caller's automatic assignment is found by
 * type rather than by name, because the name is localised ("Contrôle total", …).
 */
const ADMINISTRATOR_ROLE_TYPE = 5;

/** Who SharePoint hands Full Control to on a no-copy break, and the role it hands them. */
interface AutomaticAssignment {
  caller: SiteUser;
  role: RoleDefinition;
}

/**
 * Resolved once per apply, and only when some plan breaks — BEFORE anything is sent, so a
 * site that cannot answer refuses the whole apply instead of half-applying it.
 */
async function automaticAssignment(
  identity: SpeelIdentity,
  batch: readonly SecurablePlan[],
): Promise<AutomaticAssignment | undefined> {
  if (!batch.some((e) => e.plan.some((op) => op.kind === "break"))) {
    return undefined;
  }
  const [caller, role] = await Promise.all([
    identity.users.me(),
    identity.roles.getByType(ADMINISTRATOR_ROLE_TYPE),
  ]);
  if (caller.Id === undefined) {
    throw new InvalidOperationException(
      "The current user has no Id, so the Full Control SharePoint gives them on a break cannot be revoked.",
    );
  }
  if (role === null) {
    throw new InvalidOperationException(
      "This site has no Full Control role definition, so the assignment SharePoint gives the caller on a break cannot be revoked.",
    );
  }
  return { caller, role };
}

/** Per-entry results of one save, attributing failures back by operation identity. */
async function saveAttributed(
  identity: SpeelIdentity,
  staged: readonly (readonly IdentityOperation[])[],
): Promise<{ applied: number; failed: number }[]> {
  try {
    await identity.saveChangesAsync();
    return staged.map((ops) => ({ applied: ops.length, failed: 0 }));
  } catch (err) {
    if (!(err instanceof IdentitySaveException)) throw err;
    const failed = new Set(err.failures.map((f) => f.operation));
    return staged.map((ops) => {
      const failures = ops.filter((op) => failed.has(op)).length;
      return { applied: ops.length - failures, failed: failures };
    });
  }
}

/**
 * Stage every securable's plan on the one queue and save once — plus, when any plan breaks
 * inheritance, one more save for what SharePoint did on its own.
 *
 * The queue already batches across resources ($batch chunks of up to 100), keeps each
 * resource's operations grouped and phase-ordered, and attributes failures per operation —
 * which is what makes one save honest per securable: the result array aligns with the
 * input, a securable with any failed operation reports `ok: false` with its partial count,
 * and its batchmates are unaffected. The save is still not atomic ACROSS securables;
 * SharePoint has no such transaction.
 *
 * A no-copy break is not the empty slate the plan assumes: SharePoint gives the CALLER an
 * explicit Full Control assignment, so nobody is locked out mid-way. Unless the plan grants
 * the caller that role, it is revoked — in a second save, because the queue orders revokes
 * before grants, and a caller whose only rights on the securable were that assignment could
 * grant nothing after losing it. A securable whose own operations did not all land keeps the
 * caller's assignment: the result already reports the failure, and leaving the caller able
 * to manage it is what lets a re-run (which then sees a unique securable and revokes the
 * caller as an extra) converge it.
 */
export async function applySecurables(
  identity: SpeelIdentity,
  batch: readonly SecurablePlan[],
): Promise<ApplyResult[]> {
  const automatic = await automaticAssignment(identity, batch);

  // Stage per entry, snapshotting which queue operations each entry appended so a failure
  // can be attributed back by operation identity.
  const staged: IdentityOperation[][] = [];
  for (const entry of batch) {
    const before = identity.pendingChanges.length;
    if (entry.plan.length > 0) {
      const perms = identity.permissions.for(entry.resource);
      for (const op of entry.plan) {
        if (op.kind === "break") {
          // copyExisting: false — the plan grants everything the policy wants, so copying
          // the parent would manufacture extras this same apply then revokes, and briefly
          // grant access the policy does not name.
          perms.breakInheritance({ copyExisting: false });
        } else if (op.kind === "reset") {
          perms.resetInheritance();
        } else if (op.kind === "revoke") {
          perms.revoke(op.principal as Principal, op.role as string);
        } else {
          perms.grant(op.principal as Principal, op.role as string);
        }
      }
    }
    staged.push([...identity.pendingChanges.slice(before)]);
  }

  if (staged.every((ops) => ops.length === 0)) {
    return batch.map(() => ({ ok: true, applied: 0 }));
  }

  const outcomes = await saveAttributed(identity, staged);

  if (automatic !== undefined) {
    const { caller, role } = automatic;
    const cleanup: IdentityOperation[][] = batch.map((entry, i) => {
      const breaks = entry.plan.some((op) => op.kind === "break");
      const wantsIt = entry.plan.some(
        (op) =>
          op.kind === "grant" &&
          op.principal?.Id === caller.Id &&
          op.role === role.Name,
      );
      if (!breaks || wantsIt || outcomes[i]!.failed > 0) return [];
      const before = identity.pendingChanges.length;
      identity.permissions.for(entry.resource).revoke(caller, role);
      return [...identity.pendingChanges.slice(before)];
    });
    if (cleanup.some((ops) => ops.length > 0)) {
      const cleaned = await saveAttributed(identity, cleanup);
      cleaned.forEach((c, i) => {
        outcomes[i]!.applied += c.applied;
        outcomes[i]!.failed += c.failed;
        staged[i]!.push(...cleanup[i]!);
      });
    }
  }

  return outcomes.map(({ applied, failed }, i) => {
    if (failed === 0) return { ok: true, applied };
    const total = staged[i]!.length;
    return {
      ok: false,
      applied,
      message:
        `${applied} of ${total} operations applied, ${failed} failed. ` +
        "You may not have permission to change permissions on this resource.",
    };
  });
}

/** One-securable convenience over `applySecurables`. */
export async function applySecurable(
  identity: SpeelIdentity,
  resource: ResourceRef | IEntity,
  plan: readonly PlannedOperation[],
): Promise<ApplyResult> {
  const [result] = await applySecurables(identity, [{ resource, plan }]);
  return result as ApplyResult;
}
