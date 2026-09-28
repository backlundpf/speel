import type { BasePermissions, PermissionKind } from "@speel/identity";
import { KIND } from "./kindMap.js";

/**
 * Compose a SharePoint permission mask from speel's permission names.
 *
 * PnP exports `hasPermissions` to TEST a mask and nothing to build one, so this half of
 * the arithmetic is ours. It stays here, pure and directly tested, rather than anywhere
 * identity can see it: identity has no runtime permission vocabulary by design.
 *
 * PnP's `PermissionKind` values are 1-based bit positions — 1–32 land in `Low`, 33–64 in
 * `High`. `>>> 0` keeps position 32 from coming back as a negative number, since JS
 * bitwise operators work on signed 32-bit integers.
 *
 * `KIND[kind]` is looked up and checked before the arithmetic runs, because an unrecognized
 * name is not something the type can stop here: a caller reading names from configuration and
 * casting, or any JS caller, can hand one past `PermissionKind` — the same reason
 * `RoleManager.update` re-checks its either/or at runtime.
 */
export function maskFor(kinds: Iterable<PermissionKind>): BasePermissions {
  let high = 0;
  let low = 0;
  for (const kind of kinds) {
    const bit = KIND[kind];
    if (bit === undefined) {
      throw new Error(`Unknown permission kind '${String(kind)}'.`);
    }
    const index = bit - 1;
    if (index < 32) low = (low | (1 << index)) >>> 0;
    else high = (high | (1 << (index - 32))) >>> 0;
  }
  return { High: high, Low: low };
}

/**
 * Apply an add/remove delta to an existing mask. Removal happens after addition, so a kind
 * named in both is absent however the caller ordered the arrays.
 */
export function withKinds(
  mask: BasePermissions,
  delta: {
    add?: readonly PermissionKind[];
    remove?: readonly PermissionKind[];
  },
): BasePermissions {
  const added = maskFor(delta.add ?? []);
  const removed = maskFor(delta.remove ?? []);
  return {
    High: ((mask.High | added.High) & ~removed.High) >>> 0,
    Low: ((mask.Low | added.Low) & ~removed.Low) >>> 0,
  };
}
