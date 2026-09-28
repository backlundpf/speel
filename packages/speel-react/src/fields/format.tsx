import type { ReactNode } from "react";
import DOMPurify from "dompurify";
import type { FieldConfig } from "@speel/core";

const EMPTY = "—"; // em dash for empty values

/** Rich text stores HTML; render it for real, sanitized. Everything scriptable is
 * stripped — SP sanitizes on save, but cached/seeded values never passed through SP. */
function richTextValue(value: unknown): ReactNode {
  const clean = DOMPurify.sanitize(String(value));
  if (clean.trim() === "") return EMPTY;
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function formatScalar(config: FieldConfig, value: unknown): ReactNode {
  switch (config.kind) {
    case "Text":
      if (config.richText) return richTextValue(value);
      return String(value);
    case "Boolean":
      return value ? "Yes" : "No";
    case "Number": {
      const n = Number(value);
      if (config.showAsPercentage) return `${Math.round(n * 100)}%`;
      const dp =
        typeof config.decimalPlaces === "number"
          ? config.decimalPlaces
          : undefined;
      return dp === undefined ? String(n) : n.toFixed(dp);
    }
    case "Currency":
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: config.currencyCode ?? "USD",
        minimumFractionDigits: config.decimalPlaces,
      }).format(Number(value));
    case "DateTime": {
      const d = value instanceof Date ? value : new Date(value as string);
      return config.displayFormat === "DateOnly"
        ? d.toLocaleDateString()
        : d.toLocaleString();
    }
    case "Choice": {
      const render = config.optionsRender ?? ((o: unknown) => String(o));
      if (config.multi && Array.isArray(value)) {
        return value.map((o) => String(render(o))).join(", ");
      }
      return String(render(value));
    }
    case "Lookup": {
      const label = (r: unknown): string =>
        String(
          (r as Record<string, unknown>)[config.displayField] ??
            (r as Record<string, unknown>)["Title"] ??
            "",
        );
      // A collection nav (e.g. an inverse `OwnedProjects`) formats as the joined labels of its children.
      if (Array.isArray(value))
        return value.map(label).filter(Boolean).join(", ");
      return value ? label(value) : "";
    }
    case "Json": {
      // The first visible property is the shape's own headline — the same idea as a
      // Lookup cell showing its target's display field. Joined for a multi value, so
      // table search, CSV export and print (which all read this text) stay useful.
      const headline = config.shape.properties.find((p) => p.visible !== false);
      if (!headline) return EMPTY;
      // formatScalar returns a ReactNode, which would need `nodeText` (../table/cellText)
      // to flatten. cellText.ts already imports formatFieldValue from this module, so
      // importing nodeText back here would be circular — the wrong direction. A shape's
      // headline property is one of the scalar kinds (Text, Number, Choice, ...), which
      // formatScalar renders as a plain string or number in the common case, so a narrow
      // local flatten covers it without duplicating cellText's general tree-walker. A
      // rich-text headline (an unusual choice for a headline field) would flatten to "".
      const flatten = (node: ReactNode): string =>
        typeof node === "string" || typeof node === "number"
          ? String(node)
          : "";
      const text = (o: unknown): string => {
        if (o === null || o === undefined) return "";
        const raw = (o as Record<string, unknown>)[headline.propertyName];
        // Guard emptiness ourselves: formatScalar is the renderer for values already
        // known non-empty (formatFieldValue's isEmpty check runs before it, not inside
        // it), and we're calling it directly here rather than through formatFieldValue.
        if (isEmpty(raw)) return "";
        return flatten(formatScalar(headline.config, raw));
      };
      const joined =
        config.multi && Array.isArray(value)
          ? value.map(text).filter(Boolean).join(", ")
          : text(value);
      // A Json value can be PRESENT (so `formatFieldValue`'s own `isEmpty` guard never
      // fires) and still say nothing — every element's headline unset. Answering ""
      // there would make it the one field kind whose empty display is a blank instead
      // of the placeholder every other empty cell and read-only field shows. `cellText`
      // maps the placeholder back to "" for export and search, so this costs those
      // nothing.
      return joined === "" ? EMPTY : joined;
    }
    default:
      return String(value);
  }
}

/** Format a field value for read-only display (view mode / read-only fields). */
export function formatFieldValue(
  config: FieldConfig,
  value: unknown,
): ReactNode {
  if (isEmpty(value)) return EMPTY;
  return formatScalar(config, value);
}
