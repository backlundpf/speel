import { SaveAbortedException } from "@speel/core";
import type { IdentityDbContext } from "./IdentityDbContext.js";
import type { IIdentityOptions } from "./IdentityOptionsBuilder.js";
import type {
  IIdentityProvider,
  IdentityBatchOperation,
  IdentityBatchResult,
} from "./IIdentityProvider.js";
import type { GroupRef, PrincipalRef, RoleRef, UserRef } from "./refs.js";
import { AuthorizationService } from "./AuthorizationService.js";
import { GroupManager } from "./GroupManager.js";
import {
  IdentityChangeQueue,
  isResourceOperation,
  type IdentityOperation,
} from "./IdentityChangeQueue.js";
import {
  IdentitySaveException,
  type IdentityOperationFailure,
  type IdentitySaveResult,
} from "./errors.js";
import { PermissionManager } from "./PermissionManager.js";
import { PrincipalResolver } from "./PrincipalResolver.js";
import { ResourceResolver } from "./ResourceResolver.js";
import { resourceKey } from "./resources.js";
import { RoleDefinitionSet } from "./RoleDefinitionSet.js";
import { RoleManager } from "./RoleManager.js";
import { UserManager } from "./UserManager.js";
import {
  createEntityUserSettingsStore,
  type UserSettingsStore,
} from "./userSettingsStore.js";

export interface IIdentitySaveOptions {
  /** Operations per batch round trip. Default 100, matching core. 1 is the sequential escape hatch. */
  readonly maxBatchSize?: number;
  /**
   * Cooperative abort, checked before each batch. Fired requests complete; on abort every
   * operation that did not land is re-staged and `SaveAbortedException` is thrown.
   */
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_BATCH = 100;

function newToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function resultError(result: IdentityBatchResult | undefined): Error {
  if (result === undefined)
    return new Error("The provider returned no result for this operation.");
  if (result.kind === "failure") {
    const status =
      result.status !== undefined ? ` (HTTP ${result.status})` : "";
    return new Error(`${result.body ?? "Identity operation failed"}${status}`);
  }
  return new Error("Unexpected batch result.");
}

/**
 * Per-save resolution memo: each distinct reference resolves once, however many operations
 * name it. Values are promises so priming can start every lookup before anything is awaited;
 * the memo lives inside one save call, so nothing served from it can go stale across saves.
 */
class SaveResolutions {
  readonly #groupIds = new Map<unknown, Promise<number>>();
  readonly #userIds = new Map<unknown, Promise<number>>();
  readonly #userLogins = new Map<unknown, Promise<string>>();
  readonly #principalIds = new Map<unknown, Promise<number>>();
  readonly #roleIds = new Map<unknown, Promise<number>>();

  constructor(private readonly resolver: PrincipalResolver) {}

  groupId(ref: GroupRef): Promise<number> {
    return this.#memo(this.#groupIds, ref, () => this.resolver.groupId(ref));
  }
  userId(ref: UserRef | undefined): Promise<number> {
    return this.#memo(this.#userIds, ref, () => this.resolver.userId(ref));
  }
  userLogin(ref: UserRef | undefined): Promise<string> {
    return this.#memo(this.#userLogins, ref, () =>
      this.resolver.userLogin(ref),
    );
  }
  principalId(ref: PrincipalRef): Promise<number> {
    return this.#memo(this.#principalIds, ref, () =>
      this.resolver.principalId(ref),
    );
  }
  roleDefinitionId(ref: RoleRef): Promise<number> {
    return this.#memo(this.#roleIds, ref, () =>
      this.resolver.roleDefinitionId(ref),
    );
  }

  /** Settles every started lookup, so a rejection awaited later is already handled. */
  async settle(): Promise<void> {
    await Promise.allSettled([
      ...this.#groupIds.values(),
      ...this.#userIds.values(),
      ...this.#userLogins.values(),
      ...this.#principalIds.values(),
      ...this.#roleIds.values(),
    ]);
  }

  #memo<K, V>(
    map: Map<K, Promise<V>>,
    key: K,
    make: () => Promise<V>,
  ): Promise<V> {
    let p = map.get(key);
    if (p === undefined) {
      p = make();
      map.set(key, p);
    }
    return p;
  }
}

/**
 * The identity surface: who the user is, and — through the services hung off it — what they
 * belong to and what roles exist. A sibling of the `IdentityDbContext`, sharing its web and its
 * provider's site, but with its own lifetime.
 *
 * Every mutation across every service stages on one queue and reaches the wire only through
 * `saveChangesAsync`. One rule for the whole package beats a rule that changes per service.
 */
