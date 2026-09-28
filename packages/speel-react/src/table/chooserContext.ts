import { createContext } from "react";
import type { ArrangedColumn, ColumnState } from "./columnState.js";

/**
 * The table's column arrangement, offered to whatever lives in the toolbar slot. The slot
 * is an opaque ReactNode, so this context is the only channel by which the view picker can
 * host "Choose columns" inside its own menu.
 */
export interface ColumnChooserAccess {
  arranged: readonly ArrangedColumn<never>[];
  onChange: (next: ColumnState) => void;
  /** A consumer that renders the chooser itself calls this (in a layout effect) so the
   *  table drops its standalone button. Returns the release for unmount. */
  adopt: () => () => void;
}

/** Provided by `SpeelTable` only when its `columnChooser` prop is set. */
export const ColumnChooserContext = createContext<
  ColumnChooserAccess | undefined
>(undefined);
