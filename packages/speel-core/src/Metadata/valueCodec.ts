import { DataException } from "../errors.js";
import type { FieldConfig } from "./FieldConfig.js";
import type { IValueCodec } from "./Property.js";

/**
 * The kind's default wire pair — how a property's value is represented inside
 * speel's own JSON, the format a `Json` column holds. Fills only `toWire`/`fromWire`
 * on the merged `IValueCodec`; `Property`'s constructor layers the author's
 * `codec` (the provider pair) on top.
 *
 * This is NOT the provider's wire. A provider types the column it owns (and
 * `@speel/pnpjs` still does); a blob inside a Text column has no provider-defined
 * shape at all, so core defines one. The two are deliberately separate today; see
 * the spec's named debt.
 *
 * Absent means "JSON already represents this": strings, numbers, booleans.
 *
 * Only DateTime needs one today. A Choice deliberately gets none: its options may be
 * a thunk or a server-side loader, so nothing can be resolved synchronously, and core
 * does not map an option to its stored value in a column either — `optionsValue` is
 * the picker's key, and only the user's `codec` (its provider pair) runs on the
 * read/write path.
 */
export function codecFor(
  config: FieldConfig,
  propertyName: string,
): IValueCodec | undefined {
  switch (config.kind) {
    case "DateTime":
      return {
        toWire: (value) => {
          if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
              throw new DataException(
                `Property ${propertyName} received an invalid Date.`,
              );
            }
            return value.toISOString();
          }
          return passthrough(value);
        },
        fromWire: (raw) => {
          if (typeof raw === "string") {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) {
              throw new DataException(
                `Property ${propertyName} received unparseable date: "${raw}"`,
              );
            }
            return d;
          }
          return passthrough(raw);
        },
      };
    default:
      return undefined;
  }
}

/** null and undefined mean "no value" at every layer; nothing converts them. */
const passthrough = (v: unknown): unknown => v;
