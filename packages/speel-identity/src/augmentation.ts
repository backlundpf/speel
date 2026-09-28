// Importing @speel/identity is what puts the securable members on SpeelEntity — for the
// whole compilation, on every subclass. The runtime counterpart is per-model: only a
// context extending IdentityDbContext registers the expand that populates them.

import type { SPRoleAssignment, BasePermissions } from "./permissionTypes.js";

declare module "@speel/core" {
  interface SpeelEntity {
    readonly RoleAssignments?: SPRoleAssignment[];
    readonly HasUniqueRoleAssignments?: boolean;
    readonly EffectiveBasePermissions?: BasePermissions;
  }
}

export {};
