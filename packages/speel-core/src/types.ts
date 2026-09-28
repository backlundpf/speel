// src/types.ts

/** Marker interface for entity classes. Every entity must have a number `Id` property. */
export interface IEntity {
  Id?: number;
}

/** Constructor type for entity classes. */
export type EntityCtor<T extends IEntity = IEntity> = new () => T;

/** Internal: SP list addressing options. */
export type IListHandle =
  { kind: "title"; value: string } | { kind: "id"; value: string };

/** Result of DbContextOptionsBuilder.options — immutable. */
export interface IDbContextOptions {
  readonly provider: import("./providers/ISharePointProvider.js").IStorageProvider;
  readonly cache?: import("./Cache/ICacheProvider.js").ICacheProvider;
}

/** The form lifecycle mode threaded into field-state predicates. ('table-view' = a row cell in a data table.) */
export type FormMode = "create" | "edit" | "view" | "table-view";

/**
 * Context for every field-state predicate, validation, and render override.
 * `values` is a plain snapshot keyed by propertyName (NOT the entity instance),
 * so a draft-owning form engine's values flow in directly.
 */
export interface FieldContext<TValues = unknown, TValue = unknown> {
  readonly values: TValues;
  readonly value: TValue;
  readonly mode: FormMode;
}

/** Adds the candidate option for choice availability filtering. */
export interface OptionContext<
  TValues = unknown,
> extends FieldContext<TValues> {
  readonly option: unknown;
}

/** A field-state predicate: evaluate against the values snapshot (and mode). */
export type FieldStateFn<T = unknown> = (ctx: FieldContext<T>) => boolean;
