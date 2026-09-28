import type { BasePermissions } from "../permissionTypes.js";
import type {
  IIdentityProvider,
  IdentityBatchOperation,
  IdentityBatchResult,
  RoleDefinitionSpec,
  RoleDefinitionCloneSpec,
  RoleDefinitionChanges,
} from "../IIdentityProvider.js";
import type { PermissionKind } from "../PermissionKind.js";
import { resourceKey, type ResolvedResource } from "../resources.js";

type Rec = Record<string, unknown>;

/**
 * An in-memory `IIdentityProvider`. `calls` records the mutations, which is what lets a test
 * assert that staged work reached the wire — and, before a save, that it did not. `reads`
 * records effective-permission fetches separately, so asserting the cache does not disturb
 * assertions about mutation ordering.
 *
 * Permissions are modelled as **names, not bits**. A fake that reimplemented the mask
 * encoding would agree with itself and pass while the real encoding was wrong; here the
 * mask is an opaque token and `hasPermission` looks up what was seeded against it.
 */
export class FakeIdentityProvider implements IIdentityProvider {
  readonly calls: string[] = [];
  readonly reads: string[] = [];
  /** Op count per executeBatchAsync call, so tests can assert chunking without disturbing `calls`. */
  readonly batches: number[] = [];

  readonly #granted = new Map<string, Set<PermissionKind>>();
  readonly #masks = new Map<string, BasePermissions>();
  readonly #maskKinds = new WeakMap<BasePermissions, Set<PermissionKind>>();
  readonly #assignments = new Map<string, Rec[]>();
  #currentUser: Rec = {
    Id: 1,
    Title: "Test User",
    LoginName: "i:0#.f|membership|test@x.com",
  };
  readonly #users = new Map<number, Rec>();
  readonly #groups = new Map<number, Rec>();
  readonly #membership = new Map<number, Set<number>>(); // groupId -> userIds

  setCurrentUser(rec: Rec): void {
    this.#currentUser = rec;
    if (typeof rec.Id === "number") this.#users.set(rec.Id, rec);
  }

  #associated: { owners?: Rec; members?: Rec; visitors?: Rec } = {};

  /** Defaults to none, so a test that does not care is unaffected. */
  seedAssociatedGroups(groups: {
    owners?: Rec;
    members?: Rec;
    visitors?: Rec;
  }): void {
    this.#associated = groups;
  }

  seedUser(rec: Rec): void {
    this.#users.set(rec.Id as number, rec);
  }
  seedGroup(rec: Rec): void {
    this.#groups.set(rec.Id as number, rec);
  }

  seedMembership(groupId: number, userId: number): void {
    const set = this.#membership.get(groupId) ?? new Set<number>();
    set.add(userId);
    this.#membership.set(groupId, set);
  }

  getCurrentUserAsync(): Promise<Rec> {
    return Promise.resolve(this.#currentUser);
  }

  ensureUserAsync(loginName: string): Promise<Rec> {
    this.calls.push("ensureUserAsync");
    const existing = [...this.#users.values()].find(
      (u) => u.LoginName === loginName,
    );
    if (existing) return Promise.resolve(existing);
    const id = Math.max(0, ...this.#users.keys()) + 1;
    const created: Rec = {
      Id: id,
      Title: loginName,
      LoginName: loginName,
      PrincipalType: 1,
    };
    this.#users.set(id, created);
    return Promise.resolve(created);
  }

  getGroupMembersAsync(groupId: number): Promise<Rec[]> {
    const ids = [...(this.#membership.get(groupId) ?? [])];
    return Promise.resolve(
      ids
        .map((id) => this.#users.get(id))
        .filter((u): u is Rec => u !== undefined),
    );
  }

  getUserGroupsAsync(userId: number): Promise<Rec[]> {
    const out: Rec[] = [];
    for (const [groupId, members] of this.#membership) {
      const group = this.#groups.get(groupId);
      if (group !== undefined && members.has(userId)) out.push(group);
    }
    return Promise.resolve(out);
  }

  getGroupsWithMembersAsync(): Promise<Rec[]> {
    return Promise.resolve(
      [...this.#groups.values()].map((group) => ({
        ...group,
        Users: [...(this.#membership.get(group.Id as number) ?? [])]
          .map((id) => this.#users.get(id))
          .filter((u): u is Rec => u !== undefined),
      })),
    );
  }

  getAssociatedGroupsAsync(): Promise<{
    owners?: Rec | null;
    members?: Rec | null;
    visitors?: Rec | null;
  }> {
    return Promise.resolve({
      owners: this.#associated.owners ?? null,
      members: this.#associated.members ?? null,
      visitors: this.#associated.visitors ?? null,
    });
  }

  createGroupAsync(title: string, description?: string): Promise<Rec> {
    this.calls.push(`createGroup:${title}`);
    const clash = [...this.#groups.values()].some((g) => g.Title === title);
    if (clash) {
      return Promise.reject(
        new Error(`A group named '${title}' already exists.`),
      );
    }
    const id = Math.max(0, ...[...this.#groups.keys()]) + 1;
    const rec: Rec = { Id: id, Title: title };
    if (description !== undefined) rec.Description = description;
    this.#groups.set(id, rec);
    return Promise.resolve(rec);
  }

  executeBatchAsync(
    ops: readonly IdentityBatchOperation[],
  ): Promise<readonly IdentityBatchResult[]> {
    this.batches.push(ops.length);
    return Promise.resolve(ops.map((op) => this.#applyBatchOp(op)));
  }

  /** One op at a time, pushing the SAME `calls` strings the per-op methods always did. */
  #applyBatchOp(op: IdentityBatchOperation): IdentityBatchResult {
    const { clientToken } = op;
    switch (op.kind) {
      case "addGroupMember": {
        this.calls.push(`addGroupMember:${op.groupId}:${op.loginName}`);
        const user = [...this.#users.values()].find(
          (u) => u.LoginName === op.loginName,
        );
        if (user === undefined) {
          return {
            kind: "failure",
            clientToken,
            status: 404,
            body: `No seeded user with login '${op.loginName}'.`,
          };
        }
        this.seedMembership(op.groupId, user.Id as number);
        return { kind: "success", clientToken };
      }
      case "removeGroupMember":
        this.calls.push(`removeGroupMember:${op.groupId}:${op.userId}`);
        this.#membership.get(op.groupId)?.delete(op.userId);
        return { kind: "success", clientToken };
      case "breakInheritance":
        this.calls.push(
          `breakInheritance:${resourceKey(op.resource)}:${op.copyExisting}:${op.clearSubscopes}`,
        );
        return { kind: "success", clientToken };
      case "resetInheritance":
        this.calls.push(`resetInheritance:${resourceKey(op.resource)}`);
        return { kind: "success", clientToken };
      case "grant":
        this.calls.push(
          `addRole:${resourceKey(op.resource)}:${op.principalId}:${op.roleDefinitionId}`,
        );
        return { kind: "success", clientToken };
      case "revoke":
        this.calls.push(
          `removeRole:${resourceKey(op.resource)}:${op.principalId}:${op.roleDefinitionId}`,
        );
        return { kind: "success", clientToken };
    }
  }

  searchPrincipalsAsync(query: string, maxResults: number): Promise<Rec[]> {
    const q = query.toLowerCase();
    const hit = (v: unknown): boolean =>
      typeof v === "string" && v.toLowerCase().includes(q);
    return Promise.resolve(
      [...this.#users.values()]
        .filter((u) => hit(u.Title) || hit(u.LoginName))
        .slice(0, maxResults),
    );
  }

  // ---- permissions -------------------------------------------------------------------

  /** Omit `loginName` to grant the kinds to everyone who asks about this resource. */
  seedPermissions(
    resource: ResolvedResource,
    kinds: readonly PermissionKind[],
    loginName = "*",
  ): void {
    this.#granted.set(`${resourceKey(resource)}|${loginName}`, new Set(kinds));
  }

  seedRoleAssignments(resource: ResolvedResource, assignments: Rec[]): void {
    this.#assignments.set(resourceKey(resource), assignments);
  }

  readonly #roleDefsById = new Map<number, Rec>();
  readonly #roleKinds = new Map<number, Set<PermissionKind>>();

  /**
   * Seed a role definition resolvable via identity.roles / role-name refs. `kinds` is what
   * the level permits — names, never bits, for the reason the class comment gives.
   */
  seedRoleDefinition(
    rd: Rec & { Id: number },
    kinds: readonly PermissionKind[] = [],
  ): void {
    this.#roleDefsById.set(rd.Id, { ...rd });
    this.#roleKinds.set(rd.Id, new Set(kinds));
  }

  /** Test hook: what a level permits, as names. */
  roleKinds(id: number): PermissionKind[] {
    return [...(this.#roleKinds.get(id) ?? [])];
  }

  #addRoleDefinition(
    name: string,
    kinds: Set<PermissionKind>,
    extras: { description?: string; order?: number },
  ): Rec {
    const id = Math.max(1073741900, ...this.#roleDefsById.keys()) + 1;
    const rec: Rec = { Id: id, Name: name, RoleTypeKind: 0 };
    if (extras.description !== undefined) rec.Description = extras.description;
    if (extras.order !== undefined) rec.Order = extras.order;
    this.#roleDefsById.set(id, rec);
    this.#roleKinds.set(id, kinds);
    return { ...rec };
  }

  createRoleDefinitionAsync(spec: RoleDefinitionSpec): Promise<Rec> {
    this.calls.push(`createRole:${spec.name}`);
    if ([...this.#roleDefsById.values()].some((r) => r.Name === spec.name)) {
      return Promise.reject(
        new Error(`A role definition named '${spec.name}' already exists.`),
      );
    }
    return Promise.resolve(
      this.#addRoleDefinition(spec.name, new Set(spec.permissions), spec),
    );
  }

  cloneRoleDefinitionAsync(
    sourceId: number,
    spec: RoleDefinitionCloneSpec,
  ): Promise<Rec> {
    this.calls.push(`cloneRole:${sourceId}:${spec.name}`);
    if (!this.#roleDefsById.has(sourceId)) {
      return Promise.reject(
        new Error(`No role definition with id ${sourceId}.`),
      );
    }
    if ([...this.#roleDefsById.values()].some((r) => r.Name === spec.name)) {
      return Promise.reject(
        new Error(`A role definition named '${spec.name}' already exists.`),
      );
    }
    const kinds = new Set(this.#roleKinds.get(sourceId) ?? []);
    for (const k of spec.add ?? []) kinds.add(k);
    for (const k of spec.remove ?? []) kinds.delete(k);
    return Promise.resolve(this.#addRoleDefinition(spec.name, kinds, spec));
  }

  updateRoleDefinitionAsync(
    id: number,
    changes: RoleDefinitionChanges,
  ): Promise<Rec> {
    this.calls.push(`updateRole:${id}`);
    const rec = this.#roleDefsById.get(id);
    if (!rec) {
      return Promise.reject(new Error(`No role definition with id ${id}.`));
    }
    if (changes.name !== undefined) rec.Name = changes.name;
    if (changes.description !== undefined)
      rec.Description = changes.description;
    if (changes.order !== undefined) rec.Order = changes.order;
    if (changes.permissions !== undefined) {
      this.#roleKinds.set(id, new Set(changes.permissions));
    } else if (changes.add !== undefined || changes.remove !== undefined) {
      const kinds = new Set(this.#roleKinds.get(id) ?? []);
      for (const k of changes.add ?? []) kinds.add(k);
      for (const k of changes.remove ?? []) kinds.delete(k);
      this.#roleKinds.set(id, kinds);
    }
    return Promise.resolve({ ...rec });
  }

  deleteRoleDefinitionAsync(id: number): Promise<void> {
    this.calls.push(`deleteRole:${id}`);
    this.#roleDefsById.delete(id);
    this.#roleKinds.delete(id);
    return Promise.resolve();
  }

  getRoleDefinitionsAsync(): Promise<Rec[]> {
    return Promise.resolve(
      [...this.#roleDefsById.values()].map((r) => ({ ...r })),
    );
  }

  getEffectivePermissionsAsync(
    resource: ResolvedResource,
    loginName?: string,
  ): Promise<BasePermissions> {
    const key = resourceKey(resource);
    this.reads.push(`${key}|${loginName ?? ""}`);
    const exact = this.#granted.get(`${key}|${loginName ?? "*"}`);
    const kinds =
      exact ?? this.#granted.get(`${key}|*`) ?? new Set<PermissionKind>();

    // A stable token per resource-and-user: identity holds onto it, and hasPermission
    // recognises it by identity rather than by decoding anything.
    const maskKey = `${key}|${loginName ?? "*"}`;
    let mask = this.#masks.get(maskKey);
    if (mask === undefined) {
      mask = { High: 0, Low: 0 };
      this.#masks.set(maskKey, mask);
    }
    this.#maskKinds.set(mask, kinds);
    return Promise.resolve(mask);
  }

  hasPermission(mask: BasePermissions, kind: PermissionKind): boolean {
    return this.#maskKinds.get(mask)?.has(kind) ?? false;
  }

  getRoleAssignmentsAsync(resource: ResolvedResource): Promise<Rec[]> {
    return Promise.resolve(this.#assignments.get(resourceKey(resource)) ?? []);
  }
}
