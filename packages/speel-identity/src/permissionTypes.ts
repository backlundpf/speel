// SharePoint item-level permission data shapes — wire-accurate, PascalCase, exactly as
// the REST expand hands them over. The library's own dialect (`RoleAssignment` with
// `{ member, roles }`) lives in PermissionManager; `asRoleAssignments` bridges the two.

import type { Principal } from "@speel/core";

/** A role definition ("Full Control", "Edit", "Read", …). */
export interface RoleDefinition {
  Id: number;
  Name?: string;
  Description?: string;
  RoleTypeKind?: number;
}

/** One item-level role assignment as SharePoint reports it: a principal plus its bindings. */
export interface SPRoleAssignment {
  Member: Principal;
  RoleDefinitionBindings: RoleDefinition[];
}

/** SharePoint 64-bit permission mask, split into two 32-bit halves. */
export interface BasePermissions {
  High: number;
  Low: number;
}

/**
 * What a securable row carries once `@speel/identity` is in the compilation: the module
 * augmentation adds exactly these members to `SpeelEntity`, so every entity satisfies
 * this structurally. `RoleAssignments` and `HasUniqueRoleAssignments` load together
 * through `.expand((x) => x.RoleAssignments)` on a context extending `IdentityDbContext`;
 * `EffectiveBasePermissions` is a typed placeholder with no loader yet.
 */
export interface ISecurable {
  readonly RoleAssignments?: SPRoleAssignment[];
  readonly HasUniqueRoleAssignments?: boolean;
  readonly EffectiveBasePermissions?: BasePermissions;
}
