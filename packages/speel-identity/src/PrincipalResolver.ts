import { InvalidOperationException } from "@speel/core";
import type { IdentityDbContext } from "./IdentityDbContext.js";
import type { GroupRef, PrincipalRef, RoleRef, UserRef } from "./refs.js";
import type { RoleDefinitionSet } from "./RoleDefinitionSet.js";
import type { UserManager } from "./UserManager.js";

const idOf = (ref: unknown): number | undefined => {
  if (typeof ref === "number") return ref;
  if (ref !== null && typeof ref === "object") {
    const id = (ref as { Id?: unknown }).Id;
    if (typeof id === "number") return id;
  }
  return undefined;
};

const loginOf = (ref: unknown): string | undefined => {
  if (typeof ref === "string") return ref;
  if (ref !== null && typeof ref === "object") {
    const login = (ref as { LoginName?: unknown }).LoginName;
    if (typeof login === "string") return login;
  }
  return undefined;
};

/**
 * References are permissive at the API edge and exact at the wire: a group title has to become
 * an id, and adding a member needs a login name while removing one needs an id.
 *
 * Resolution happens here, at call or save time, which is what lets staging stay synchronous —
 * and means a reference to something created later in the same batch still resolves.
 */
export class PrincipalResolver {
  constructor(
    private readonly db: IdentityDbContext,
    private readonly users: UserManager,
    private readonly roleDefinitions: RoleDefinitionSet,
  ) {}

  async groupId(ref: GroupRef): Promise<number> {
    const direct = idOf(ref);
    if (direct !== undefined) return direct;
    const title = String(ref);
    const group = await this.db.siteGroups
      .where((b) => b.Title.eq(title))
      .firstOrDefaultAsync();
    if (group?.Id === undefined)
      throw new InvalidOperationException(`No site group named '${title}'.`);
    return group.Id;
  }

  /** Omitting the reference means the current user. */
  async userId(ref?: UserRef): Promise<number> {
    if (ref === undefined) {
      const me = await this.users.me();
      if (me.Id === undefined)
        throw new InvalidOperationException("The current user has no Id.");
      return me.Id;
    }
    const direct = idOf(ref);
    if (direct !== undefined) return direct;
    const login = String(ref);
    const user = await this.db.siteUsers
      .where((b) => b.LoginName.eq(login))
      .firstOrDefaultAsync();
    if (user?.Id === undefined)
      throw new InvalidOperationException(
        `No site user with login '${login}'.`,
      );
    return user.Id;
  }

  /** Omitting the reference means the current user. */
  async userLogin(ref?: UserRef): Promise<string> {
    if (ref === undefined) {
      const me = await this.users.me();
      if (me.LoginName === undefined)
        throw new InvalidOperationException(
          "The current user has no login name.",
        );
      return me.LoginName;
    }
    const direct = loginOf(ref);
    if (direct !== undefined) return direct;
    const id = idOf(ref);
    if (id !== undefined) {
      const user = await this.db.siteUsers.findAsync(id);
      if (user?.LoginName === undefined)
        throw new InvalidOperationException(
          `Site user ${id} has no login name.`,
        );
      return user.LoginName;
    }
    throw new InvalidOperationException(
      "Cannot resolve a login name for that user reference.",
    );
  }

  /**
   * A person or a group. Site users and site groups share one id space in SharePoint, so an id
   * or an entity needs no disambiguation; only a bare string does, and it is tried as a login
   * before a group title.
   *
   * The login read goes through `principals`, not `siteUsers`, precisely because this method
   * does not care which kind it gets. A claims security group — `Everyone except external
   * users` and its relatives — has a login but is not a site user and is not in
   * `web/siteGroups` either, so a `siteUsers` read correctly refuses it and the group-title
   * fallback cannot see it. Asking the set whose whole purpose is "a user or a group" is the
   * reading that answers.
   */
  async principalId(ref: PrincipalRef): Promise<number> {
    const direct = idOf(ref);
    if (direct !== undefined) return direct;

    const name = String(ref);
    const principal = await this.db.principals
      .where((b) => b.LoginName.eq(name))
      .firstOrDefaultAsync();
    if (principal?.Id !== undefined) return principal.Id;
    const group = await this.db.siteGroups
      .where((b) => b.Title.eq(name))
      .firstOrDefaultAsync();
    if (group?.Id !== undefined) return group.Id;

    throw new InvalidOperationException(
      `No principal with login '${name}', and no group by that name.`,
    );
  }

  /** A role definition by entity, id, or name. */
  async roleDefinitionId(ref: RoleRef): Promise<number> {
    const direct = idOf(ref);
    if (direct !== undefined) return direct;

    const name = String(ref);
    const role = await this.roleDefinitions.getByNameAsync(name);
    if (role?.Id === undefined)
      throw new InvalidOperationException(
        `No role definition named '${name}'.`,
      );
    return role.Id;
  }
}
