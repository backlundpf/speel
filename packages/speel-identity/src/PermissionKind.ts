/**
 * SharePoint's permission vocabulary, camelCased.
 *
 * A **type**, deliberately: it is erased at compile time, so identity carries no runtime
 * constants and never imports `@pnp/sp`, whose `PermissionKind` is a real runtime enum. The
 * mapping from these names to bit positions — and every mask test — lives in `@speel/pnpjs`,
 * behind `IIdentityProvider.hasPermission`, where PnP's own tested helper does the arithmetic.
 *
 * The names mirror the platform's exactly so they can be searched against Microsoft's
 * documentation. `EmptyMask` and `FullMask` are absent: they are masks, not permissions.
 */
export type PermissionKind =
  | "viewListItems"
  | "addListItems"
  | "editListItems"
  | "deleteListItems"
  | "approveItems"
  | "openItems"
  | "viewVersions"
  | "deleteVersions"
  | "cancelCheckout"
  | "managePersonalViews"
  | "manageLists"
  | "viewFormPages"
  | "anonymousSearchAccessList"
  | "open"
  | "viewPages"
  | "addAndCustomizePages"
  | "applyThemeAndBorder"
  | "applyStyleSheets"
  | "viewUsageData"
  | "createSSCSite"
  | "manageSubwebs"
  | "createGroups"
  | "managePermissions"
  | "browseDirectories"
  | "browseUserInfo"
  | "addDelPrivateWebParts"
  | "updatePersonalWebParts"
  | "manageWeb"
  | "anonymousSearchAccessWebLists"
  | "useClientIntegration"
  | "useRemoteAPIs"
  | "manageAlerts"
  | "createAlerts"
  | "editMyUserInfo"
  | "enumeratePermissions";
