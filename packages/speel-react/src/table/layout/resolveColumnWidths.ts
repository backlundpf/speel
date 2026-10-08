import type { TableLength } from "../../adapter/SpeelUIAdapter.js";

/** One column as the resolver sees it — CSS flex item terms, in content pixels. */
export interface FlexColumn {
  /** The width the column starts from (CSS `flex-basis`), padding excluded. */
  basis: number;
  /** Share of spare width (CSS `flex-grow`). 0 = never grows. */
  grow: number;
  /** Share of a shortfall, scaled by `basis` as CSS does (`flex-shrink`). 0 = never shrinks. */
  shrink: number;
  /** Narrowest the layout may make the column. */
  min: number;
  /** Widest the layout may make the column; `Infinity` when unbounded. */
  max: number;
  /** The skin's horizontal cell padding, outside the content width. */
  padding: number;
}

/** The table's own width constraints — CSS `min-width` / `width` / `max-width`. */
export interface TableBounds {
  minWidth?: TableLength;
  width?: TableLength;
  maxWidth?: TableLength;
}

export interface ColumnLayout {
  /** Each column's content width, in whole pixels. */
  widths: number[];
  /** The table's outer width. Wider than the columns when nothing can grow into a set width;
   *  narrower than them when their minimums overflow it (the skin scrolls). */
  tableWidth: number;
}

/** A length in pixels; a percentage of the container, or nothing while it is unmeasured. */
function resolveLength(
  length: TableLength | undefined,
  container: number,
): number | undefined {
  if (length === undefined) return undefined;
  if (typeof length === "number") return length;
  if (container <= 0) return undefined;
  return (parseFloat(length) / 100) * container;
}

/** CSS clamp order: `min` wins over `max`. */
const clamp = (v: number, min: number, max: number): number =>
  Math.max(Math.min(v, max), min);

/**
 * Column widths the way CSS flexbox sizes flex items (Flexbox §9.7, "resolve the flexible
 * lengths"), so a table can be bounded and its columns can grow and shrink like CSS.
 *
 * The table's target width is `clamp(width ?? sum of bases, minWidth, maxWidth)`. The space
 * between that and the bases is handed out by `grow` (or taken back by `shrink × basis`); a
 * column that would cross its own `min`/`max` is frozen there and the remainder redistributed,
 * until nothing moves. Widths are whole pixels that add up exactly.
 */
export function resolveColumnWidths(
  columns: readonly FlexColumn[],
  bounds: TableBounds,
  containerWidth: number,
): ColumnLayout {
  const padding = columns.reduce((sum, c) => sum + c.padding, 0);
  const base = columns.map((c) => clamp(c.basis, c.min, c.max));
  const outerBases = base.reduce((sum, w) => sum + w, 0) + padding;
  const target = clamp(
    resolveLength(bounds.width, containerWidth) ?? outerBases,
    resolveLength(bounds.minWidth, containerWidth) ?? 0,
    resolveLength(bounds.maxWidth, containerWidth) ?? Number.POSITIVE_INFINITY,
  );
  const available = target - padding;
  const initialFree = available - base.reduce((sum, w) => sum + w, 0);
  const growing = initialFree > 0;
  const factor = (i: number): number => {
    const c = columns[i]!;
    return growing ? c.grow : c.shrink * base[i]!;
  };

  const size = [...base];
  const frozen = columns.map((_, i) => initialFree === 0 || factor(i) === 0);
  while (frozen.some((f) => !f)) {
    const open = columns.map((_, i) => i).filter((i) => !frozen[i]);
    const used = columns.reduce(
      (sum, _, i) => sum + (frozen[i] ? size[i]! : base[i]!),
      0,
    );
    let free = available - used;
    // Flex factors summing below 1 take only that fraction of the initial free space (CSS).
    const factorSum = open.reduce((sum, i) => sum + factor(i), 0);
    if (growing) {
      const growSum = open.reduce((sum, i) => sum + columns[i]!.grow, 0);
      if (growSum < 1 && Math.abs(initialFree * growSum) < Math.abs(free))
        free = initialFree * growSum;
    }
    const step = open.map((i) => {
      const wanted = base[i]! + free * (factor(i) / factorSum);
      return {
        i,
        wanted,
        fixed: clamp(wanted, columns[i]!.min, columns[i]!.max),
      };
    });
    const violation = step.reduce((sum, s) => sum + (s.fixed - s.wanted), 0);
    for (const { i, wanted, fixed } of step) {
      size[i] = fixed;
      // Total violation decides who freezes: all (none), min-violators (> 0), max-violators (< 0).
      if (
        violation === 0 ||
        (violation > 0 && fixed > wanted) ||
        (violation < 0 && fixed < wanted)
      )
        frozen[i] = true;
    }
  }

  const widths = roundPreservingSum(size);
  const columnsWidth = widths.reduce((sum, w) => sum + w, 0) + padding;
  return { widths, tableWidth: Math.max(Math.round(target), columnsWidth) };
}

/** Whole pixels whose sum is the rounded sum of `sizes` (largest-remainder method). */
function roundPreservingSum(sizes: readonly number[]): number[] {
  const floors = sizes.map(Math.floor);
  let missing =
    Math.round(sizes.reduce((sum, s) => sum + s, 0)) -
    floors.reduce((sum, f) => sum + f, 0);
  const byRemainder = sizes
    .map((s, i) => ({ i, r: s - Math.floor(s) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i] = floors[i]! + 1;
    missing--;
  }
  return floors;
}
