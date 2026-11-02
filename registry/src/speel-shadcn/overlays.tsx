import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  panelMaxWidth,
  useModalFrame,
  useFocusReturn,
  usePopoverFocus,
  useResizable,
} from "@speel/react";
import type {
  DialogProps,
  DrawerProps,
  PopoverProps,
  MenuItem,
  MenuProps,
} from "@speel/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useStableId } from "./compat";
import { iconFor } from "./icons";

const SHEET_WIDTH = { small: 420, medium: 640, large: 880 } as const;

/**
 * A menu, not a popover full of buttons: radix supplies roles, arrow-key navigation, and
 * typeahead, and the checkbox item reserves its indicator gutter so unchecked siblings stay
 * aligned. Sections render as a label plus a separator between runs.
 */
export function ShadMenu(p: MenuProps): ReactElement {
  return (
    <DropdownMenu open={p.open} onOpenChange={p.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <span className="inline-flex">{p.trigger as ReactNode}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="speel-shadcn">
        {p.sections.map((section, i) => (
          <div key={section.key}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {section.title !== undefined ? (
              <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
            ) : null}
            {section.items.map((item) => (
              <MenuEntry key={item.key} item={item} />
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One menu item. With a tooltip it follows Button.tooltip's contract: a Radix tooltip on
 * hover and focus, a screen-reader copy as its description, and — when disabled — it
 * stays in the roving focus (Radix skips `disabled` items) as `aria-disabled`, ignoring
 * selection, so the reason can still be read.
 */
function MenuEntry({ item }: { item: MenuItem }): ReactElement {
  const tipId = useStableId();
  const Icon = item.iconName !== undefined ? iconFor(item.iconName) : undefined;
  const tipped = item.tooltip !== undefined;
  const softDisabled = tipped && !!item.disabled;
  const common = {
    disabled: !!item.disabled && !tipped,
    onSelect: (e: Event) => {
      if (softDisabled) {
        e.preventDefault();
        return;
      }
      item.onClick?.();
    },
    ...(tipped ? { "aria-describedby": tipId } : {}),
    ...(softDisabled ? { "aria-disabled": true, className: "opacity-50" } : {}),
    children: (
      <>
        {Icon ? <Icon className="size-4" /> : null}
        {item.text}
      </>
    ),
  };
  const entry =
    item.checked !== undefined ? (
      <DropdownMenuCheckboxItem checked={item.checked} {...common} />
    ) : (
      <DropdownMenuItem {...common} />
    );
  if (!tipped) return entry;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{entry}</TooltipTrigger>
        <TooltipContent side="right" className="speel-shadcn">
          {item.tooltip}
        </TooltipContent>
      </Tooltip>
      <span id={tipId} className="sr-only">
        {item.tooltip}
      </span>
    </TooltipProvider>
  );
}

/**
 * Warns once per surface instance, in development, when it has neither a title nor an
 * `ariaLabel` — an unnamed dialog is announced as just "dialog".
 */
function useWarnIfUnnamed(kind: string, p: DialogProps): void {
  const warned = useRef(false);
  if (
    // Guarded: a browser bundle may not define `process` at all.
    (typeof process === "undefined" || process.env.NODE_ENV !== "production") &&
    p.open &&
    p.title === undefined &&
    p.ariaLabel === undefined &&
    !warned.current
  ) {
    warned.current = true;
    console.warn(
      `speel: a ${kind} has neither a title nor an ariaLabel, so screen readers announce it unnamed. Pass ariaLabel.`,
    );
  }
}

/**
 * The surface's name: the visible title, else `ariaLabel` for screen readers only. Radix
 * requires a title element, so an unnamed surface keeps an empty, hidden one.
 */
const titleText = (p: DialogProps): string => p.title ?? p.ariaLabel ?? "";
const titleHidden = (p: DialogProps): boolean => p.title === undefined;

export function ShadDialog(p: DialogProps): ReactElement {
  useWarnIfUnnamed("modal", p);
  const resizable = p.resizable ?? true;
  const draggable = p.draggable ?? true;
  const showFs = p.fullscreenToggle ?? true;
  const [fullscreen, setFullscreen] = useState(p.defaultFullscreen ?? false);
  const { frameRef, css, dragHandleProps, resizeHandleProps } = useModalFrame({
    ...(p.size !== undefined ? { size: p.size } : {}),
    ...(p.style !== undefined ? { style: p.style } : {}),
    fullscreen,
    label: "Resize dialog",
  });
  const { restore } = useFocusReturn({
    open: p.open,
    returnFocus: p.returnFocus,
  });

  return (
    <Dialog
      open={p.open}
      onOpenChange={(o) => {
        if (!o && p.blocking) return;
        p.onOpenChange(o);
      }}
    >
      {/* speel-shadcn tag: portaled content escapes the host wrapper, so each portal
          re-applies the class that scopes the skin's base-layer CSS rules. */}
      <DialogContent
        showCloseButton={false}
        aria-describedby={p.ariaDescribedBy}
        // animate-none: the stock zoom/fade keyframes write `transform` and would
        // clobber the inline centering+drag transform mid-animation.
        // transition-none: the stock `duration-200` sets transition-duration with
        // transition-property at its initial `all`, so every inline width/height/
        // transform write would otherwise start a 200ms implicit transition and
        // drag/resize rubber-bands instead of tracking the pointer.
        className="speel-shadcn flex flex-col gap-0 overflow-hidden p-0 transition-none data-[state=open]:animate-none data-[state=closed]:animate-none"
        style={{
          // Size and placement (useModalFrame): top/left place the fixed frame and a
          // centred axis translates -50%; `height: auto` sizes to the content.
          ...css,
          // Neutralizes the stock translate-x/y-[-50%] utilities (CSS `translate`
          // property, Safari 15.4+/Chrome 104+); centring lives in `transform`.
          translate: "none",
        }}
        onOpenAutoFocus={(e) => {
          // The caller's initialFocus (a confirm's safe choice) beats Radix's first
          // tabbable, which would be a header button.
          const target = p.initialFocus?.();
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
        onInteractOutside={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        // Focus return is speel's (useFocusReturn): a Radix Dialog only returns focus to
        // its own Trigger, and these surfaces are opened from the consumer's controls. A
        // Radix Dialog/Sheet is modal, so focus was inside.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          restore(true);
        }}
      >
        {/* Sticky header — doubles as the drag handle (buttons excluded by useModalFrame).
            Its parent is the frame useModalFrame measures: the stock DialogContent is a
            plain function component, which under React 17/18 cannot take a ref. */}
        <div
          ref={(el) => {
            frameRef.current =
              (el?.parentElement as HTMLDivElement | null) ?? null;
          }}
          {...(draggable && !fullscreen ? dragHandleProps : {})}
          className={cn(
            "flex flex-none items-center gap-2 border-b px-5 py-3",
            draggable && !fullscreen && "cursor-move touch-none",
          )}
        >
          <DialogTitle
            className={cn(
              "grow truncate text-lg font-semibold",
              titleHidden(p) && "sr-only",
            )}
          >
            {titleText(p)}
          </DialogTitle>
          {titleHidden(p) ? <div className="grow" /> : null}
          {showFs ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Toggle fullscreen"
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </Button>
          ) : null}
          {p.blocking ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Close"
              onClick={() => p.onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        {/* Scrolling body — the only scroll container. Basis auto, so `height: auto`
            sizes to the content. */}
        <div className="min-h-0 flex-auto overflow-auto px-5 py-4">
          {p.children as ReactNode}
        </div>
        {p.footer ? (
          <div className="flex flex-none items-center justify-end gap-2 border-t px-5 py-3">
            {p.footer as ReactNode}
          </div>
        ) : null}
        {resizable && !fullscreen ? (
          // The corner it resizes, drawn quietly; it speaks up on hover or keyboard focus.
          <div
            {...resizeHandleProps}
            data-testid="resize-handle"
            className="group absolute right-0 bottom-0 z-10 size-[18px] touch-none cursor-nwse-resize outline-none"
          >
            <span className="absolute right-[3px] bottom-[3px] size-2 border-r-2 border-b-2 border-border transition-[width,height,border-color] duration-150 group-hover:size-2.5 group-hover:border-r-[3px] group-hover:border-b-[3px] group-hover:border-primary group-focus:size-2.5 group-focus:border-r-[3px] group-focus:border-b-[3px] group-focus:border-primary" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ShadDrawer(p: DrawerProps): ReactElement {
  useWarnIfUnnamed("panel", p);
  const resizable = p.resizable ?? true;
  const atEnd = p.position !== "start";
  const presetW = SHEET_WIDTH[p.size ?? "medium"];
  const cssWidth = p.style?.width;
  const maxW = panelMaxWidth(p.style);
  const handleRef = useRef<HTMLDivElement>(null);
  const { size, handleProps } = useResizable({
    axis: "x",
    min: { w: 320 },
    ...(maxW !== undefined ? { max: { w: maxW } } : {}),
    // A CSS `style.width` holds until the first resize, which starts from the measured sheet.
    ...(cssWidth === undefined ? { initial: { w: presetW } } : {}),
    measure: () => {
      const w = handleRef.current?.parentElement?.getBoundingClientRect().width;
      return w ? { w } : undefined;
    },
    invertX: atEnd,
    label: "Resize panel",
  });
  const width =
    resizable && size.w !== undefined
      ? `${size.w}px`
      : (cssWidth ?? `${presetW}px`);
  const maxWidth =
    p.style?.maxWidth !== undefined ? `min(${p.style.maxWidth}, 96vw)` : "96vw";
  const { restore } = useFocusReturn({
    open: p.open,
    returnFocus: p.returnFocus,
  });

  // The built-in close button sits at absolute top-4 right-4. With our custom header
  // that sits at py-3 px-5, the close button overlaps the title text. When the close
  // button is shown (non-blocking), add pr-12 to the header to reserve space.
  const showCloseButton = !p.blocking;
  const headerPrClass = showCloseButton ? "pr-12" : "pr-5";

  return (
    <Sheet
      open={p.open}
      onOpenChange={(o) => {
        if (!o && p.blocking) return;
        p.onOpenChange(o);
      }}
    >
      <SheetContent
        side={atEnd ? "right" : "left"}
        showCloseButton={showCloseButton}
        aria-describedby={undefined}
        className="speel-shadcn flex flex-col gap-0 p-0 sm:max-w-none"
        style={{ width, maxWidth }}
        onInteractOutside={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        // Focus return is speel's (useFocusReturn): a Radix Dialog only returns focus to
        // its own Trigger, and these surfaces are opened from the consumer's controls. A
        // Radix Dialog/Sheet is modal, so focus was inside.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          restore(true);
        }}
      >
        <div
          className={cn(
            "flex flex-none items-center gap-2 border-b pl-5 py-3",
            headerPrClass,
          )}
        >
          <SheetTitle
            className={cn(
              "grow truncate text-lg font-semibold",
              titleHidden(p) && "sr-only",
            )}
          >
            {titleText(p)}
          </SheetTitle>
          {titleHidden(p) ? <div className="grow" /> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {p.children as ReactNode}
        </div>
        {p.footer ? (
          <div className="flex flex-none items-center justify-end gap-2 border-t px-5 py-3">
            {p.footer as ReactNode}
          </div>
        ) : null}
        {resizable ? (
          // Grab target wider than the rule it draws; the rule itself only speaks up
          // on hover or keyboard focus.
          <div
            {...handleProps}
            ref={handleRef}
            data-testid="resize-handle"
            className={cn(
              "group absolute top-0 bottom-0 z-10 flex w-2.5 touch-none cursor-ew-resize justify-center outline-none",
              atEnd ? "left-0" : "right-0",
            )}
          >
            <span className="w-px bg-border transition-[width,background-color] duration-150 group-hover:w-[3px] group-hover:bg-primary group-focus:w-[3px] group-focus:bg-primary" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ShadPopover(p: PopoverProps): ReactElement {
  const f = usePopoverFocus(p);
  return (
    <Popover open={p.open} onOpenChange={p.onOpenChange}>
      {/* An anchor, not a PopoverTrigger: the trigger is the consumer's own button (it
          toggles `open` itself, as the contract says), and the aria wiring goes on it
          through the trigger function — never on a wrapper that cannot take focus. */}
      <PopoverAnchor asChild>
        <span ref={f.anchorRef} className="inline-flex">
          {f.renderTrigger(p.trigger) as ReactNode}
        </span>
      </PopoverAnchor>
      <PopoverContent
        id={f.contentId}
        aria-label={p.label}
        align="start"
        className="speel-shadcn w-auto min-w-60"
        onKeyDown={f.onContentKeyDown}
        // Without a PopoverTrigger, Radix sees a click on the trigger as outside and
        // dismisses — then the trigger's own toggle reopens it (radix-ui 1.5 dismisses on
        // pointerdown). The trigger is the consumer's to toggle; leave it alone here.
        onInteractOutside={(e) => {
          if (f.anchorRef.current?.contains(e.target as Node))
            e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          f.restore(false);
        }}
      >
        {p.children as ReactNode}
      </PopoverContent>
    </Popover>
  );
}
