/** How narrow a user may drag a column. Below this a header is unreadable, not useful. */
export const MIN_RESIZE_WIDTH = 40;

/** The width a column that has never been given one is laid out at — enough to read a header. */
const DEFAULT_WIDTH = 100;

/**
 * The width a column is actually held at: a live drag width or a view/descriptor width when
 * there is one, else the default. The table hands the first two in as `width`.
 */
export function heldWidth(width: number | undefined): number {
  return width ?? DEFAULT_WIDTH;
}

/**
 * `DetailsList`'s min/max bounds for one column.
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
export function columnBounds(width: number | undefined): {
  minWidth: number;
  maxWidth: number;
} {
  const held = heldWidth(width);
  return { minWidth: Math.min(MIN_RESIZE_WIDTH, held), maxWidth: held };
}
