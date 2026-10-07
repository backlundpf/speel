/** How narrow a user may drag a column. Below this a header is unreadable, not useful. */
export const MIN_RESIZE_WIDTH = 40;

/** The width of a column with neither a width nor a default of its own. */
const DEFAULT_WIDTH = 100;

/**
 * The width a column is actually held at: a live drag or a view/descriptor width when there is
 * one — the table hands those in as `width`, and they win as given. Otherwise the column's
 * default (its field kind's, from `TableColumn.defaultWidth`), raised to the header floor so
 * its longest header word fits.
 */
export function heldWidth(
  width: number | undefined,
  defaultWidth: number | undefined,
  floor: number,
): number {
  return width ?? Math.max(defaultWidth ?? DEFAULT_WIDTH, floor);
}

/**
 * `DetailsList`'s min/max bounds for a column held at `held`.
 *
 * `minWidth` must be a genuine floor, never the column's current width: `DetailsList` clamps
 * a resize drag to `minWidth`, so binding it to the current width means every drag raises the
 * column's own floor and the column can only ever grow.
 *
 * The held width rides in `maxWidth`, which is where the justified layout pass stops growing
 * a column — so every column gets its held width and no more, and only the last one absorbs
 * whatever the container has left over. A column with no `maxWidth` would swallow that slack
 * whole and starve the columns after it.
 */
export function columnBounds(held: number): {
  minWidth: number;
  maxWidth: number;
} {
  return { minWidth: Math.min(MIN_RESIZE_WIDTH, held), maxWidth: held };
}
