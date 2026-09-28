import { cellText } from "./cellText.js";
import type { ResolvedColumn } from "./columns.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A self-contained print document for one set of rows — pure, so it is testable without a
 * window. Cells go through `cellText`, the same reader CSV export uses, so `exportValue`
 * overrides and masked-column safety behave identically in both exports. The styling is
 * deliberately unthemed: this is print media, black on white.
 */
export function buildPrintHtml<T>(
  title: string,
  columns: readonly ResolvedColumn<T>[],
  rows: readonly T[],
  generatedAt: Date,
): string {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(cellText(c, r))}</td>`).join("")}</tr>`,
    )
    .join("");
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:sans-serif;color:#000;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:4px 8px;text-align:left;vertical-align:top}h1{font-size:18px}p{font-size:12px;color:#333}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>Generated ${escapeHtml(generatedAt.toLocaleString())}</p>`,
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    "</body></html>",
  ].join("");
}