export class SpeelIdentity {
  readonly users: UserManager;
  readonly groups: GroupManager;
  readonly roles: RoleManager;
  readonly permissions: PermissionManager;
  readonly authorization: AuthorizationService;
  /** This user's own preferences. Requires a context extending `IdentityDbContext`. */
  readonly settings: UserSettingsStore;

  readonly #provider: IIdentityProvider;
  readonly #resolver: PrincipalResolver;
  readonly #resources: ResourceResolver;
  readonly #queue = new IdentityChangeQueue();

  constructor(db: IdentityDbContext, options: IIdentityOptions) {
    this.#provider = options.provider;
    this.users = new UserManager(db, options.provider);
    // One catalogue, shared: the resolver needs role ids for grants and the role manager
    // fronts the same cache, so both read the one set.
    const roleDefinitions = new RoleDefinitionSet(options.provider);
    // One resolver, shared: it caches nothing itself but reaches the user manager's cached
    // current user, so every service answers "me" from the same round trip.
    this.#resolver = new PrincipalResolver(db, this.users, roleDefinitions);
    this.#resources = new ResourceResolver(db);
    this.groups = new GroupManager(
      db,
      options.provider,
      this.#resolver,
      this.#queue,
    );
    this.roles = new RoleManager(
      roleDefinitions,
      options.provider,
      this.#resolver,
    );
    this.permissions = new PermissionManager(
      options.provider,
      this.#resources,
      this.#queue,
    );
    this.authorization = new AuthorizationService(
      options.provider,
      this.#resources,
      this.#resolver,
      this.groups,
      options.policies,
    );
    this.settings = options.settings ?? createEntityUserSettingsStore(db);
  }

  get hasChanges(): boolean {
    return this.#queue.hasChanges;
  }

  /** What is staged but not yet applied, in staging order. */
  get pendingChanges(): readonly IdentityOperation[] {
    return this.#queue.pending;
  }

