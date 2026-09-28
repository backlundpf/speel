// src/identity/SharePointIdentityProvider.ts — the PnPjs-backed IIdentityProvider.
// All @speel/identity imports are type-only (that package is an optional peer). A value
// import would make identity a hard dependency of every @speel/pnpjs consumer, including
// the ones that never ask who the user is.
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import "@pnp/sp/batching.js";
import "@pnp/sp/security/index.js";
import "@pnp/sp/site-users/web.js";
import "@pnp/sp/site-groups/web.js";
import "@pnp/sp/profiles/index.js";
import type { SPFI } from "@pnp/sp";
import type {
  IBasePermissions,
  IRoleDefinitionInfo,
} from "@pnp/sp/security/index.js";
import type { BasePermissions } from "@speel/identity";
import type {
  IIdentityProvider,
  IdentityBatchOperation,
  IdentityBatchResult,
  PermissionKind,
  ResolvedResource,
  RoleDefinitionSpec,
  RoleDefinitionCloneSpec,
  RoleDefinitionChanges,
} from "@speel/identity";
import { KIND } from "./kindMap.js";
import { maskFor, withKinds } from "./permissionMask.js";

type Rec = Record<string, unknown>;

/**
 * SharePoint caps an OData $batch at 100 sub-requests. PnPjs defaults
 * `maxRequests` to 20 and issues one sequential POST per chunk, so this must be
 * passed explicitly or a 100-op batch silently becomes 5 requests.
 */
const BATCH_REQUEST_LIMIT = 100;

/**
 * The people picker's own vocabulary — DisplayText, Key, EntityData — mapped onto the shape
 * every other read in this seam returns. Doing it here rather than in identity keeps the
 * endpoint's quirks inside the package that chose the endpoint.
 */
const PRINCIPAL_TYPE: Record<string, number> = {
  User: 1,
  DL: 2,
  SecGroup: 4,
  SPGroup: 8,
};

interface PickerEntity {
  DisplayText?: string;
  Key?: string;
  EntityType?: string;
  EntityData?: { Email?: string; SPUserID?: string; SPGroupID?: string };
}

function fromPickerEntity(entity: PickerEntity): Rec {
  const data = entity.EntityData ?? {};
  const rec: Rec = {};
  // SPUserID for people, SPGroupID for groups; a picker hit for someone who has never visited
  // the site has neither, and stays id-less until ensure() provisions them.
  const rawId = data.SPUserID ?? data.SPGroupID;
  const id = rawId !== undefined ? Number.parseInt(rawId, 10) : Number.NaN;
  if (!Number.isNaN(id)) rec.Id = id;
  if (entity.DisplayText !== undefined) rec.Title = entity.DisplayText;
  if (entity.Key !== undefined) rec.LoginName = entity.Key;
  if (data.Email !== undefined) rec.Email = data.Email;
  const principalType =
    entity.EntityType !== undefined
      ? PRINCIPAL_TYPE[entity.EntityType]
      : undefined;
  if (principalType !== undefined) rec.PrincipalType = principalType;
  return rec;
}

export class SharePointIdentityProvider implements IIdentityProvider {
  constructor(private readonly sp: SPFI) {}

  async getCurrentUserAsync(): Promise<Rec> {
    return await this.sp.web.currentUser();
  }

  /** `web.ensureUser` answers with the site-user record itself (PnPjs v4), already in model spelling. */
  async ensureUserAsync(loginName: string): Promise<Rec> {
    return (await this.sp.web.ensureUser(loginName)) as unknown as Rec;
  }

  async getGroupMembersAsync(groupId: number): Promise<Rec[]> {
    return await this.sp.web.siteGroups.getById(groupId).users();
  }

  async getUserGroupsAsync(userId: number): Promise<Rec[]> {
    return await this.sp.web.getUserById(userId).groups();
  }

  async getGroupsWithMembersAsync(): Promise<Rec[]> {
    // One expanded read instead of a call per group. SharePoint returns Users inline; a group
    // the caller may not enumerate comes back with an empty array rather than failing the lot.
    return await this.sp.web.siteGroups.expand("Users")();
  }

