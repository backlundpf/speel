import type { IListHandle } from "@speel/core";
import type { RoleAssignment } from "../PermissionManager.js";

/**
 * The fake-provider surface this helper needs — structurally
 * `FakeStorageProvider` from `@speel/core/testing`.
 */
export interface SecurableSeedTarget {
  seedExpandPayload(
    list: IListHandle,
    itemId: number,
    navColumn: string,
    payload: unknown,
  ): void;
  seedItemFields(
    list: IListHandle,
    itemId: number,
    fields: Record<string, unknown>,
  ): void;
}

/**
 * State one row's permission snapshot in the library's simple shape. The helper writes the
 * raw wire payload (`Member` + `RoleDefinitionBindings`) plus `HasUniqueRoleAssignments`
 * onto the fake, so an entity read through `.expand((x) => x.RoleAssignments)` exercises
 * the real materializer and comes back as `SPRoleAssignment[]`.
 *
 * The item must already exist in the fake — state is seeded onto it, not created.
 */
export function seedSecurable(
  provider: SecurableSeedTarget,
  list: IListHandle,
  itemId: number,
  state: { unique?: boolean; assignments: readonly RoleAssignment[] },
): void {
  provider.seedExpandPayload(
    list,
    itemId,
    "RoleAssignments",
    state.assignments.map((a) => ({
      Member: a.member,
      RoleDefinitionBindings: a.roles.map((name, i) => ({
        Id: i + 1, // synthetic — the wire always carries binding ids; nothing keys on them
        Name: name,
      })),
    })),
  );
  provider.seedItemFields(list, itemId, {
    HasUniqueRoleAssignments: state.unique === true,
  });
}
