import type { PermissionKind } from "./PermissionKind.js";
import type { GroupRef, UserRef } from "./refs.js";
import type { ResolvedResource, ResourceRef } from "./resources.js";

/** What a policy's custom predicate is handed. */
export interface PolicyContext {
  /** The user being authorized — the current one unless `authorize` was given another. */
  readonly user: UserRef | undefined;
  /** The scope the question was asked about, already resolved. */
  readonly resource: ResolvedResource;
  /** Ask another question while answering this one. */
  readonly hasPermission: (kind: PermissionKind) => Promise<boolean>;
  readonly isMember: (group: GroupRef) => Promise<boolean>;
}

export type PolicyRequirement =
  | { readonly kind: "permission"; readonly permission: PermissionKind }
  | { readonly kind: "group"; readonly group: GroupRef }
  | {
      readonly kind: "custom";
      readonly predicate: (ctx: PolicyContext) => boolean | Promise<boolean>;
    };

export interface Policy {
  readonly name: string;
  readonly requirements: readonly PolicyRequirement[];
  /** Fixed at registration; `authorize`'s own argument wins when both are present. */
  readonly scope: ResourceRef | undefined;
}

/**
 * A named question, declared once where the app is configured rather than recomputed at each
 * call site. All requirements must hold — an ASP.NET-shaped policy, and the shape that keeps
 * "may they publish" from being re-derived slightly differently in three components.
 */
export class PolicyBuilder {
  readonly #requirements: PolicyRequirement[] = [];
  #scope: ResourceRef | undefined;

  requirePermission(permission: PermissionKind): this {
    this.#requirements.push({ kind: "permission", permission });
    return this;
  }

  requireGroup(group: GroupRef): this {
    this.#requirements.push({ kind: "group", group });
    return this;
  }

  /** Anything the other two cannot express. */
  require(predicate: (ctx: PolicyContext) => boolean | Promise<boolean>): this {
    this.#requirements.push({ kind: "custom", predicate });
    return this;
  }

  onWeb(): this {
    this.#scope = { kind: "web" };
    return this;
  }
  onList(title: string): this {
    this.#scope = { kind: "list", list: title };
    return this;
  }
  on(resource: ResourceRef): this {
    this.#scope = resource;
    return this;
  }

  /** @internal */
  build(name: string): Policy {
    return { name, requirements: [...this.#requirements], scope: this.#scope };
  }
}
