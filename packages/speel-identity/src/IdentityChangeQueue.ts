import type { GroupRef, PrincipalRef, RoleRef, UserRef } from "./refs.js";
import type { ResourceRef } from "./resources.js";

/**
 * Staged work, kept as raw references rather than resolved ids.
 *
 * That is what lets staging be synchronous — `db.set(X).add(entity)` does not make you await
 * either — and it means a reference to something created later in the same batch still
 * resolves, because resolution happens at save.
 *
 * The next cycle adds the permission operations; the union is deliberately open for them.
 */
export type IdentityOperation =
  | {
      readonly op: "addGroupMember";
      readonly group: GroupRef;
      readonly user: UserRef | undefined;
    }
  | {
      readonly op: "removeGroupMember";
      readonly group: GroupRef;
      readonly user: UserRef | undefined;
    }
  | {
      readonly op: "breakInheritance";
      readonly resource: ResourceRef;
      readonly copyExisting: boolean;
      readonly clearSubscopes: boolean;
    }
  | { readonly op: "resetInheritance"; readonly resource: ResourceRef }
  | {
      readonly op: "grant";
      readonly resource: ResourceRef;
      readonly principal: PrincipalRef;
      readonly role: RoleRef;
    }
  | {
      readonly op: "revoke";
      readonly resource: ResourceRef;
      readonly principal: PrincipalRef;
      readonly role: RoleRef;
    };

/** Operations that name a resource are grouped and phase-ordered by the save; the rest are not. */
export type ResourceOperation = Extract<
  IdentityOperation,
  { resource: ResourceRef }
>;

export function isResourceOperation(
  op: IdentityOperation,
): op is ResourceOperation {
  return op.op !== "addGroupMember" && op.op !== "removeGroupMember";
}

export class IdentityChangeQueue {
  readonly #ops: IdentityOperation[] = [];

  add(op: IdentityOperation): void {
    this.#ops.push(op);
  }

  get pending(): readonly IdentityOperation[] {
    return this.#ops;
  }
  get hasChanges(): boolean {
    return this.#ops.length > 0;
  }

  /** Empties the queue and returns what was in it, in staging order. */
  takeAll(): IdentityOperation[] {
    return this.#ops.splice(0, this.#ops.length);
  }

  /**
   * Puts operations back at the FRONT of the queue, in the order given — ahead of anything
   * staged since the save began, because these were staged earlier. The aborted-save path
   * uses this so a cancellation loses nothing that had not landed.
   */
  restore(ops: readonly IdentityOperation[]): void {
    this.#ops.unshift(...ops);
  }
}
