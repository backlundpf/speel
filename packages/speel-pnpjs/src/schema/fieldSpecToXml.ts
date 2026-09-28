// A FieldSpec becomes one CAML <Field> definition, created in a single request
// via fields.createFieldAsXml. PnPjs's add* methods cannot set Required, display
// name, or Indexed, which would force a second write per field and make it
// depend on a field created earlier in the same $batch changeset.
import type { FieldSpec, SchemaSnapshot } from "@speel/migrations";

const bool = (b: boolean): string => (b ? "TRUE" : "FALSE");

export const xmlEsc = (s: string): string =>
  s.replace(
    /[<>&"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string,
  );

/** Ordered attribute bag; undefined values are dropped, `0` and `false` are not. */
type Attrs = Array<[string, string | number | undefined]>;

function render(attrs: Attrs, children: string): string {
  const body = attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${xmlEsc(String(v))}"`)
    .join("");
  return children.length > 0
    ? `<Field${body}>${children}</Field>`
    : `<Field${body} />`;
}

/** The CAML Type name plus its type-specific attributes and children. */
function typeParts(
  spec: FieldSpec,
  snapshot: SchemaSnapshot,
): { type: string; attrs: Attrs; children: string } {
  switch (spec.kind) {
    case "Text":
      return spec.multiline
        ? {
            type: "Note",
            attrs: [
              ["NumLines", spec.numberOfLines],
              [
                "RichText",
                spec.richText === undefined ? undefined : bool(spec.richText),
              ],
              ["RichTextMode", spec.richText === true ? "FullHtml" : undefined],
              [
                "AppendOnly",
                spec.appendOnly === undefined
                  ? undefined
                  : bool(spec.appendOnly),
              ],
            ],
            children: "",
          }
        : {
            type: "Text",
            attrs: [["MaxLength", spec.maxLength]],
            children: "",
          };
    case "Number":
      return {
        type: "Number",
        attrs: [
          ["Min", spec.min],
          ["Max", spec.max],
          [
            "Decimals",
            spec.decimalPlaces === "auto" ? undefined : spec.decimalPlaces,
          ],
          [
            "Percentage",
            spec.showAsPercentage === undefined
              ? undefined
              : bool(spec.showAsPercentage),
          ],
        ],
        children: "",
      };
    case "Currency":
      // No LCID: SharePoint's CurrencyLocaleId is a numeric locale id, not a
      // code like 'USD'. The column takes the site's default currency.
      return {
        type: "Currency",
        attrs: [
          ["Min", spec.min],
          ["Max", spec.max],
          ["Decimals", spec.decimalPlaces],
        ],
        children: "",
      };
    case "Boolean":
      return { type: "Boolean", attrs: [], children: "" };
    case "DateTime":
      return {
        type: "DateTime",
        attrs: [
          ["Format", spec.displayFormat],
          ["FriendlyDisplayFormat", spec.friendlyFormat],
        ],
        children: "",
      };
    case "Choice":
      return {
        type: spec.multi ? "MultiChoice" : "Choice",
        attrs: [
          ["Mult", spec.multi ? "TRUE" : undefined],
          ["FillInChoice", bool(spec.fillIn)],
          // MultiChoice has no display format — checkboxes are its only shape.
          ["Format", spec.multi ? undefined : spec.displayAs],
        ],
        children: `<CHOICES>${spec.choices
          .map((c) => `<CHOICE>${xmlEsc(c)}</CHOICE>`)
          .join("")}</CHOICES>`,
      };
    case "Lookup": {
      const target = snapshot.lists.get(spec.list);
      if (target === undefined) {
        throw new Error(
          `fieldSpecToXml: lookup target '${spec.list}' for field '${spec.internalName}' is not in the schema snapshot`,
        );
      }
      return {
        type: spec.multi ? "LookupMulti" : "Lookup",
        attrs: [
          ["Mult", spec.multi ? "TRUE" : undefined],
          ["List", `{${target.id}}`],
          ["ShowField", spec.showField],
        ],
        children: "",
      };
    }
    case "User":
      // No ShowField: SharePoint defaults a person column to ImnName, and
      // FieldSpecBuilder defaults showField to 'Title', so emitting it would
      // silently change how every person column renders.
      return {
        type: spec.multi ? "UserMulti" : "User",
        attrs: [
          ["Mult", spec.multi ? "TRUE" : undefined],
          ["UserSelectionMode", 1],
        ],
        children: "",
      };
  }
}

/** Pure translation: FieldSpec → the CAML `createFieldAsXml` takes. */
export function fieldSpecToXml(
  spec: FieldSpec,
  snapshot: SchemaSnapshot,
): string {
  const { type, attrs, children } = typeParts(spec, snapshot);
  return render(
    [
      ["Type", type],
      ["Name", spec.internalName],
      ["StaticName", spec.internalName],
      ["DisplayName", spec.displayName ?? spec.internalName],
      ["Required", bool(spec.required ?? false)],
      ["Indexed", bool(spec.indexed ?? false)],
      ["Description", spec.description],
      ...attrs,
    ],
    children,
  );
}