  async getRoleDefinitionsAsync(): Promise<Rec[]> {
    return (await this.sp.web.roleDefinitions()) as Rec[];
  }

  async createRoleDefinitionAsync(spec: RoleDefinitionSpec): Promise<Rec> {
    const added = await this.sp.web.roleDefinitions.add(
      spec.name,
      spec.description ?? "",
      spec.order ?? 0,
      maskFor(spec.permissions) as IBasePermissions,
    );
    return { ...(added.data as Rec) };
  }

  /**
   * A clone IS the source's mask: it is read here rather than in identity, which has no
   * vocabulary for masks and should not grow one.
   */
  async cloneRoleDefinitionAsync(
    sourceId: number,
    spec: RoleDefinitionCloneSpec,
  ): Promise<Rec> {
    const source = (await this.sp.web.roleDefinitions.getById(
      sourceId,
    )()) as Rec & { BasePermissions: BasePermissions };
    const added = await this.sp.web.roleDefinitions.add(
      spec.name,
      spec.description ?? "",
      spec.order ?? 0,
      withKinds(source.BasePermissions, spec) as IBasePermissions,
    );
    return { ...(added.data as Rec) };
  }

  async updateRoleDefinitionAsync(
    id: number,
    changes: RoleDefinitionChanges,
  ): Promise<Rec> {
    const definition = this.sp.web.roleDefinitions.getById(id);
    const props: Rec = {};
    if (changes.name !== undefined) props.Name = changes.name;
    if (changes.description !== undefined)
      props.Description = changes.description;
    if (changes.order !== undefined) props.Order = changes.order;
    if (changes.permissions !== undefined) {
      props.BasePermissions = maskFor(changes.permissions);
    } else if (changes.add !== undefined || changes.remove !== undefined) {
      const current = (await definition()) as Rec & {
        BasePermissions: BasePermissions;
      };
      props.BasePermissions = withKinds(current.BasePermissions, changes);
    }
    await definition.update(props as Partial<IRoleDefinitionInfo>);
    // SharePoint's MERGE answers with next to nothing, so read back: the caller is handed
    // the definition as it now stands, which is what every other write here returns.
    return { ...((await definition()) as Rec) };
  }

  async deleteRoleDefinitionAsync(id: number): Promise<void> {
    await this.sp.web.roleDefinitions.getById(id).delete();
  }

  async getAssociatedGroupsAsync(): Promise<{
    owners?: Rec | null;
    members?: Rec | null;
    visitors?: Rec | null;
  }> {
    // One expanded read rather than three fetches off web.associatedOwnerGroup and friends.
    // SharePoint omits or nulls the ones the web does not have, which is what makes the
    // nullability real rather than defensive.
    const web = (await this.sp.web.expand(
      "AssociatedOwnerGroup",
      "AssociatedMemberGroup",
      "AssociatedVisitorGroup",
    )()) as {
      AssociatedOwnerGroup?: Rec | null;
      AssociatedMemberGroup?: Rec | null;
      AssociatedVisitorGroup?: Rec | null;
    };

    return {
      owners: web.AssociatedOwnerGroup ?? null,
      members: web.AssociatedMemberGroup ?? null,
      visitors: web.AssociatedVisitorGroup ?? null,
    };
  }

  async createGroupAsync(title: string, description?: string): Promise<Rec> {
    const created = await this.sp.web.siteGroups.add({
      Title: title,
      ...(description !== undefined ? { Description: description } : {}),
    });
    // PnP types this as ISiteGroupInfo — an interface, which gets no implicit index
    // signature, so it is not assignable to Rec. Spreading yields an anonymous object
    // type, which does. A cast would work too and would hide a genuine shape change.
    return { ...created };
  }

