import { strToU8, zipSync } from "fflate";
import type { ResolvedColumn } from "./columns.js";
import { cellValue, isoDate } from "./cellText.js";
import { downloadBlob } from "./download.js";

/**
 * A minimal Office Open XML workbook: one sheet, inline strings, a bold header, dates as
 * dated serials. No shared-strings table, no theme — Excel, LibreOffice and Numbers open it
 * without the "format and extension don't match" warning that a SpreadsheetML `.xls` earns.
 */

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

const CONTENT_TYPES =
  XML_HEAD +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  XML_HEAD +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  XML_HEAD +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// cellXfs index 0 = default, 1 = bold (header), 2 = date. numFmt 164 is the first custom id;
// the built-in 14 would render in the viewer's locale order and read ambiguously.
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const HEADER_STYLE = 1;
const DATE_STYLE = 2;

export function escapeXml(s: string): string {
  return (
    s
      // XML 1.0 forbids these control characters (tab, LF and CR are legal); a pasted one would
      // otherwise make the whole workbook unreadable ("We found a problem with some content").
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** Excel's serial date: whole days since 1899-12-30 (the 1900 leap-year bug folded in).
 *  Local calendar date only — the same day `cellText` exports. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
export function excelSerial(d: Date): number {
  const dayUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dayUtc - EXCEL_EPOCH_UTC) / 86_400_000);
}

/** Column letters for a 0-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnRef(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel forbids `[ ] : * ? / \` in a sheet name and caps it at 31 characters. */
export function sheetNameFor(raw: string): string {
  const cleaned = raw
    .replace(/[[\]:*?/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned === "" ? "Sheet1" : cleaned;
}

type CellValue = string | number | Date | boolean;

function textLength(value: CellValue): number {
  if (value instanceof Date) return 10; // yyyy-mm-dd
  if (typeof value === "boolean") return 3; // "Yes"
  return String(value).length;
}

/** One `<c>` element, or nothing for an empty value — Excel treats an absent cell as blank. */
function cellXml(ref: string, value: CellValue, header: boolean): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return `<c r="${ref}"${header ? ` s="${HEADER_STYLE}"` : ""}><v>${value}</v></c>`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `<c r="${ref}" s="${DATE_STYLE}"><v>${excelSerial(value)}</v></c>`;
  }
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  if (text === "") return "";
  return (
    `<c r="${ref}"${header ? ` s="${HEADER_STYLE}"` : ""} t="inlineStr">` +
    `<is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
  );
}

/** The whole workbook as zip bytes, ready for a Blob. */
export function buildXlsx<T>(
  columns: readonly ResolvedColumn<T>[],
  rows: readonly T[],
  sheetName: string,
): Uint8Array {
  const widths = columns.map((c) => c.header.length);
  const lines: string[] = [];

  lines.push(
    `<row r="1">${columns
      .map((c, i) => cellXml(`${columnRef(i)}1`, c.header, true))
      .join("")}</row>`,
  );
  rows.forEach((row, r) => {
    const cells = columns.map((c, i) => {
      const v = cellValue(c, row);
      widths[i] = Math.max(widths[i]!, textLength(v));
      return cellXml(`${columnRef(i)}${r + 2}`, v, false);
    });
    lines.push(`<row r="${r + 2}">${cells.join("")}</row>`);
  });

  // Character widths, padded and clamped: a subject column should not run to the horizon.
  const cols = columns
    .map((_, i) => {
      const width = Math.min(60, Math.max(8, widths[i]! + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  // ECMA-376's CT_Cols requires at least one <col>: an all-hidden table would otherwise earn a
  // repair prompt, so the element is omitted when there is nothing to size.
  const sheet =
    XML_HEAD +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (columns.length > 0 ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${lines.join("")}</sheetData>` +
    `</worksheet>`;

  const workbook =
    XML_HEAD +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(sheetNameFor(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(ROOT_RELS),
      "xl/workbook.xml": strToU8(workbook),
      "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
      "xl/styles.xml": strToU8(STYLES),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    },
    { level: 6 },
  );
}

export function xlsxFileName(prefix: string, on: Date): string {
  return `${prefix}-${isoDate(on)}.xlsx`;
}

export function downloadXlsx(fileName: string, bytes: Uint8Array): void {
  // `slice()` re-backs the view with a plain ArrayBuffer, which is what Blob's typing wants.
  downloadBlob(
    fileName,
    new Blob([bytes.slice()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}
