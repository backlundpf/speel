import { InvalidOperationException } from "@speel/core";
import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { PermissionKind } from "./PermissionKind.js";
import type { RoleDefinition } from "./permissionTypes.js";
import type { PrincipalResolver } from "./PrincipalResolver.js";
import type { RoleRef } from "./refs.js";
import type { RoleDefinitionSet } from "./RoleDefinitionSet.js";

/**
 * What to change on a level: either the whole permission set or a delta, never both.
 * The union is what makes the second form a compile error; `update` re-checks at runtime,
 * because a cast can always reach past a type.
 */
export type RoleUpdate = {
  name?: string;
  description?: string;
  order?: number;
} & (
  | { permissions?: readonly PermissionKind[]; add?: never; remove?: never }
  | {
      permissions?: never;
      add?: readonly PermissionKind[];
      remove?: readonly PermissionKind[];
    }
);

/**
 * The role-definition catalogue — "Read", "Contribute", "Full Control" — the ids a grant
 * needs, and the four verbs that provision levels of your own. `RoleDefinitionSet` caches
 * the catalogue (it is web-scoped and effectively static), so this is a front door rather
 * than a second cache; every write folds its result back into it.
 *
 * The writes are immediate, not staged, for the reason `groups.create` is: a caller that
 * provisions a level needs its id, and `saveChangesAsync` returns a tally, not entities.
 */
export class RoleManager {
  constructor(
    private readonly roleDefinitions: RoleDefinitionSet,
    private readonly provider: IIdentityProvider,
    private readonly resolver: PrincipalResolver,
  ) {}

  getByName(name: string): Promise<RoleDefinition | null> {
    return this.roleDefinitions.getByNameAsync(name);
  }
  getById(id: number): Promise<RoleDefinition | null> {
    return this.roleDefinitions.getByIdAsync(id);
  }
  getByType(roleTypeKind: number): Promise<RoleDefinition | null> {
    return this.roleDefinitions.getByTypeAsync(roleTypeKind);
  }
  allByName(): Promise<Map<string, RoleDefinition>> {
    return this.roleDefinitions.getAllByNameAsync();
  }

  /**
   * Provision a permission level from a list of permissions.
   *
   * Not "ensure": a duplicate name is an error, exactly as it is for a group. A caller who
   * wants friendlier handling calls `getByName` first.
   */
  async create(
    name: string,
    opts: {
      description?: string;
      order?: number;
      permissions: readonly PermissionKind[];
    },
  ): Promise<RoleDefinition> {
    return this.roleDefinitions.absorb(
      await this.provider.createRoleDefinitionAsync({ name, ...opts }),
    );
  }

  /**
   * Provision a level carrying another's permissions, adjusted by `add`/`remove`.
   *
   * The source's mask is read on the provider's side of the seam, so identity never holds
   * one. Cloning a built-in is the ordinary case — "Contribute plus manage permissions".
   */
  async clone(
    source: RoleRef,
    name: string,
    opts: {
      description?: string;
      order?: number;
      add?: readonly PermissionKind[];
      remove?: readonly PermissionKind[];
    } = {},
  ): Promise<RoleDefinition> {
    const sourceId = await this.resolver.roleDefinitionId(source);
    return this.roleDefinitions.absorb(
      await this.provider.cloneRoleDefinitionAsync(sourceId, { name, ...opts }),
    );
  }

  /** Change a level you provisioned. Returns it as it stands afterwards. */
  async update(role: RoleRef, changes: RoleUpdate): Promise<RoleDefinition> {
    if (
      changes.permissions !== undefined &&
      (changes.add !== undefined || changes.remove !== undefined)
    ) {
      throw new InvalidOperationException(
        "roles.update: pass permissions (the whole set) or add/remove (a delta), not both.",
      );
    }
    const id = await this.#customLevelId(role, "update");
    return this.roleDefinitions.absorb(
      await this.provider.updateRoleDefinitionAsync(id, changes),
    );
  }

  /** Remove a level you provisioned. SharePoint drops the assignments that named it. */
  async delete(role: RoleRef): Promise<void> {
    const id = await this.#customLevelId(role, "delete");
    await this.provider.deleteRoleDefinitionAsync(id);
    this.roleDefinitions.forget(id);
  }

  /** Drop the cached catalogue; the next lookup refetches. */
  clearCache(): void {
    this.roleDefinitions.clearCache();
  }

  /**
   * Resolve a ref to a level this package will write to. SharePoint's own levels
   * (`RoleTypeKind` other than 0) are refused: re-permissioning or deleting "Full Control"
   * is irreversible site damage and never what a provisioning app means.
   */
  async #customLevelId(role: RoleRef, verb: string): Promise<number> {
    const id = await this.resolver.roleDefinitionId(role);
    const definition = await this.roleDefinitions.getByIdAsync(id);
    if (definition === null) {
      throw new InvalidOperationException(
        `roles.${verb}: no role definition with id ${id}.`,
      );
    }
    if (
      definition.RoleTypeKind !== undefined &&
      definition.RoleTypeKind !== 0
    ) {
      throw new InvalidOperationException(
        `roles.${verb}: '${definition.Name ?? id}' is a built-in level; clone it into a custom level instead.`,
      );
    }
    return id;
  }
}
