import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
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

import { useDragResize, useResizable } from "@speel/react";
import type {
  DialogProps,
  DrawerProps,
  PopoverProps,
  MenuProps,
} from "@speel/react";

import { iconFor } from "./icons";

const DIALOG_WIDTH = { small: 480, medium: 640, large: 840 } as const;
const DIALOG_HEIGHT = { small: 440, medium: 560, large: 640 } as const;
const DIALOG_MIN = { w: 360, h: 260 };
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
            {section.items.map((item) => {
              const Icon =
                item.iconName !== undefined
                  ? iconFor(item.iconName)
                  : undefined;
              const body = (
                <>
                  {Icon ? <Icon className="size-4" /> : null}
                  {item.text}
                </>
              );
              return item.checked !== undefined ? (
                <DropdownMenuCheckboxItem
                  key={item.key}
                  checked={item.checked}
                  disabled={item.disabled}
                  onSelect={() => item.onClick?.()}
                >
                  {body}
                </DropdownMenuCheckboxItem>
              ) : (
                <DropdownMenuItem
                  key={item.key}
                  disabled={item.disabled}
                  onSelect={() => item.onClick?.()}
                >
                  {body}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ShadDialog(p: DialogProps): ReactElement {
  const resizable = p.resizable ?? true;
  const draggable = p.draggable ?? true;
  const showFs = p.fullscreenToggle ?? true;
  const [fullscreen, setFullscreen] = useState(false);
  const presetW = DIALOG_WIDTH[p.size ?? "medium"];
  const presetH = DIALOG_HEIGHT[p.size ?? "medium"];
  const { size, transform, dragHandleProps, resizeHandleProps } = useDragResize(
    {
      min: DIALOG_MIN,
      initial: { w: presetW, h: presetH },
    },
  );

  const width = fullscreen ? "96vw" : `${resizable ? size.w : presetW}px`;
  const height = fullscreen ? "92vh" : `${resizable ? size.h : presetH}px`;

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
        aria-describedby={undefined}
        // animate-none: the stock zoom/fade keyframes write `transform` and would
        // clobber the inline centering+drag transform mid-animation.
        // transition-none: the stock `duration-200` sets transition-duration with
        // transition-property at its initial `all`, so every inline width/height/
        // transform write would otherwise start a 200ms implicit transition and
        // drag/resize rubber-bands instead of tracking the pointer.
        className="speel-shadcn flex flex-col gap-0 overflow-hidden p-0 transition-none data-[state=open]:animate-none data-[state=closed]:animate-none"
        style={{
          width,
          height,
          maxWidth: "96vw",
          maxHeight: "92vh",
          // Neutralizes the stock translate-x/y-[-50%] utilities (CSS `translate`
          // property, Safari 15.4+/Chrome 104+); centering lives in `transform`
          // below so the drag offset composes with it.
          translate: "none",
          transform: fullscreen
            ? "translate(-50%, -50%)"
            : `translate(-50%, -50%) ${transform}`,
        }}
        onInteractOutside={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (p.blocking) e.preventDefault();
        }}
      >
        {/* Sticky header — doubles as the drag handle (buttons excluded by useDragResize). */}
        <div
          {...(draggable && !fullscreen ? dragHandleProps : {})}
          className={cn(
            "flex flex-none items-center gap-2 border-b px-5 py-3",
            draggable && !fullscreen && "cursor-move",
          )}
        >
          {/* DialogTitle always rendered for a11y; renders empty string when title is undefined */}
          <DialogTitle className="grow truncate text-lg font-semibold">
            {p.title ?? ""}
          </DialogTitle>
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
        {/* Scrolling body — the only scroll container. */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {p.children as ReactNode}
        </div>
        {p.footer ? (
          <div className="flex flex-none items-center justify-end gap-2 border-t px-5 py-3">
            {p.footer as ReactNode}
          </div>
        ) : null}
        {resizable && !fullscreen ? (
          <div
            {...resizeHandleProps}
            aria-hidden
            data-testid="resize-handle"
            className="absolute right-0.5 bottom-0.5 z-10 size-4 cursor-nwse-resize"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ShadDrawer(p: DrawerProps): ReactElement {
  const resizable = p.resizable ?? true;
  const atEnd = p.position !== "start";
  const presetW = SHEET_WIDTH[p.size ?? "medium"];
  const maxW =
    typeof window === "undefined"
      ? undefined
      : Math.max(320, window.innerWidth - 48);
  const { size, handleProps } = useResizable({
    axis: "x",
    min: { w: 320 },
    ...(maxW !== undefined ? { max: { w: maxW } } : {}),
    initial: { w: presetW },
    invertX: atEnd,
    label: "Resize panel",
  });
  const width = resizable ? (size.w ?? presetW) : presetW;

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
        style={{ width: `${width}px`, maxWidth: "96vw" }}
        onInteractOutside={(e) => {
          if (p.blocking) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (p.blocking) e.preventDefault();
        }}
      >
        <div
          className={cn(
            "flex flex-none items-center gap-2 border-b pl-5 py-3",
            headerPrClass,
          )}
        >
          <SheetTitle className="grow truncate text-lg font-semibold">
            {p.title ?? ""}
          </SheetTitle>
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
  return (
    <Popover open={p.open} onOpenChange={p.onOpenChange}>
      <PopoverTrigger asChild>
        <span className="inline-flex">{p.trigger as ReactNode}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="speel-shadcn w-auto min-w-60">
        {p.children as ReactNode}
      </PopoverContent>
    </Popover>
  );
}
