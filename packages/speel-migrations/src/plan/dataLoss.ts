import type { FieldSpec } from "../FieldSpec.js";
import type { SchemaSnapshot } from "../schema/SchemaSnapshot.js";
import type { PlanStep } from "./PlanTypes.js";

/**
 * The SharePoint type name (`TypeAsString`) a spec creates — what a live
 * schema read reports for the column, so the two can be compared.
 */
export function spFieldTypeOf(spec: FieldSpec): string {
  switch (spec.kind) {
    case "Text":
      return spec.multiline ? "Note" : "Text";
    case "Choice":
      return spec.multi ? "MultiChoice" : "Choice";
    case "Lookup":
      return spec.multi ? "LookupMulti" : "Lookup";
    case "User":
      return spec.multi ? "UserMulti" : "User";
    case "Number":
    case "Currency":
    case "Boolean":
    case "DateTime":
      return spec.kind;
  }
}

/** Type changes that keep every existing value. Anything else may lose data. */
const WIDENS: Readonly<Record<string, readonly string[]>> = {
  Text: ["Note"],
  Number: ["Currency", "Text", "Note"],
  Currency: ["Number", "Text", "Note"],
  Boolean: ["Text", "Note"],
  DateTime: ["Text", "Note"],
  Choice: ["MultiChoice", "Text", "Note"],
  MultiChoice: ["Note"],
  Lookup: ["LookupMulti"],
  User: ["UserMulti"],
};

const MULTI_TO_SINGLE: Readonly<Record<string, string>> = {
  MultiChoice: "Choice",
  LookupMulti: "Lookup",
  UserMulti: "User",
};

/**
 * Why converting a `fromType` column to `to` may lose data, or undefined when
 * the conversion keeps every value (including when the type does not change).
 * Only type changes are judged — a shorter `maxLength` or a removed choice on
 * the same type is not detected.
 */
export function alterFieldDataLoss(
  fromType: string,
  to: FieldSpec,
): string | undefined {
  const toType = spFieldTypeOf(to);
  if (fromType === toType) return undefined;
  if (WIDENS[fromType]?.includes(toType) === true) return undefined;
  const what = `Converting ${to.internalName} from ${fromType} to ${toType}`;
  if (fromType === "Note" && toType === "Text") {
    return `${what} truncates existing values to 255 characters.`;
  }
  if (MULTI_TO_SINGLE[fromType] === toType) {
    return `${what} may drop values from items that hold more than one.`;
  }
  return `${what} may lose existing values that do not convert.`;
}

/**
 * Set `warning` on every alterField step in `steps` that may lose data, judged
 * against the column type the plan would leave behind at that point: the live
 * type from `snapshot`, moved along by earlier add/alter/drop steps in the plan.
 * A column the plan cannot place is left unjudged.
 */
export function annotateDataLoss(
  snapshot: SchemaSnapshot,
  steps: PlanStep[],
): void {
  const key = (list: string, field: string): string => `${list}\u0000${field}`;
  const types = new Map<string, string>();
  for (const [title, list] of snapshot.lists) {
    for (const [name, f] of list.fields) {
      types.set(key(title, name), f.typeAsString);
    }
  }
  for (const step of steps) {
    const { op } = step;
    if (op.op === "addField") {
      types.set(key(op.list, op.field.internalName), spFieldTypeOf(op.field));
    } else if (op.op === "dropField") {
      types.delete(key(op.list, op.name));
    } else if (op.op === "alterField") {
      const k = key(op.list, op.field.internalName);
      const from = types.get(k);
      const warning =
        from === undefined ? undefined : alterFieldDataLoss(from, op.field);
      if (warning !== undefined) step.warning = warning;
      types.set(k, spFieldTypeOf(op.field));
    }
  }
}
