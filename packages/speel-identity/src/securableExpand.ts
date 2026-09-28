import type { SpecialExpand } from "@speel/core";
import type { RoleAssignment } from "./PermissionManager.js";
import type { RoleDefinition, SPRoleAssignment } from "./permissionTypes.js";
import { toPrincipal } from "./mapPrincipal.js";

/** The securable snapshot's expandable name on SpeelEntity. */
export const SECURABLE_EXPAND = "RoleAssignments";

/**
 * The securable snapshot: one opt-in that loads the whole permission state of a row.
 *
 * Expanding `RoleAssignments` also selects `HasUniqueRoleAssignments`, because an
 * assignments list without the unique flag is a half-answer — the flag is what decides
 * whether an apply must break inheritance first. Registered by
 * `IdentityDbContext.onModelCreating`, so extending that context is the whole opt-in.
 */
export function securableExpand(): SpecialExpand {
  return {
    navName: SECURABLE_EXPAND,
    spec: () => ({
      navName: SECURABLE_EXPAND,
      fields: [],
      expandPaths: [
        `${SECURABLE_EXPAND}/Member`,
        `${SECURABLE_EXPAND}/RoleDefinitionBindings`,
      ],
      selectPaths: [
        `${SECURABLE_EXPAND}/Member`,
        `${SECURABLE_EXPAND}/RoleDefinitionBindings`,
        "HasUniqueRoleAssignments",
      ],
      materialize: (target, record): void => {
        target[SECURABLE_EXPAND] = materializeSPRoleAssignments(
          record[SECURABLE_EXPAND],
        );
        if (record.HasUniqueRoleAssignments !== undefined) {
          target.HasUniqueRoleAssignments =
            record.HasUniqueRoleAssignments === true;
        }
      },
    }),
  };
}

function unwrap(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (
    v &&
    typeof v === "object" &&
    Array.isArray((v as { results?: unknown }).results)
  ) {
    return (v as { results: Record<string, unknown>[] }).results;
  }
  return [];
}

// Sets only the fields that are present — `exactOptionalPropertyTypes` forbids assigning
// `undefined` to an optional property. (The member alongside it goes through
// `mapPrincipal`, which is core's materialization and needs no such care.)
function toRoleDefinition(d: Record<string, unknown>): RoleDefinition {
  const rd: RoleDefinition = { Id: d.Id as number };
  if (d.Name !== undefined) rd.Name = d.Name as string;
  if (d.Description !== undefined) rd.Description = d.Description as string;
  if (d.RoleTypeKind !== undefined) rd.RoleTypeKind = d.RoleTypeKind as number;
  return rd;
}

/** Materialize the expanded wire payload (handles the SP `{ results: [] }` wrapper). */
export function materializeSPRoleAssignments(raw: unknown): SPRoleAssignment[] {
  return unwrap(raw).map((ra) => ({
    Member: toPrincipal((ra.Member as Record<string, unknown>) ?? {}),
    RoleDefinitionBindings: unwrap(ra.RoleDefinitionBindings).map(
      toRoleDefinition,
    ),
  }));
}

/**
 * The wire shape collapsed to the library's dialect — the same `{ member, roles }` that
 * `permissions.for(x).assignments()` returns, so an entity read and a per-resource read
 * hand consumers one type.
 */
export function asRoleAssignments(
  raw: readonly SPRoleAssignment[] | undefined,
): RoleAssignment[] {
  return (raw ?? []).map((ra) => ({
    member: ra.Member,
    roles: ra.RoleDefinitionBindings.map((b) => b.Name).filter(
      (n): n is string => typeof n === "string",
    ),
  }));
}