  async searchPrincipalsAsync(
    query: string,
    maxResults: number,
  ): Promise<Rec[]> {
    const results = await this.sp.profiles.clientPeoplePickerSearchUser({
      QueryString: query,
      MaximumEntitySuggestions: maxResults,
    });
    return (results as PickerEntity[]).map(fromPickerEntity);
  }

  // ---- permissions -------------------------------------------------------------------

  /**
   * SharePoint's securables share one interface, so every permission method below is a line
   * on top of this. The security selector import above is what puts those methods there.
   * Takes the SPFI to build against, because a batched scope is a different instance.
   */
  #securable(sp: SPFI, resource: ResolvedResource) {
    switch (resource.kind) {
      case "web":
        return sp.web;
      case "list":
        return sp.web.lists.getByTitle(resource.list);
      case "item":
        return sp.web.lists
          .getByTitle(resource.list)
          .items.getById(resource.id);
    }
  }

  async executeBatchAsync(
    ops: readonly IdentityBatchOperation[],
  ): Promise<readonly IdentityBatchResult[]> {
    if (ops.length === 0) return [];

    const [sp2, execute] = this.sp.batched({
      maxRequests: BATCH_REQUEST_LIMIT,
    });
    const ok = (clientToken: string): IdentityBatchResult => ({
      kind: "success",
      clientToken,
    });
    const opPromises: Promise<IdentityBatchResult>[] = ops.map((op) => {
      switch (op.kind) {
        case "addGroupMember":
          return sp2.web.siteGroups
            .getById(op.groupId)
            .users.add(op.loginName)
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
        case "removeGroupMember":
          return sp2.web.siteGroups
            .getById(op.groupId)
            .users.removeById(op.userId)
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
        case "breakInheritance":
          return this.#securable(sp2, op.resource)
            .breakRoleInheritance(op.copyExisting, op.clearSubscopes)
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
        case "resetInheritance":
          return this.#securable(sp2, op.resource)
            .resetRoleInheritance()
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
        case "grant":
          return this.#securable(sp2, op.resource)
            .roleAssignments.add(op.principalId, op.roleDefinitionId)
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
        case "revoke":
          return this.#securable(sp2, op.resource)
            .roleAssignments.remove(op.principalId, op.roleDefinitionId)
            .then(() => ok(op.clientToken))
            .catch((err: unknown) => this.#toFailure(op.clientToken, err));
      }
    });

    await execute();
    return Promise.all(opPromises);
  }

  /**
   * PnP throws HttpRequestError-ish objects; keep the status and the most readable message.
   * Duplicated from SharePointProvider rather than shared — small enough that a new export
   * across the seam is not yet worth it.
   */
  #toFailure(clientToken: string, err: unknown): IdentityBatchResult {
    let status: number | undefined;
    let body = err instanceof Error ? err.message : String(err);
    if (typeof err === "object" && err !== null) {
      const e = err as { status?: number; message?: string };
      if (typeof e.status === "number") status = e.status;
      if (e.message) body = e.message;
    }
    return status !== undefined
      ? { kind: "failure", clientToken, status, body }
      : { kind: "failure", clientToken, body };
  }

  async getEffectivePermissionsAsync(
    resource: ResolvedResource,
    loginName?: string,
  ): Promise<BasePermissions> {
    const securable = this.#securable(this.sp, resource);
    const mask =
      loginName === undefined
        ? await securable.getCurrentUserEffectivePermissions()
        : await securable.getUserEffectivePermissions(loginName);
    return mask;
  }

  hasPermission(mask: BasePermissions, kind: PermissionKind): boolean {
    // PnP's own arithmetic. `hasPermissions` takes the mask explicitly and declares no `this`,
    // so which securable it hangs off is irrelevant — sp.web is simply the one always present.
    return this.sp.web.hasPermissions(mask as IBasePermissions, KIND[kind]);
  }

  async getRoleAssignmentsAsync(resource: ResolvedResource): Promise<Rec[]> {
    return await this.#securable(this.sp, resource).roleAssignments.expand(
      "Member",
      "RoleDefinitionBindings",
    )();
  }
}
