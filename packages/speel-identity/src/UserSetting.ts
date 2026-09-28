import { Entity, Key, NoteField, SpeelEntity, TextField } from "@speel/core";

/** The list title every speel app provisions for per-user settings. */
export const USER_SETTINGS_LIST = "Speel User Settings";

/**
 * One setting, for one user.
 *
 * The key lives in the list's built-in `Title` column rather than a parallel `Key` column:
 * SharePoint makes `Title` required, so a second column would leave every row carrying a dead
 * mandatory field. `Value` is JSON, so a setting is anything serialisable — a boolean for dark
 * mode, or the nested descriptor a saved table view needs.
 *
 * One row per key, not one row per user holding a blob, so two features writing different
 * settings never touch the same row and cannot clobber each other from two tabs.
 *
 * The list is provisioned with item-level security, so SharePoint returns only the current
 * user's rows and refuses writes to anyone else's. That is what removes the need for a
 * current-user API and makes correct scoping impossible to forget at a call site.
 *
 * Extend `IdentityDbContext` to get it registered, then generate a migration; provisioning
 * is per-tenant, so the migration stays app-owned.
 */
@Entity({ list: USER_SETTINGS_LIST, readSecurity: "own", writeSecurity: "own" })
export class UserSetting extends SpeelEntity {
  @Key public override Id?: number = undefined;

  /** The setting key, e.g. `theme.dark` or `table.view.ao-responses.v1`. */
  @TextField()
  public Title: string | null = null;

  /** The setting value, JSON-encoded. */
  @NoteField()
  public Value: string | null = null;
}
