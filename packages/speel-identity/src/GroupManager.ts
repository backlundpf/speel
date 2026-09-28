import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { IdentityDbContext } from "./IdentityDbContext.js";
import type { SiteGroup, SiteUser } from "@speel/core";
import type { GroupRef, UserRef } from "./refs.js";
import type { PrincipalResolver } from "./PrincipalResolver.js";
import type { IdentityChangeQueue } from "./IdentityChangeQueue.js";
import { toSiteGroup, toSiteUser } from "./mapPrincipal.js";

/** A group and everyone in it, as `allWithMembers` returns them. */
export interface GroupMembership {
  group: SiteGroup;
  members: SiteUser[];
}

/**
 * The web's own three groups. Each is nullable because a web can genuinely lack one — whether
 * that matters is the caller's policy, not this package's.
 */
export interface AssociatedGroups {
  owners: SiteGroup | null;
  members: SiteGroup | null;
  visitors: SiteGroup | null;
}

/**
 * Group membership, in both directions.
 *
 * The group list itself comes from the context, whose site-group set already exists;
 * membership is the part SharePoint exposes and speel did not, so it goes through the seam.
 */
export class GroupManager {
  constructor(
    private readonly db: IdentityDbContext,
    private readonly provider: IIdentityProvider,
    private readonly resolver: PrincipalResolver,
    private readonly queue: IdentityChangeQueue,
  ) {}

  all(): Promise<SiteGroup[]> {
    return this.db.siteGroups.toArrayAsync();
  }

  /** A group by its title — the name SharePoint shows and the one a reference carries. */
  getByName(title: string): Promise<SiteGroup | null> {
    return this.db.siteGroups
      .where((b) => b.Title.eq(title))
      .firstOrDefaultAsync();
  }

  /**
   * Every group with its membership, in one provider call. `all()` plus `members()` per group
   * answers the same question in N+1; this is the shape a permissions screen actually wants.
   */
  async allWithMembers(): Promise<GroupMembership[]> {
    const records = await this.provider.getGroupsWithMembersAsync();
    return records.map((rec) => ({
      group: toSiteGroup(rec),
      members: Array.isArray(rec.Users)
        ? (rec.Users as Record<string, unknown>[]).map(toSiteUser)
        : [],
    }));
  }

  /**
   * The web's Owners, Members, and Visitors groups, in one round trip.
   *
   * Not three accessors: the caller that wants one almost always wants the set — "owners get
   * Full Control, members Contribute, visitors Read" is a single thought — and three accessors
   * would make that three requests.
   */
  async associated(): Promise<AssociatedGroups> {
    const rec = await this.provider.getAssociatedGroupsAsync();
    const map = (
      r: Record<string, unknown> | null | undefined,
    ): SiteGroup | null =>
      r === null || r === undefined ? null : toSiteGroup(r);
    return {
      owners: map(rec.owners),
      members: map(rec.members),
      visitors: map(rec.visitors),
    };
  }

  /**
   * Create a group and get it back.
   *
   * Deliberately immediate while every other mutation here stages: `saveChangesAsync` returns
   * a tally, not entities, and the whole point of creating a group is to reference the thing
   * you just made. `users.ensure()` is the same shape — a provisioning write that returns its
   * result.
   *
   * Not "ensure": a duplicate title is an error, not an idempotent no-op. SharePoint refuses
   * it, and a caller that wants friendlier handling should `get()` first.
   */
  async create(
    title: string,
    opts?: { description?: string },
  ): Promise<SiteGroup> {
    return toSiteGroup(
      await this.provider.createGroupAsync(title, opts?.description),
    );
  }

  async get(ref: GroupRef): Promise<SiteGroup | null> {
    return this.db.siteGroups.findAsync(await this.resolver.groupId(ref));
  }

  async members(group: GroupRef): Promise<SiteUser[]> {
    const groupId = await this.resolver.groupId(group);
    return (await this.provider.getGroupMembersAsync(groupId)).map(toSiteUser);
  }

  /** Defaults to the current user, which is the question that actually gets asked. */
  async groupsFor(user?: UserRef): Promise<SiteGroup[]> {
    const userId = await this.resolver.userId(user);
    return (await this.provider.getUserGroupsAsync(userId)).map(toSiteGroup);
  }

  /**
   * Asked via the user's groups rather than the group's members: a person belongs to a handful
   * of groups, while a group can hold thousands of people.
   */
  async isMember(group: GroupRef, user?: UserRef): Promise<boolean> {
    const [groupId, groups] = await Promise.all([
      this.resolver.groupId(group),
      this.groupsFor(user),
    ]);
    return groups.some((g) => g.Id === groupId);
  }

  /**
   * Staged, not applied — `identity.saveChangesAsync()` puts it on the wire. Synchronous on
   * purpose, and the references are kept raw so they resolve against the state at save time.
   */
  addMember(group: GroupRef, user?: UserRef): void {
    this.queue.add({ op: "addGroupMember", group, user });
  }

  /** Staged; see `addMember`. */
  removeMember(group: GroupRef, user?: UserRef): void {
    this.queue.add({ op: "removeGroupMember", group, user });
  }
}
