import type { ResolvedColumn } from "./columns.js";
import { cellText, isoDate } from "./cellText.js";
import { downloadBlob } from "./download.js";

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function csvField(text: string): string {
  // A leading =, +, -, or @ is executed as a formula by Excel — the standard CSV-injection
  // vector. Plain numbers are exempt so a negative number is not mangled into text.
  const guarded =
    FORMULA_PREFIX.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
  return NEEDS_QUOTING.test(guarded) || guarded !== guarded.trim()
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** The full CSV text for a set of rows, BOM included so Excel reads UTF-8 correctly. */
export function buildCsv<T>(
  columns: readonly ResolvedColumn<T>[],
  rows: readonly T[],
): string {
  const lines = [
    columns.map((c) => csvField(c.header)).join(","),
    ...rows.map((row) =>
      columns.map((c) => csvField(cellText(c, row))).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvFileName(prefix: string, on: Date): string {
  return `${prefix}-${isoDate(on)}.csv`;
}

export function downloadCsv(fileName: string, csv: string): void {
  downloadBlob(fileName, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}
