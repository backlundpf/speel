import { PermissionKind as PnpPermissionKind } from "@pnp/sp/security/index.js";
import type { PermissionKind } from "@speel/identity";

/**
 * speel's vocabulary onto PnP's enum. Typed as a total Record, so a name added in
 * identity fails to compile here until it is mapped. (Moved out of the provider so
 * the mask arithmetic can share it.)
 */
export const KIND: Record<PermissionKind, PnpPermissionKind> = {
  viewListItems: PnpPermissionKind.ViewListItems,
  addListItems: PnpPermissionKind.AddListItems,
  editListItems: PnpPermissionKind.EditListItems,
  deleteListItems: PnpPermissionKind.DeleteListItems,
  approveItems: PnpPermissionKind.ApproveItems,
  openItems: PnpPermissionKind.OpenItems,
  viewVersions: PnpPermissionKind.ViewVersions,
  deleteVersions: PnpPermissionKind.DeleteVersions,
  cancelCheckout: PnpPermissionKind.CancelCheckout,
  managePersonalViews: PnpPermissionKind.ManagePersonalViews,
  manageLists: PnpPermissionKind.ManageLists,
  viewFormPages: PnpPermissionKind.ViewFormPages,
  anonymousSearchAccessList: PnpPermissionKind.AnonymousSearchAccessList,
  open: PnpPermissionKind.Open,
  viewPages: PnpPermissionKind.ViewPages,
  addAndCustomizePages: PnpPermissionKind.AddAndCustomizePages,
  applyThemeAndBorder: PnpPermissionKind.ApplyThemeAndBorder,
  applyStyleSheets: PnpPermissionKind.ApplyStyleSheets,
  viewUsageData: PnpPermissionKind.ViewUsageData,
  createSSCSite: PnpPermissionKind.CreateSSCSite,
  manageSubwebs: PnpPermissionKind.ManageSubwebs,
  createGroups: PnpPermissionKind.CreateGroups,
  managePermissions: PnpPermissionKind.ManagePermissions,
  browseDirectories: PnpPermissionKind.BrowseDirectories,
  browseUserInfo: PnpPermissionKind.BrowseUserInfo,
  addDelPrivateWebParts: PnpPermissionKind.AddDelPrivateWebParts,
  updatePersonalWebParts: PnpPermissionKind.UpdatePersonalWebParts,
  manageWeb: PnpPermissionKind.ManageWeb,
  anonymousSearchAccessWebLists:
    PnpPermissionKind.AnonymousSearchAccessWebLists,
  useClientIntegration: PnpPermissionKind.UseClientIntegration,
  useRemoteAPIs: PnpPermissionKind.UseRemoteAPIs,
  manageAlerts: PnpPermissionKind.ManageAlerts,
  createAlerts: PnpPermissionKind.CreateAlerts,
  editMyUserInfo: PnpPermissionKind.EditMyUserInfo,
  enumeratePermissions: PnpPermissionKind.EnumeratePermissions,
};
