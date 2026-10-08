import type { TableColumn } from "../../adapter/SpeelUIAdapter.js";
import type { FlexColumn } from "./resolveColumnWidths.js";

/** How narrow a user may drag a column, and the least the layout ever squeezes one to. */
export const MIN_RESIZE_WIDTH = 40;

/** The width of a column with neither a width nor a default of its own. */
const DEFAULT_BASIS = 100;

/**
 * One skin column as the resolver's flex item. A column with no width starts at its field
 * kind's default raised to its header floor, so its longest header word fits; an authored,
 * view or dragged width starts as given. Layout squeezes a column no further than its header
 * floor (never below the drag floor), unless the column sets its own `minWidth`.
 */
export function toFlexColumn(
  column: TableColumn,
  floor: number,
  padding: number,
): FlexColumn {
  const basis =
    column.width ?? Math.max(column.defaultWidth ?? DEFAULT_BASIS, floor);
  return {
    basis,
    grow: column.grow ?? 0,
    shrink: column.shrink ?? 0,
    min: column.minWidth ?? Math.min(basis, Math.max(floor, MIN_RESIZE_WIDTH)),
    max: column.maxWidth ?? Number.POSITIVE_INFINITY,
    padding,
  };
}
