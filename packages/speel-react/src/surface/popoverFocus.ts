import { useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type {
  PopoverProps,
  PopoverTriggerProps,
} from "../adapter/SpeelUIAdapter.js";
import { useStableId } from "../fluent-v8/useStableId.js";
import { FOCUSABLE, returnFocusTo, tabbablesIn } from "./focusReturn.js";

export interface PopoverFocus {
  /** On the element wrapping the trigger: the popover anchors to it and focus returns into it. */
  anchorRef: RefObject<HTMLSpanElement>;
  /** The id for the content element (the `role="dialog"`) — the trigger's `aria-controls`. */
  contentId: string;
  /** The trigger, rendered: a node as-is, a function with its aria wiring. */
  renderTrigger(trigger: PopoverProps["trigger"]): ReactNode;
  /** On the content element: Tab past either end closes and returns to the trigger. */
  onContentKeyDown(e: KeyboardEvent<HTMLElement>): void;
  /** From the skin's close-focus hook, with that hook's own restore turned off. */
  restore(focusWasInside: boolean): void;
}

/**
 * A popover's keyboard and focus behaviour, shared by the skins. The content is laid out
 * at the end of the page, so Tab would walk out of it to the end of the document: Tab past
 * the last element (or Shift+Tab before the first) closes it instead. Every close returns
 * focus to the trigger itself — the first focusable element in the trigger wrapper —
 * rather than to whatever had focus at open, which differs by browser (Safari does not
 * focus a clicked button).
 */
export function usePopoverFocus({
  open,
  onOpenChange,
}: Pick<PopoverProps, "open" | "onOpenChange">): PopoverFocus {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const contentId = useStableId();
  const trigger = (): HTMLElement | null =>
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
  const triggerProps: PopoverTriggerProps = {
    ariaExpanded: open,
    ariaHasPopup: "dialog",
    ariaControls: open ? contentId : undefined,
  };
  return {
    anchorRef,
    contentId,
    renderTrigger: (t) => (typeof t === "function" ? t(triggerProps) : t),
    onContentKeyDown: (e) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const items = tabbablesIn(e.currentTarget);
      const active = document.activeElement;
      const atEdge =
        items.length === 0 ||
        (e.shiftKey
          ? active === items[0] || active === e.currentTarget
          : active === items[items.length - 1]);
      if (!atEdge) return;
      e.preventDefault();
      onOpenChange(false);
      returnFocusTo(trigger(), true);
    },
    restore: (focusWasInside) => returnFocusTo(trigger(), focusWasInside),
  };
}
