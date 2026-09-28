import type { EntityTypeBuilder } from "./EntityTypeBuilder.js";

// Polyfill Symbol.metadata for the Stage-3 decorator metadata channel.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for("Symbol.metadata");

export const ENTITY_META = Symbol("speel.entity-metadata");

/** A member-applier: replays one decorator's intent onto the entity's builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldApplier = (eb: EntityTypeBuilder<any>) => void;

/**
 * A member-applier with the inheritance depth of the class that declared it: 0 is
 * the entity's own class, 1 its parent, 2 the grandparent... The builder stamps
 * each member with it and emits members in depth order — an entity's own columns
 * first, inherited ones (a base class's system members) last.
 */
export interface DecoratorApplier {
  apply: FieldApplier;
  depth: number;
}

/**
 * The value type a decorated property may be declared as. `undefined` is admitted
 * alongside `null` because a `readOnly` member has no other legal declaration:
 * DbSet.add() rejects any read-only property that already holds a value, so
 * `public FileSize?: number = undefined` is the only form that both compiles and
 * inserts. (SpeelEntity's own system members — Created, Author, ... — are decorated
 * and declared exactly that way.) The fluent path has always been undefined-tolerant —
 * PropertyBuilderFor strips it via NonNullable, and the hasOne/hasMany selectors
 * name it outright — so this is the decorator path reaching parity, not a new
 * looseness. Pinning `| null` per-decorator bought nothing the runtime doesn't
 * already enforce: on insert, undefined and null are both simply omitted.
 */
export type DecoratedValue<T> = T | null | undefined;

/** Per-entity metadata accumulated by field (and, later, navigation) decorators. */
export interface EntityMetadata {
  propertyBuilders: Map<string, FieldApplier>;
}

export function emptyEntityMeta(): EntityMetadata {
  return { propertyBuilders: new Map() };
}

/** Record a member-applier on the decorated class's own metadata slot, keyed by member name. */
export function recordField(
  context: { name: string | symbol; metadata: unknown },
  apply: FieldApplier,
): void {
  ownEntityMeta(context.metadata as object).propertyBuilders.set(
    context.name as string,
    apply,
  );
}

/** This class's own metadata slot, created on first use. No forking of inherited slots: inheritance is resolved by walking the constructor chain (see decoratorAppliersOf). */
export function ownEntityMeta(metadata: object): EntityMetadata {
  const slots = metadata as Record<symbol, EntityMetadata | undefined>;
  if (!Object.prototype.hasOwnProperty.call(slots, ENTITY_META)) {
    slots[ENTITY_META] = emptyEntityMeta();
  }
  return slots[ENTITY_META]!;
}

/**
 * The field appliers recorded on `ctor` and every base class, base first, in
 * declaration order, merged by member name so a subclass's re-declaration
 * replaces the base's; each carries the inheritance depth of the level that
 * declared it (the surviving, most-derived one). Reads each class's OWN
 * `[Symbol.metadata]` slot: TS's emit prototype-links a subclass's metadata to
 * its base's, while SWC's does so only for class-decorated classes and gives a
 * field-only class a null-prototype metadata object, so the chain is walked on
 * the constructors, never on the metadata objects. `ownMeta` is the class's
 * metadata while its class decorator runs — the slot is assigned only after
 * decoration completes, so `@Entity` passes `context.metadata` — and is depth 0.
 */
export function decoratorAppliersOf(
  ctor: Function,
  ownMeta?: object,
): readonly DecoratorApplier[] {
  const sym = (Symbol as { metadata?: symbol }).metadata!;
  const levels: { slot: EntityMetadata; depth: number }[] = [];
  const slotOf = (holder: object): EntityMetadata | undefined =>
    Object.prototype.hasOwnProperty.call(holder, ENTITY_META)
      ? (holder as Record<symbol, EntityMetadata>)[ENTITY_META]
      : undefined;
  let depth = 0;
  if (ownMeta) {
    const own = slotOf(ownMeta);
    if (own) levels.push({ slot: own, depth });
    depth++;
  }
  // Every constructor level counts toward depth, decorated or not.
  for (
    let c: Function | null = ownMeta ? Object.getPrototypeOf(ctor) : ctor;
    c && c !== Function.prototype;
    c = Object.getPrototypeOf(c), depth++
  ) {
    if (!Object.prototype.hasOwnProperty.call(c, sym)) continue;
    const meta = (c as unknown as Record<symbol, object | undefined>)[sym];
    const slot = meta ? slotOf(meta) : undefined;
    if (slot) levels.push({ slot, depth });
  }
  levels.reverse(); // base first
  // Merge by member name: a subclass re-declaring an inherited member replaces
  // the base's applier outright (PropertyBuilder treats a same-type
  // re-declaration as idempotent and would keep the base's options) and takes
  // that subclass's depth AND its declaration position — delete-then-set moves
  // the key to the end, so the member emits where the subclass declared it, in
  // order with the subclass's other members, not where the base first did.
  const merged = new Map<string, DecoratorApplier>();
  for (const { slot, depth } of levels) {
    for (const [name, apply] of slot.propertyBuilders) {
      merged.delete(name);
      merged.set(name, { apply, depth });
    }
  }
  return [...merged.values()];
}
