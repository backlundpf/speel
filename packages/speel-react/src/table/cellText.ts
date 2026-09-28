import { isValidElement, type ReactElement, type ReactNode } from "react";
import { formatFieldValue } from "../fields/format.js";
import type { ResolvedColumn } from "./columns.js";

/** What `formatFieldValue` renders for an empty value — an empty cell in a spreadsheet. */
const EMPTY_PLACEHOLDER = "—";

/**
 * The text a rendered cell displays, read from the element tree rather than the DOM.
 *
 * The DOM is not an option: v8's DetailsList virtualises rows, so only the on-screen window
 * exists in the document, while export and search must cover the whole set. Walking the tree
 * needs no render pass and no mount — its limit is a cell whose text lives inside a custom
 * component, whose output does not exist until it renders. `cellText` covers that case.
 */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node))
    return node.map((n) => nodeText(n as ReactNode)).join("");
  if (isValidElement(node)) {
    return nodeText(
      (node as ReactElement<{ children?: ReactNode }>).props.children,
    );
  }
  return "";
}

export function isoDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(scalarText).join(", ");
  return String(v);
}

/**
 * The text one cell says, most specific source first — what export writes, print prints,
 * and search reads.
 *
 * The rendered node is read *before* the raw field value on purpose: a masked column is keyed
 * to a field but renders a substituted value, and exporting the raw value there would put the
 * unmasked one in a spreadsheet.
 */
export function cellText<T>(col: ResolvedColumn<T>, row: T): string {
  if (col.exportValue) return scalarText(col.exportValue(row));

  const walked = nodeText(col.render(row)).trim();
  if (walked === EMPTY_PLACEHOLDER) return "";
  if (walked !== "") return walked;

  if (col.field) {
    const formatted = nodeText(
      formatFieldValue(col.field.config, col.field.raw(row)),
    ).trim();
    return formatted === EMPTY_PLACEHOLDER ? "" : formatted;
  }
  if (col.filter) return scalarText(col.filter.getValue(row));
  if (col.sortAccessor) return scalarText(col.sortAccessor(row));
  return "";
}

/**
 * The typed value one cell exports — what a spreadsheet cell should HOLD, not just say.
 *
 * A column's `exportValue` wins as-is: a number stays a number, a Date a date, so Excel can
 * sum and sort them. Every other source goes through `cellText`, since text is all a
 * rendered node can offer. CSV keeps reading `cellText`; only the xlsx writer needs types.
 */
export function cellValue<T>(
  col: ResolvedColumn<T>,
  row: T,
): string | number | Date | boolean {
  if (col.exportValue) {
    const v = col.exportValue(row);
    return v === null || v === undefined ? "" : v;
  }
  return cellText(col, row);
}