  /**
   * Applies staged work in batches: operations are grouped by resource and phase-ordered
   * first (see `#order`), every distinct reference is resolved once, and the wire-ready
   * operations go to the provider `maxBatchSize` at a time. Chunks run sequentially and a
   * batch executes in order, so the ordering guarantees are exactly the sequential ones —
   * groups run in the order they were first touched, not every operation in staging order.
   *
   * The queue is emptied whether or not everything succeeded: SharePoint offers no transaction
   * across securables, so a part-applied save is a real outcome, and re-running the whole batch
   * on retry would repeat what already landed. A caller that wants the failures retried
   * re-stages them from `IdentitySaveException.failures`. The exception is an abort, which is
   * a cancellation rather than an outcome: everything that did not land goes back on the queue.
   */
  async saveChangesAsync(
    options: IIdentitySaveOptions = {},
  ): Promise<IdentitySaveResult> {
    const maxBatchSize = Math.max(1, options.maxBatchSize ?? DEFAULT_MAX_BATCH);
    const signal = options.signal;
    if (signal?.aborted) throw new SaveAbortedException();

    const taken = this.#queue.takeAll();
    const failures: IdentityOperationFailure[] = [];
    const ordered = this.#order(taken, failures);

    // Start every distinct lookup, then settle, so resolution is concurrent and deduped and
    // no rejection is left dangling for the per-op await below to trip over as "unhandled".
    const resolutions = new SaveResolutions(this.#resolver);
    for (const op of ordered) this.#prime(op, resolutions);
    await resolutions.settle();

    const pending: {
      operation: IdentityOperation;
      batchOp: IdentityBatchOperation;
    }[] = [];
    for (const op of ordered) {
      try {
        pending.push({
          operation: op,
          batchOp: await this.#toBatchOp(op, resolutions),
        });
      } catch (e) {
        failures.push({
          operation: op,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }

    const appliedOps = new Set<IdentityOperation>();
    for (let i = 0; i < pending.length; i += maxBatchSize) {
      if (signal?.aborted) {
        this.#queue.restore(taken.filter((op) => !appliedOps.has(op)));
        throw new SaveAbortedException();
      }
      const chunk = pending.slice(i, i + maxBatchSize);
      const results = await this.#provider.executeBatchAsync(
        chunk.map((p) => p.batchOp),
      );
      const byToken = new Map(results.map((r) => [r.clientToken, r]));
      for (const p of chunk) {
        const result = byToken.get(p.batchOp.clientToken);
        if (result?.kind === "success") {
          appliedOps.add(p.operation);
        } else {
          failures.push({ operation: p.operation, error: resultError(result) });
        }
      }
    }
    const applied = appliedOps.size;

    // The save has just changed what the cached masks say; serving the old answers back is
    // worse than the round trip to fetch them again.
    if (applied > 0) this.authorization.clearCache();

    if (failures.length > 0) throw new IdentitySaveException(applied, failures);
    return { applied };
  }

  /** Kicks off the memoized lookups an operation will need, without awaiting any of them. */
  #prime(op: IdentityOperation, resolutions: SaveResolutions): void {
    switch (op.op) {
      case "addGroupMember":
        void resolutions.groupId(op.group);
        void resolutions.userLogin(op.user);
        return;
      case "removeGroupMember":
        void resolutions.groupId(op.group);
        void resolutions.userId(op.user);
        return;
      case "grant":
      case "revoke":
        void resolutions.principalId(op.principal);
        void resolutions.roleDefinitionId(op.role);
        return;
      case "breakInheritance":
      case "resetInheritance":
        return; // resources resolve synchronously, in #toBatchOp
    }
  }

  async #toBatchOp(
    op: IdentityOperation,
    resolutions: SaveResolutions,
  ): Promise<IdentityBatchOperation> {
    const clientToken = newToken();
    switch (op.op) {
      case "addGroupMember": {
        // Adding takes a login name and removing takes an id: SharePoint's own asymmetry,
        // absorbed here rather than pushed onto the caller.
        const [groupId, loginName] = await Promise.all([
          resolutions.groupId(op.group),
          resolutions.userLogin(op.user),
        ]);
        return { kind: "addGroupMember", groupId, loginName, clientToken };
      }
      case "removeGroupMember": {
        const [groupId, userId] = await Promise.all([
          resolutions.groupId(op.group),
          resolutions.userId(op.user),
        ]);
        return { kind: "removeGroupMember", groupId, userId, clientToken };
      }
      case "breakInheritance":
        return {
          kind: "breakInheritance",
          resource: this.#resources.resolve(op.resource),
          copyExisting: op.copyExisting,
          clearSubscopes: op.clearSubscopes,
          clientToken,
        };
      case "resetInheritance":
        return {
          kind: "resetInheritance",
          resource: this.#resources.resolve(op.resource),
          clientToken,
        };
      case "grant":
      case "revoke": {
        const [principalId, roleDefinitionId] = await Promise.all([
          resolutions.principalId(op.principal),
          resolutions.roleDefinitionId(op.role),
        ]);
        return {
          kind: op.op,
          resource: this.#resources.resolve(op.resource),
          principalId,
          roleDefinitionId,
          clientToken,
        };
      }
    }
  }

  /**
   * Groups the staged work by resource and orders each group by phase.
   *
   * The phase order is the point: a grant applied while its resource still inherits does not
   * fail — it edits the *parent's* assignments, which is the orphaning this staging model
   * exists to prevent. So breaking inheritance goes first, and resetting it goes *last*, even
   * though the two are opposites: reset returns the resource to inheriting, so anything after
   * it would land on the parent. Revokes precede grants so that re-granting a role someone
   * already holds in another form settles the way it was written.
   *
   * Staging both a reset and a grant on one resource is incoherent whatever the order — the
   * reset discards what the grant just made. Reset-last at least makes that visible instead of
   * quietly rewriting the parent's assignments.
   *
   * Groups run in the order they were first touched, so the sequence still reads like the
   * calling code. Operations that name no resource — group membership — each get their own
   * group, which preserves their relative order and lets them interleave with resource work.
   *
   * A resource that cannot be resolved fails here, before anything is sent, and is reported
   * like any other failed operation rather than abandoning the save.
   */
  #order(
    ops: IdentityOperation[],
    failures: IdentityOperationFailure[],
  ): IdentityOperation[] {
    const PHASE: Record<string, number> = {
      breakInheritance: 0,
      revoke: 1,
      grant: 2,
      resetInheritance: 3,
    };
    const entries: { op: IdentityOperation; group: number; phase: number }[] =
      [];
    const groups = new Map<string, number>();
    const groupIndex = (key: string): number => {
      let index = groups.get(key);
      if (index === undefined) {
        index = groups.size;
        groups.set(key, index);
      }
      return index;
    };

    ops.forEach((op, i) => {
      if (!isResourceOperation(op)) {
        entries.push({ op, group: groupIndex(`membership:${i}`), phase: 0 });
        return;
      }
      try {
        const key = resourceKey(this.#resources.resolve(op.resource));
        entries.push({ op, group: groupIndex(key), phase: PHASE[op.op] ?? 0 });
      } catch (e) {
        failures.push({
          operation: op,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    });

    // Stable by construction: Array.prototype.sort is stable, so equal keys keep staging order.
    return entries
      .sort((a, b) => a.group - b.group || a.phase - b.phase)
      .map((e) => e.op);
  }
}
