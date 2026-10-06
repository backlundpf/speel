/** How serialize writes navigations: `{ Id }` stubs, or loaded targets in full (one level). */
export type NavigationMode = "stub" | "full";

/** Options for `DbSet.serialize`. */
export interface ISerializeOptions<M extends NavigationMode = "stub"> {
  navigations?: M;
}

type SerializedValue<V, M extends NavigationMode> = V extends Date
  ? string
  : V extends readonly (infer U)[]
    ? SerializedValue<U, M>[]
    : V extends object
      ? "Id" extends keyof V
        ? M extends "full"
          ? SerializedEntity<V, "stub"> | { Id: number }
          : { Id: number }
        : { -readonly [K in keyof V]: SerializedValue<V[K], "stub"> }
      : V;

/**
 * An entity as plain, JSON-safe data with the entity's own keys: DateTimes as ISO
 * strings, Json shapes as plain objects, navigations as `{ Id }` stubs (or, with
 * `"full"`, loaded targets serialized one level deep). A navigation is recognised
 * by its target having an `Id` member.
 */
export type SerializedEntity<T, M extends NavigationMode = "stub"> = {
  -readonly [
    K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K
  ]: SerializedValue<T[K], M>;
};
