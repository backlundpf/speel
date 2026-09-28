import { useContext, useEffect, useState } from "react";
import type {
  PermissionKind,
  ResourceRef,
  SiteUser,
  SpeelIdentity,
} from "@speel/identity";
import { IdentityContext } from "../context.js";

/** The identity the host wired, or `undefined` — the hooks below stay inert without one. */
export function useIdentity(): SpeelIdentity | undefined {
  return useContext(IdentityContext);
}

/** The signed-in user, once resolved. `undefined` until then, and without an identity. */
export function useCurrentUser(): {
  user: SiteUser | undefined;
  ready: boolean;
} {
  const identity = useIdentity();
  const [user, setUser] = useState<SiteUser | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!identity) return;
    let live = true;
    void identity.users.me().then(
      (resolved) => {
        if (live) {
          setUser(resolved);
          setReady(true);
        }
      },
      () => {
        if (live) setReady(true);
      }, // an unresolvable user is "no user", not a crash
    );
    return () => {
      live = false;
    };
  }, [identity]);

  return { user, ready };
}

/**
 * Deny while deciding.
 *
 * Authorization is asynchronous and rendering is not, so there is a moment before the answer
 * exists. Returning `true` early would render a button that then vanishes — briefly offering
 * an action the user cannot take — so these resolve to `false` first and `ready` tells a
 * caller that wants a skeleton instead.
 */
function useAsyncDecision(
  decide: (() => Promise<boolean>) | undefined,
  deps: readonly unknown[],
) {
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!decide) {
      setAllowed(false);
      setReady(false);
      return;
    }
    let live = true;
    setReady(false);
    void decide().then(
      (result) => {
        if (live) {
          setAllowed(result);
          setReady(true);
        }
      },
      () => {
        if (live) {
          setAllowed(false);
          setReady(true);
        }
      }, // an error is a denial
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { allowed, ready };
}

/**
 * A dependency that is stable across renders for the same resource.
 *
 * `list('Contracts')` builds a fresh object every render, which is exactly how a caller would
 * naturally write it — and a raw object in a dependency array would re-run the effect forever.
 * Descriptors compare by value; an entity descriptor compares by the entity's own reference,
 * which is stable for as long as it is the same tracked entity.
 */
function resourceDep(resource: ResourceRef | undefined): unknown {
  if (resource === undefined) return "";
  return resource.kind === "entity"
    ? resource.entity
    : JSON.stringify(resource);
}

/** A named policy, evaluated against the current user. */
export function useAuthorized(
  policy: string,
  resource?: ResourceRef,
): { allowed: boolean; ready: boolean } {
  const identity = useIdentity();
  return useAsyncDecision(
    identity
      ? () => identity.authorization.authorize(policy, resource)
      : undefined,
    [identity, policy, resourceDep(resource)],
  );
}

/** One permission at a resource — the web unless another is given. */
export function usePermission(
  kind: PermissionKind,
  resource?: ResourceRef,
): { allowed: boolean; ready: boolean } {
  const identity = useIdentity();
  return useAsyncDecision(
    identity
      ? () => identity.authorization.hasPermission(kind, resource)
      : undefined,
    [identity, kind, resourceDep(resource)],
  );
}
