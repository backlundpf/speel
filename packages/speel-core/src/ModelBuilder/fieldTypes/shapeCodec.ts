import type { EntityType } from "../../Metadata/EntityType.js";
import type { IValueCodec } from "../../Metadata/Property.js";
import type { JsonFieldConfig } from "../../Metadata/FieldConfig.js";
import { DataException } from "../../errors.js";
import { buildValidations } from "../../Metadata/buildValidations.js";
import { collectErrors } from "../../Forms/resolve.js";

/** Keys the shape does not declare, kept so an older client cannot delete a newer one's field. */
const UNKNOWN_KEYS = Symbol("speelUnknownKeys");

/**
 * The Json property's codec: the whole column ↔ typed instances (its provider
 * pair — `toProvider`/`fromProvider` — only; a Json field's own wire pair is
 * meaningless, since IT is the column, not something living inside one).
 *
 * It is a `codec` rather than a branch in Materialize/PayloadBuilder because that
 * is the seam core already has for "a model value is not what the column holds" — so
 * the read path, the write path, the change tracker and the caches need no knowledge
 * of JSON at all.
 *
 * Takes the property's own `JsonFieldConfig` rather than an already-resolved
 * `EntityType`, and reads `config.shape` lazily, inside each closure, rather than
 * once up front: `Property.codec` is readonly, so this has to be built and
 * attached at Property-construction time (see JsonFieldBuilder), which is BEFORE
 * ModelBuilder.build() resolves `config.shape` in its pendingShapes pass. By the
 * time this codec actually runs — a query materializes a row, a save serializes
 * one — that pass has long since finished and `config.shape` is the real EntityType.
 */
export function shapeCodec(
  config: JsonFieldConfig,
  propertyName: string,
): IValueCodec {
  return {
    fromProvider: (raw) => {
      if (raw === null || raw === undefined || raw === "") return undefined;
      const parsed = parse(raw, propertyName);
      const shape = config.shape;
      if (!config.multi) {
        // A single property fed a list is a cardinality mismatch, not something
        // to make the best of: harvesting the array's elements as unknown keys
        // would answer an empty instance and then write `{"0":…,"1":…}` back
        // over the data on the next save.
        if (Array.isArray(parsed)) {
          throw new DataException(
            `${propertyName}: the column holds a JSON array, but the property holds one ${shape.ctor.name} — declare it with @MultiJsonField (isMultiJson) to read a list.`,
          );
        }
        return toInstance(shape, parsed, propertyName);
      }
      // Deliberately lenient the other way: a multi property whose column holds
      // a single object reads as a one-element list, so a column written before
      // the property became multi still loads.
      const elements = Array.isArray(parsed)
        ? // A null element is a hole in a list, not a broken column: skip it
          // rather than kill the whole query over one bad row. Anything else
          // that is not an object still raises, below, by name.
          parsed.filter((o) => o !== null)
        : [parsed];
      return elements.map((o) => toInstance(shape, o, propertyName));
    },
    toProvider: (value) => {
      if (value === null || value === undefined) return null;
      const shape = config.shape;
      if (config.multi && !Array.isArray(value)) {
        throw new DataException(
          `${propertyName}: a multi Json property holds an array of ${shape.ctor.name}, not a single value.`,
        );
      }
      const plain = config.multi
        ? (value as unknown[]).map((v) => toPlain(shape, v))
        : toPlain(shape, value);
      return JSON.stringify(plain);
    },
  };
}

/**
 * A shape instance with `patch` applied, as a NEW instance.
 *
 * An editor cannot mutate in place: dirty detection compares structurally, so an
 * in-place edit leaves the row looking clean and the change unsaved. And it cannot
 * use `Object.assign`, which copies own ENUMERABLE keys — the unknown-key bag is
 * deliberately non-enumerable, so assigning would delete a newer app version's
 * field the moment someone edits the row. This carries the bag across; the symbol
 * never leaves this module.
 *
 * A patch value of `undefined` removes the key rather than storing an own
 * `undefined`, so a cleared field reads as absent, the way a load leaves it.
 */
