// src/Query/IQuery.ts
import type { IEntity } from "../types.js";
import type { FilterBuilder } from "./FilterBuilder.js";
import type { FilterNode } from "./FilterNode.js";

/**
 * The entity behind a navigation selector's return: strips `| null | undefined` and
 * unwraps a collection navigation to its element, so a thenInclude selector operates
 * on what the preceding include actually loaded. Falls back to IEntity when the
 * selection is not an entity — including a scalar is a modeling error the runtime
 * reports; the types stay usable rather than collapsing to never.
 */
export type NavTarget<TProp> = (
  NonNullable<TProp> extends readonly (infer U)[] ? U : NonNullable<TProp>
) extends infer R
  ? R extends IEntity
    ? R
    : IEntity
  : never;

export interface IQuery<T extends IEntity> {
  where(predicate: (b: FilterBuilder<T>) => FilterNode): IQuery<T>;
  orderBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction?: "asc" | "desc",
  ): IQuery<T>;
  thenBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction?: "asc" | "desc",
  ): IQuery<T>;
  take(n: number): IQuery<T>;
  skip(n: number): IQuery<T>;
  asNoTracking(): IQuery<T>;
  /** Eager-load a reference/user navigation inline ($expand). Optional explicit child fields. */
  expand(selector: (e: T) => unknown, fields?: readonly string[]): IQuery<T>;
  toArrayAsync(): Promise<T[]>;
  firstOrDefaultAsync(): Promise<T | null>;
  singleOrDefaultAsync(): Promise<T | null>;
  countAsync(): Promise<number>;
  anyAsync(): Promise<boolean>;
}
