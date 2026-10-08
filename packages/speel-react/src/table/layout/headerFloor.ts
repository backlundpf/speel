import type { TableColumn } from "../../adapter/SpeelUIAdapter.js";

/** What a skin's header puts around its label text, in pixels. */
export interface HeaderRoom {
  /** Horizontal padding of the (sort) label. */
  label: number;
  /** A space and the sort arrow after the last word. */
  sortArrow: number;
  /** The filter button and the gap before it. */
  filterButton: number;
}

/**
 * The narrowest a column held at its default may be: its longest header word, plus what the
 * skin's header puts around it. A defaulted Boolean titled "Separation Date" gets room for
 * "Separation" instead of 70px. Authored, view and dragged widths never consult this, and a
 * header that is content rather than text has nothing to measure.
 */
export function headerFloor(
  column: TableColumn,
  sortLabel: boolean,
  measure: (text: string) => number,
  room: HeaderRoom,
): number {
  if (column.headerContent !== undefined) return 0;
  const filter = column.headerFilter ? room.filterButton : 0;
  const words = column.header.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return filter;
  const longest = Math.max(...words.map(measure));
  return Math.ceil(
    longest + room.label + (sortLabel ? room.sortArrow : 0) + filter,
  );
}

interface TextContext {
  font: string;
  measureText(text: string): { width: number };
}
type OffscreenCanvasCtor = new (
  width: number,
  height: number,
) => { getContext(kind: "2d"): TextContext | null };

const measurers = new Map<string, (text: string) => number>();

/**
 * Measures text in `font` (a CSS font shorthand), cached per font. Uses `OffscreenCanvas`
 * where the browser has one; elsewhere — jsdom, old browsers — estimates 0.6em a character,
 * which is close enough for a floor and needs no canvas in tests.
 */
export function textMeasurer(
  font: string,
  fontSizePx: number,
): (text: string) => number {
  const cached = measurers.get(font);
  if (cached) return cached;
  const OC = (globalThis as { OffscreenCanvas?: OffscreenCanvasCtor })
    .OffscreenCanvas;
  const ctx = OC ? new OC(1, 1).getContext("2d") : null;
  let measure: (text: string) => number;
  if (ctx) {
    ctx.font = font;
    measure = (text) => ctx.measureText(text).width;
  } else {
    measure = (text) => text.length * 0.6 * fontSizePx;
  }
  measurers.set(font, measure);
  return measure;
}
