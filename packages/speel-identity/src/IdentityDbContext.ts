import {
  DbContext,
  type ModelBuilder,
  Principal,
  SiteGroup,
  SiteUser,
} from "@speel/core";
import { securableExpand } from "./securableExpand.js";
import { UserSetting } from "./UserSetting.js";

/**
 * The context an app extends to get identity's own storage and its principal types.
 *
 * The sets are **declared**, not registered through an options builder, and that distinction
 * carries the whole design. The migrations CLI constructs a context directly
 * (`new cfg.context({ provider: stubProvider() })`) to read the model it diffs against the
 * snapshot — no builder runs, so anything a builder had registered would be missing and the
 * next generated migration would drop the list. A field initializer runs either way.
 *
 * The three principal sets read the provider's `principals` / `siteUsers` / `siteGroups`
 * collections and are read-only through the entity API — `identity.users.ensure` and
 * `identity.groups.create` are the writes. The shapes are core's (`SpeelEntity`'s
 * `Author` / `Editor` target `SiteUser` on any context); declaring the sets here is what
 * makes them queryable.
 *
 * Opting out is extending plain `DbContext`: take this base class and you take its list, the
 * same trade ASP.NET Core Identity makes with its tables.
 */
export abstract class IdentityDbContext extends DbContext {
  /** Users and groups alike, from the User Information List. */
  public principals = this.set(Principal);
  public siteUsers = this.set(SiteUser);
  public siteGroups = this.set(SiteGroup);
  public userSettings = this.set(UserSetting);

  /**
   * Registers the securable snapshot (see securableExpand): on this context,
   * `.expand((x) => x.RoleAssignments)` loads a row's role assignments and unique flag.
   * Subclass overrides must call `super.onModelCreating(builder)` to keep it.
   */
  protected override onModelCreating(builder: ModelBuilder): void {
    super.onModelCreating(builder);
    builder.addSpecialExpand(securableExpand());
  }
}
