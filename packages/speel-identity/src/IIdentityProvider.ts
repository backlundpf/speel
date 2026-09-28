import type { BasePermissions } from "./permissionTypes.js";
import type { PermissionKind } from "./PermissionKind.js";
import type { ResolvedResource } from "./resources.js";

/**
 * What SharePoint exposes and speel's storage provider does not.
 *
 * Listing site users and groups is a read of the `IdentityDbContext`'s sets — the storage
 * provider serves those as provider sources — so this seam holds what is left: the current
 * user, provisioning a user, membership, role definitions, directory search, permissions.
 *
 * Every method returns raw records, which identity maps into its principal types.
 * Implementations normalise search results into the same shape as the rest
 * (`Id`/`Title`/`LoginName`/`Email`/`PrincipalType`), because the people-picker endpoint
 * returns something quite unlike a site-user read.
 */
/**
 * A wire-ready mutation: every reference is already an id, login, or resolved resource,
 * and the token is how a result names the operation it answers.
 */
export type IdentityBatchOperation =
  | {
      readonly kind: "addGroupMember";
      readonly groupId: number;
      readonly loginName: string;
      readonly clientToken: string;
    }
  | {
      readonly kind: "removeGroupMember";
      readonly groupId: number;
      readonly userId: number;
      readonly clientToken: string;
    }
  | {
      readonly kind: "breakInheritance";
      readonly resource: ResolvedResource;
      readonly copyExisting: boolean;
      readonly clearSubscopes: boolean;
      readonly clientToken: string;
    }
  | {
      readonly kind: "resetInheritance";
      readonly resource: ResolvedResource;
      readonly clientToken: string;
    }
  | {
      readonly kind: "grant";
      readonly resource: ResolvedResource;
      readonly principalId: number;
      readonly roleDefinitionId: number;
      readonly clientToken: string;
    }
  | {
      readonly kind: "revoke";
      readonly resource: ResolvedResource;
      readonly principalId: number;
      readonly roleDefinitionId: number;
      readonly clientToken: string;
    };

/** No serverData variant: every identity mutation returns void, so success carries only the token. */
export type IdentityBatchResult =
  | { readonly kind: "success"; readonly clientToken: string }
  | {
      readonly kind: "failure";
      readonly clientToken: string;
      readonly status?: number;
      readonly body?: string;
    };

/** Raw records for the web's associated groups; a key is absent or null when the web has none. */
export interface AssociatedGroupRecords {
  owners?: Record<string, unknown> | null;
  members?: Record<string, unknown> | null;
  visitors?: Record<string, unknown> | null;
}

/** A permission level to create: its name, its display extras, and what it permits. */
export interface RoleDefinitionSpec {
  name: string;
  description?: string;
  order?: number;
  permissions: readonly PermissionKind[];
}

/** A level to create from another's mask, with the difference expressed in names. */
export interface RoleDefinitionCloneSpec {
  name: string;
  description?: string;
  order?: number;
  add?: readonly PermissionKind[];
  remove?: readonly PermissionKind[];
}

/**
 * What to change on a level. `permissions` replaces the whole set; `add`/`remove` adjust
 * what is there. Identity refuses a caller that passes both before the call is made — the
 * two have no combined meaning — so an implementation may treat them as exclusive.
 */
export interface RoleDefinitionChanges {
  name?: string;
  description?: string;
  order?: number;
  permissions?: readonly PermissionKind[];
  add?: readonly PermissionKind[];
  remove?: readonly PermissionKind[];
}

export interface IIdentityProvider {
  getCurrentUserAsync(): Promise<Record<string, unknown>>;

  /**
   * Resolve a login to the site's user record, provisioning it when the person has
   * never visited. Returns the record in model spelling (`Id`, `Title`, `LoginName`,
   * `Email`, `PrincipalType`). Immediate, not staged: the caller needs the id.
   */
  ensureUserAsync(loginName: string): Promise<Record<string, unknown>>;
  getGroupMembersAsync(groupId: number): Promise<Record<string, unknown>[]>;
  getUserGroupsAsync(userId: number): Promise<Record<string, unknown>[]>;

