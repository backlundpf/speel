import type { FieldConfig } from "@speel/core";
import { useEntityFormContext } from "../form/useEntityForm.js";
import { useField } from "../form/useField.js";
import type { FieldHandle } from "../form/FieldHandle.js";
import { SpeelField } from "./SpeelField.js";

export interface EntityFieldsProps {
  /** Explicit ordered field/nav names; overrides the default (all-but-key/FK) set. */
  fields?: string[];
  /** Names to drop from the default set. */
  exclude?: string[];
}

/** A field spans the whole row only if it's a multiline (note) text field; every other
 *  field flows into the responsive column grid (see EntityFormBody). */
function isFullWidth(field: FieldHandle): boolean {
  const c = field.config as FieldConfig | undefined;
  return c?.kind === "Text" && c.multiline === true;
}

/** One grid cell: resolves the field, hides invisible ones (so they don't occupy a
 *  column slot), and lets note fields span the full row. */
function FieldCell({ name }: { name: string }): JSX.Element | null {
  const field = useField(name);
  if (!field.visible) return null;
  return (
    <div
      style={{
        minWidth: 0,
        ...(isFullWidth(field) ? { gridColumn: "1 / -1" } : {}),
      }}
    >
      <SpeelField field={field} />
    </div>
  );
}

/**
 * Headless: renders the surrounding entity form's field set as <SpeelField>s.
 * Default = every property (minus the key and any navigation's backing FK column)
 * in declaration order, then every navigation. In **create** mode read-only fields are
 * also dropped — they are server-managed (Created/Modified/Author/…) and empty on a new
 * item, so they would only render as blank read-only displays. An explicit `fields` list
 * overrides all of this. Per-field visibility/render overrides are handled inside
 * SpeelField/useField.
 */
export function EntityFields({
  fields,
  exclude,
}: EntityFieldsProps): JSX.Element {
  const { et, mode } = useEntityFormContext();
  let names: string[];
  if (fields) {
    names = fields;
  } else {
    const hideReadOnly = mode === "create";
    const fkColumns = new Set(
      et.navigations().map((n) => n.foreignKey.propertyName),
    );
    const props = et.properties
      .filter(
        (p) =>
          !p.key &&
          !fkColumns.has(p.propertyName) &&
          !(hideReadOnly && p.readOnly),
      )
      .map((p) => p.propertyName);
    const navs = et
      .navigations()
      .filter((n) => !(hideReadOnly && n.readOnly))
      .map((n) => n.name);
    names = [...props, ...navs];
  }
  if (exclude) {
    const drop = new Set(exclude);
    names = names.filter((n) => !drop.has(n));
  }
  return (
    <>
      {names.map((name) => (
        <FieldCell key={name} name={name} />
      ))}
    </>
  );
}
