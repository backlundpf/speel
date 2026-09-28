import { toPrincipal } from "./mapPrincipal.js";

import type { IEntity } from "@speel/core";
import type { Principal } from "@speel/core";
import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { IdentityChangeQueue } from "./IdentityChangeQueue.js";
import type { PrincipalRef, RoleRef } from "./refs.js";
import type { ResourceResolver } from "./ResourceResolver.js";
import { item, type ResourceRef } from "./resources.js";

/**
 * Who holds which roles on a resource. The member is a `Principal` because a role assignment
 * names either a user or a group and the caller must be able to tell which — `PrincipalType`
 * carries that (1 = user, 8 = SharePoint group).
 */
export interface RoleAssignment {
  member: Principal;
  /** Role definition names — 'Full Control', 'Contribute'. */
  roles: string[];
}

export interface BreakInheritanceOptions {
  /** Keep the assignments inherited from the parent as a starting point. Default true. */
  copyExisting?: boolean;
  /** Also break inheritance on everything below this. Default false. */
  clearSubscopes?: boolean;
}

/**
 * Permission changes for one resource. Every mutation stages; only `assignments()` goes to the
 * wire, because reading who holds what is not a change.
 *
 * Chainable, since the useful shape is one intention over one resource: break inheritance,
 * then grant the people who should keep access.
 */
export class ResourcePermissions {
  constructor(
    private readonly resource: ResourceRef,
    private readonly provider: IIdentityProvider,
    private readonly resolver: ResourceResolver,
    private readonly queue: IdentityChangeQueue,
  ) {}

  /**
   * Stop inheriting from the parent, which is what makes any grant here apply *here* — a grant
   * on a still-inheriting resource edits the parent's assignments instead.
   */
  breakInheritance(opts: BreakInheritanceOptions = {}): this {
    this.queue.add({
      op: "breakInheritance",
      resource: this.resource,
      copyExisting: opts.copyExisting ?? true,
      clearSubscopes: opts.clearSubscopes ?? false,
    });
    return this;
  }

  /** Go back to inheriting, discarding the unique assignments. */
  resetInheritance(): this {
    this.queue.add({ op: "resetInheritance", resource: this.resource });
    return this;
  }

  grant(principal: PrincipalRef, role: RoleRef): this {
    this.queue.add({ op: "grant", resource: this.resource, principal, role });
    return this;
  }

  revoke(principal: PrincipalRef, role: RoleRef): this {
    this.queue.add({ op: "revoke", resource: this.resource, principal, role });
    return this;
  }

  /**
   * Who holds which roles here. Immediate — a read, not a change.
   *
   * Deliberately not `async`: `resolve` throws synchronously for a resource that cannot be
   * named, and an `async` wrapper would turn that programming error into a rejection the
   * caller only discovers on await.
   */
  assignments(): Promise<RoleAssignment[]> {
    return this.provider
      .getRoleAssignmentsAsync(this.resolver.resolve(this.resource))
      .then((records) =>
        records.map((rec) => ({
          member: toPrincipal(
            (rec.Member as Record<string, unknown> | undefined) ?? {},
          ),
          roles: Array.isArray(rec.RoleDefinitionBindings)
            ? (rec.RoleDefinitionBindings as { Name?: unknown }[])
                .map((b) => b.Name)
                .filter((n): n is string => typeof n === "string")
            : [],
        })),
      );
  }
}

function isResourceRef(r: ResourceRef | IEntity): r is ResourceRef {
  const kind = (r as { kind?: unknown }).kind;
  return (
    kind === "web" || kind === "list" || kind === "item" || kind === "entity"
  );
}

/** Permission changes, addressed by resource. */
export class PermissionManager {
  constructor(
    private readonly provider: IIdentityProvider,
    private readonly resolver: ResourceResolver,
    private readonly queue: IdentityChangeQueue,
  ) {}

  /**
   * Accepts a descriptor or the entity itself — an entity is sugar for `item(entity)`,
   * with its list and id resolved from the model at save time.
   */
  for(resource: ResourceRef | IEntity): ResourcePermissions {
    return new ResourcePermissions(
      isResourceRef(resource) ? resource : item(resource),
      this.provider,
      this.resolver,
      this.queue,
    );
  }
}