export function patchShapeInstance<T>(
  shape: EntityType,
  instance: T,
  patch: Record<string, unknown>,
): T {
  const source = instance as unknown as Record<string, unknown>;
  const next = new (shape.ctor as new () => Record<string, unknown>)();
  for (const p of shape.properties) {
    const name = p.propertyName;
    const value = name in patch ? patch[name] : source[name];
    if (value === undefined) delete next[name];
    else next[name] = value;
  }
  const carried = (source as Record<symbol, unknown>)[UNKNOWN_KEYS];
  if (carried !== undefined) {
    Object.defineProperty(next, UNKNOWN_KEYS, {
      value: carried,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
  return next as unknown as T;
}

/**
 * What is wrong with a Json property's value, as messages for the field that holds
 * it. A nested field validates and shows its own message, but the parent form never
 * sees that state — without this a form would save a shape whose required property
 * is empty.
 */
export function shapeValueErrors(
  shape: EntityType,
  value: unknown,
  multi: boolean,
): string[] {
  if (value === null || value === undefined) return [];
  const elements = multi ? (value as unknown[]) : [value];
  let bad = 0;
  for (const element of elements) {
    if (element === null || element === undefined) continue;
    if (elementErrors(shape, element as Record<string, unknown>).length > 0)
      bad++;
  }
  if (bad === 0) return [];
  return multi
    ? [`${bad} of ${elements.length} need attention.`]
    : ["Some fields need attention."];
}

function elementErrors(
  shape: EntityType,
  element: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const p of shape.properties) {
    const rules = buildValidations({
      config: p.config,
      required: p.required === true,
      displayName: p.displayName,
      customValidations: p.customValidations,
    });
    const ctx = {
      values: element,
      value: element[p.propertyName],
      mode: "edit" as const,
    };
    out.push(...collectErrors(rules, ctx));
  }
  return out;
}

function parse(raw: unknown, propertyName: string): unknown {
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new DataException(
      `${propertyName}: the column does not hold valid JSON.`,
    );
  }
}

/** Wire (parsed JSON) → a fresh instance of the shape: codec.fromWire, then codec.fromProvider. */
function toInstance(
  shape: EntityType,
  raw: unknown,
  propertyName: string,
): unknown {
  // JSON holds nulls, numbers and strings too, and the column is written by
  // whoever last saved the row — so "is this even an object?" is a data
  // question, answered here by name rather than by a TypeError three frames
  // down with no property in it.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DataException(
      `${propertyName}: the column does not hold an object for ${shape.ctor.name} (found ${describe(raw)}).`,
    );
  }
  const source = raw as Record<string, unknown>;
  const instance = new shape.ctor() as unknown as Record<string, unknown>;
  const known = new Set<string>();
  for (const p of shape.properties) {
    known.add(p.propertyName);
    const stored = source[p.propertyName];
    // A declared class field is its own enumerable property the moment `new
    // shape.ctor()` runs, `undefined`-valued whether or not the decorator
    // initializes it — so an absent key must be `delete`d, not merely skipped,
    // or it would survive as an own `undefined` property (visible to
    // Object.keys, invisible only to JSON.stringify's own undefined-skipping).
    if (stored === undefined) {
      delete instance[p.propertyName];
      continue;
    }
    const decoded = p.codec?.fromWire ? p.codec.fromWire(stored) : stored;
    // Per element for arrays — exactly what Materialize.item does with a
    // column's own value, so a multi-Choice property with a codec reads
    // the same inside a shape as it does in a column of its own.
    const fromProvider = p.codec?.fromProvider;
    const value = fromProvider
      ? Array.isArray(decoded)
        ? decoded.map((x) => fromProvider(x))
        : fromProvider(decoded)
      : decoded;
    if (value !== undefined) {
      instance[p.propertyName] = value;
    } else {
      delete instance[p.propertyName];
    }
  }
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    if (known.has(k)) continue;
    // Never an array index. A row written by an older build that harvested an
    // array into `{"0":…,"1":…}` would otherwise carry that residue forward on
    // every save; and an index is never a field a newer client added.
    if (/^\d+$/.test(k)) continue;
    unknown[k] = v;
  }
  if (Object.keys(unknown).length > 0) {
    Object.defineProperty(instance, UNKNOWN_KEYS, {
      value: unknown,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
  return instance;
}

/** An instance of the shape → wire (a plain object to JSON.stringify): codec.toProvider, then codec.toWire. */
function toPlain(shape: EntityType, value: unknown): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const p of shape.properties) {
    const model = source[p.propertyName];
    if (model === undefined) continue;
    // Per element for arrays — the mirror of the read above, and of
    // PayloadBuilder.toProviderValue, which applies a codec element-wise
    // to an array-valued column.
    const toProvider = p.codec?.toProvider;
    const converted = toProvider
      ? Array.isArray(model)
        ? model.map((x) => toProvider(x))
        : toProvider(model)
      : model;
    out[p.propertyName] = p.codec?.toWire
      ? p.codec.toWire(converted)
      : converted;
  }
  // Keys the shape doesn't declare, carried since the read that produced this
  // instance — write them back untouched so an older client can't erase them.
  const carried = (source as Record<symbol, unknown>)[UNKNOWN_KEYS] as
    Record<string, unknown> | undefined;
  return carried ? { ...carried, ...out } : out;
}

/** What a blob actually held, for an error a reader can act on. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
