import "./augmentation.js";

export type {
  IIdentityProvider,
  AssociatedGroupRecords,
  IdentityBatchOperation,
  IdentityBatchResult,
  RoleDefinitionSpec,
  RoleDefinitionCloneSpec,
  RoleDefinitionChanges,
} from "./IIdentityProvider.js";
export type {
  BasePermissions,
  ISecurable,
  RoleDefinition,
  SPRoleAssignment,
} from "./permissionTypes.js";
export {
  asRoleAssignments,
  materializeSPRoleAssignments,
  SECURABLE_EXPAND,
  securableExpand,
} from "./securableExpand.js";
export {
  applySecurable,
  applySecurables,
  diffSecurable,
  planOperations,
  SYSTEM_ROLES,
} from "./reconcile.js";
export type {
  ApplyResult,
  DesiredPermissions,
  PlannedOperation,
  SecurableDifference,
  SecurablePlan,
  SecurableReport,
} from "./reconcile.js";
export { RoleDefinitionSet } from "./RoleDefinitionSet.js";
// The principal shapes are core's canonical entities; identity declares the sets over them.
export { Principal, SiteUser, SiteGroup } from "@speel/core";
export { toPrincipal, toSiteGroup, toSiteUser } from "./mapPrincipal.js";
export type { GroupRef, UserRef } from "./refs.js";
export { initSpeelIdentity } from "./initSpeelIdentity.js";
export { SpeelIdentity } from "./SpeelIdentity.js";
export type { IIdentitySaveOptions } from "./SpeelIdentity.js";
export { IdentityOptionsBuilder } from "./IdentityOptionsBuilder.js";
export type { IIdentityOptions } from "./IdentityOptionsBuilder.js";
export { UserManager } from "./UserManager.js";
export { GroupManager } from "./GroupManager.js";
export type { GroupMembership, AssociatedGroups } from "./GroupManager.js";
export { PrincipalResolver } from "./PrincipalResolver.js";
export { RoleManager } from "./RoleManager.js";
export type { RoleUpdate } from "./RoleManager.js";
export { IdentityChangeQueue } from "./IdentityChangeQueue.js";
export type { IdentityOperation } from "./IdentityChangeQueue.js";
export { IdentitySaveException } from "./errors.js";
export type { IdentityOperationFailure, IdentitySaveResult } from "./errors.js";
export type { PermissionKind } from "./PermissionKind.js";
export { item, itemIn, list, resourceKey, web } from "./resources.js";
export type { ResolvedResource, ResourceRef } from "./resources.js";
export { ResourceResolver } from "./ResourceResolver.js";
export { PermissionManager, ResourcePermissions } from "./PermissionManager.js";
export type {
  BreakInheritanceOptions,
  RoleAssignment,
} from "./PermissionManager.js";
export type { PrincipalRef, RoleRef } from "./refs.js";
export { isResourceOperation } from "./IdentityChangeQueue.js";
export type { ResourceOperation } from "./IdentityChangeQueue.js";
export { AuthorizationService } from "./AuthorizationService.js";
export { PolicyBuilder } from "./PolicyBuilder.js";
export type {
  Policy,
  PolicyContext,
  PolicyRequirement,
} from "./PolicyBuilder.js";
export { UserSetting, USER_SETTINGS_LIST } from "./UserSetting.js";
export {
  createLocalUserSettingsStore,
  createEntityUserSettingsStore,
} from "./userSettingsStore.js";
export type { UserSettingsStore } from "./userSettingsStore.js";
export { IdentityDbContext } from "./IdentityDbContext.js";
