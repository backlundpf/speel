import { useCallback, useLayoutEffect, useRef } from "react";
import type { ReturnFocusTarget } from "../adapter/SpeelUIAdapter.js";

/** What can take focus: enabled, reachable controls. */
export const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The elements inside `root` that Tab reaches, in document order. */
export function tabbablesIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0,
  );
}

/**
 * Focuses `target` without scrolling the page. A target that is gone (`body`, detached,
 * missing) is skipped, and focus the user moved elsewhere is left alone: the move happens
 * only when focus was inside the closing surface (`focusWasInside`) or is nowhere (`body`).
 */
export function returnFocusTo(
  target: HTMLElement | null | undefined,
  focusWasInside: boolean,
): void {
  if (!target || target === document.body || !target.isConnected) return;
  const active = document.activeElement;
  if (!focusWasInside && active !== null && active !== document.body) return;
  target.focus({ preventScroll: true });
}

export interface FocusReturnOptions {
  open: boolean;
  returnFocus?: ReturnFocusTarget | undefined;
}

/**
 * A surface's focus return, shared by the skins. It remembers what had focus in the
 * commit where `open` turns true — before the surface moves focus inside — and `restore`
 * sends focus back per `returnFocus`, never scrolling. The skin calls `restore` from its
 * own close-focus hook (Fluent's `onRestoreFocus`, Radix's `onCloseAutoFocus`) after
 * turning that hook's own restore off; a plain `.focus()` there scrolls the page to an
 * opener that is a tall container.
 */
export function useFocusReturn({ open, returnFocus }: FocusReturnOptions): {
  restore(focusWasInside: boolean): void;
} {
  const opener = useRef<HTMLElement | null>(null);
  const latest = useRef(returnFocus);
  latest.current = returnFocus;
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
  }, [open]);
  const restore = useCallback((focusWasInside: boolean) => {
    const rf = latest.current;
    const fallback = opener.current;
    opener.current = null;
    if (rf === false) return;
    const named = typeof rf === "function" ? rf() : rf;
    returnFocusTo(named ?? fallback, focusWasInside);
  }, []);
  return { restore };
}
