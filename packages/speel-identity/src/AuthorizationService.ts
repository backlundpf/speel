import { InvalidOperationException } from "@speel/core";
import type { BasePermissions } from "./permissionTypes.js";
import type { GroupManager } from "./GroupManager.js";
import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { PermissionKind } from "./PermissionKind.js";
import type { Policy, PolicyContext } from "./PolicyBuilder.js";
import type { PrincipalResolver } from "./PrincipalResolver.js";
import type { ResourceResolver } from "./ResourceResolver.js";
import type { UserRef } from "./refs.js";
import { resourceKey, type ResourceRef } from "./resources.js";

const WEB: ResourceRef = { kind: "web" };

/**
 * The read-only asking — the only identity service most pages touch.
 *
 * Answers come from the whole effective-permission mask, fetched once per resource-and-user
 * and cached, so a page asking four questions about one list costs one round trip. A save
 * clears the cache, because it has just changed the answers.
 */
export class AuthorizationService {
  readonly #masks = new Map<string, Promise<BasePermissions>>();

  constructor(
    private readonly provider: IIdentityProvider,
    private readonly resources: ResourceResolver,
    private readonly principals: PrincipalResolver,
    private readonly groups: GroupManager,
    private readonly policies: ReadonlyMap<string, Policy>,
  ) {}

  /** Defaults to the web and to the current user. */
  async hasPermission(
    kind: PermissionKind,
    resource: ResourceRef = WEB,
    user?: UserRef,
  ): Promise<boolean> {
    return this.provider.hasPermission(
      await this.effectivePermissions(resource, user),
      kind,
    );
  }

  /** The whole mask, for surfaces that display capability rather than branch on one bit. */
  async effectivePermissions(
    resource: ResourceRef = WEB,
    user?: UserRef,
  ): Promise<BasePermissions> {
    const resolved = this.resources.resolve(resource);
    const login =
      user === undefined ? undefined : await this.principals.userLogin(user);
    const key = `${resourceKey(resolved)}|${login ?? ""}`;

    let pending = this.#masks.get(key);
    if (pending === undefined) {
      pending = this.provider.getEffectivePermissionsAsync(resolved, login);
      // A rejected read is not an answer; evict it so the next ask retries.
      void pending.catch(() => {
        if (this.#masks.get(key) === pending) this.#masks.delete(key);
      });
      this.#masks.set(key, pending);
    }
    return pending;
  }

  /**
   * A named policy. Every requirement must hold, and the first failure short-circuits the rest
   * — requirements cost round trips, and a policy that has already failed cannot pass.
   *
   * An unregistered name throws rather than returning false: a typo that reads as "denied"
   * is a security bug wearing the costume of working code.
   */
  async authorize(
    name: string,
    resource?: ResourceRef,
    user?: UserRef,
  ): Promise<boolean> {
    const policy = this.policies.get(name);
    if (policy === undefined) {
      const known = [...this.policies.keys()].join(", ") || "none registered";
      throw new InvalidOperationException(
        `No authorization policy named '${name}'. Known policies: ${known}.`,
      );
    }

    const scope = resource ?? policy.scope ?? WEB;
    const ctx: PolicyContext = {
      user,
      resource: this.resources.resolve(scope),
      hasPermission: (kind) => this.hasPermission(kind, scope, user),
      isMember: (group) => this.groups.isMember(group, user),
    };

    for (const requirement of policy.requirements) {
      const met =
        requirement.kind === "permission"
          ? await this.hasPermission(requirement.permission, scope, user)
          : requirement.kind === "group"
            ? await this.groups.isMember(requirement.group, user)
            : await requirement.predicate(ctx);
      if (!met) return false;
    }
    // A policy with no requirements authorizes everyone; that is what it asked for.
    return true;
  }

  /** Drop cached masks. Called for you by `saveChangesAsync`. */
  clearCache(): void {
    this.#masks.clear();
  }
}