  /**
   * Every site group with its members, in one round trip. SharePoint answers this as a single
   * expanded read, and a permissions screen that would otherwise issue one call per group is
   * exactly what it is for. Each record is a group record carrying a `Users` array.
   */
  getGroupsWithMembersAsync(): Promise<Record<string, unknown>[]>;

  /**
   * Create a site group and return its record. Immediate rather than staged: the caller needs
   * the new id to reference it, and a staged operation has nothing to hand back.
   */
  createGroupAsync(
    title: string,
    description?: string,
  ): Promise<Record<string, unknown>>;

  /**
   * The web's Owners, Members, and Visitors groups. Each may be absent: some templates never
   * create a visitor group, and an administrator can clear one. One call, because the caller
   * that wants any of them almost always wants the set.
   */
  getAssociatedGroupsAsync(): Promise<AssociatedGroupRecords>;

  /**
   * The web's role definitions ("Read", "Contribute", …). Effectively static per web;
   * `RoleDefinitionSet` caches the full catalogue on first read.
   */
  getRoleDefinitionsAsync(): Promise<Record<string, unknown>[]>;

  /**
   * Provision a permission level. Immediate rather than staged, like `createGroupAsync`:
   * the caller needs the new id, and a staged operation has nothing to hand back.
   *
   * Permissions cross this seam as names. Composing SharePoint's 64-bit mask is the
   * implementation's business, which is what keeps identity free of bit arithmetic.
   */
  createRoleDefinitionAsync(
    spec: RoleDefinitionSpec,
  ): Promise<Record<string, unknown>>;

  /** Create a level carrying `sourceId`'s permissions, adjusted by `add`/`remove`. */
  cloneRoleDefinitionAsync(
    sourceId: number,
    spec: RoleDefinitionCloneSpec,
  ): Promise<Record<string, unknown>>;

  /** Change a level; returns it as it stands afterwards. */
  updateRoleDefinitionAsync(
    id: number,
    changes: RoleDefinitionChanges,
  ): Promise<Record<string, unknown>>;

  /** Remove a level. SharePoint drops the assignments that named it. */
  deleteRoleDefinitionAsync(id: number): Promise<void>;

  searchPrincipalsAsync(
    query: string,
    maxResults: number,
  ): Promise<Record<string, unknown>[]>;

  /**
   * The whole mask in one call rather than an answer per kind: a page that asks four questions
   * about one list should cost one round trip, and a permissions panel wants the mask anyway.
   * Omitting `loginName` means the current user.
   */
  getEffectivePermissionsAsync(
    resource: ResolvedResource,
    loginName?: string,
  ): Promise<BasePermissions>;

  /**
   * Test a mask. Synchronous and pure, and on the seam rather than in identity because the
   * encoding is the provider's business — the SharePoint implementation delegates to PnP's
   * own helper rather than reimplementing 64-bit arithmetic for the test. Composing a mask,
   * which the role-definition writes need, has no PnP helper and is the implementation's
   * own; identity still never sees one.
   */
  hasPermission(mask: BasePermissions, kind: PermissionKind): boolean;

  /** Who holds which roles here, for surfaces that display it. */
  getRoleAssignmentsAsync(
    resource: ResolvedResource,
  ): Promise<Record<string, unknown>[]>;

  /**
   * Applies wire-ready mutations, as few round trips as the transport allows, executing them
   * in array order. One result per op, correlated by token; a failed op is a `failure`
   * result, never a rejection, so one bad grant cannot hide the fate of the rest.
   */
  executeBatchAsync(
    ops: readonly IdentityBatchOperation[],
  ): Promise<readonly IdentityBatchResult[]>;
}
