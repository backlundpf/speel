import { MIN_RESIZE_WIDTH } from "../table/layout/columnFlex.js";

export { MIN_RESIZE_WIDTH };

/**
 * `DetailsList`'s min/max bounds for a column laid out at the resolved width `held`.
 *
 * `minWidth` must be a genuine floor, never the column's current width: `DetailsList` clamps
 * a resize drag to `minWidth`, so binding it to the current width means every drag raises the
 * column's own floor and the column can only ever grow.
 *
 * The resolved width rides in `maxWidth`, which is where the justified layout pass stops growing
 * a column — so every column gets its resolved width and no more. The pass would give any width
 * left over to the last column; `V8Table` leaves none, handing it a viewport exactly as wide as
 * the columns. A column with no `maxWidth` would swallow slack whole and starve the columns
 * after it.
 */
export function columnBounds(held: number): {
  minWidth: number;
  maxWidth: number;
} {
  return { minWidth: Math.min(MIN_RESIZE_WIDTH, held), maxWidth: held };
}
