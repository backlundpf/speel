import type { ModalStyle, PanelStyle } from "../adapter/SpeelUIAdapter.js";

/** Size presets, in px. `size` sets both axes; a `style` width/height replaces one. */
export const DIALOG_WIDTH = { small: 480, medium: 640, large: 840 } as const;
export const DIALOG_HEIGHT = { small: 440, medium: 560, large: 640 } as const;
/** The floor a user resize stops at (unless the frame was already smaller), and the room
 *  a placed modal keeps on screen before its placement gives way. */
export const DIALOG_MIN = { w: 360, h: 260 } as const;

/** The frame's box in viewport px (top-left corner), once the user has dragged or resized. */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The frame's CSS. Both skins position the frame absolutely (fixed) and apply all of it. */
export interface ModalFrameCss {
  width: string;
  height: string;
  maxWidth: string;
  maxHeight: string;
  top: string;
  left: string;
  transform: string;
}

const MAX_W = "96vw";
const MAX_H = "92vh";
/** Where a placed modal's room ends: the far margins a centred maximized modal keeps
 *  (96vw leaves 2vw a side, 92vh leaves 4vh). */
const FAR_W = "98vw";
const FAR_H = "96vh";

const FULLSCREEN: ModalFrameCss = {
  width: MAX_W,
  height: MAX_H,
  maxWidth: MAX_W,
  maxHeight: MAX_H,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
};

/** One axis: its near-edge CSS, its cap, and whether it is centred. */
function axis(
  place: string | undefined,
  cap: string | undefined,
  max: string,
  far: string,
  floor: number,
): { edge: string; max: string; centred: boolean } {
  const caps = cap === undefined ? [max] : [cap, max];
  if (place === undefined)
    return {
      edge: "50%",
      max: caps.length === 1 ? max : `min(${caps.join(", ")})`,
      centred: true,
    };
  // Placed: the edge holds, the cap shrinks to the room left before the far margin — but
  // never below the floor; past that the edge moves back so the floor still fits. On a
  // screen smaller than the floor, the floor is the maximized size, and the edge never
  // passes 0 (the title bar, the only drag handle, stays on screen).
  const fits = `min(${floor}px, ${max})`;
  return {
    edge: `max(0px, min(${place}, calc(${far} - ${fits})))`,
    max: `min(${[...caps, `max(calc(${far} - ${place}), ${fits})`].join(", ")})`,
    centred: false,
  };
}

/**
 * The frame's CSS for a size preset, a caller `style`, fullscreen, and — once the user has
 * taken over by dragging or resizing — the pixel box they left it at. Until then it is pure
 * CSS, so auto height, centring, placement and caps follow content and window live.
 */
export function modalFrameCss(o: {
  size?: "small" | "medium" | "large";
  style?: ModalStyle;
  fullscreen: boolean;
  box: FrameBox | null;
}): ModalFrameCss {
  if (o.fullscreen) return { ...FULLSCREEN };
  const s = o.style ?? {};
  const size = o.size ?? "medium";
  const x = axis(s.left, s.maxWidth, MAX_W, FAR_W, DIALOG_MIN.w);
  const y = axis(s.top, s.maxHeight, MAX_H, FAR_H, DIALOG_MIN.h);
  if (o.box) {
    const b = o.box;
    const cap = (c: string | undefined, max: string): string =>
      c === undefined ? max : `min(${c}, ${max})`;
    return {
      width: `${b.w}px`,
      height: `${b.h}px`,
      maxWidth: cap(s.maxWidth, MAX_W),
      maxHeight: cap(s.maxHeight, MAX_H),
      top: `${b.y}px`,
      left: `${b.x}px`,
      transform: "none",
    };
  }
  // Content-sized width is not supported: with wrapping text it runs straight to the cap.
  const width =
    s.width !== undefined && s.width !== "auto"
      ? s.width
      : `${DIALOG_WIDTH[size]}px`;
  return {
    width,
    height: s.height ?? `${DIALOG_HEIGHT[size]}px`,
    maxWidth: x.max,
    maxHeight: y.max,
    top: y.edge,
    left: x.edge,
    transform:
      x.centred || y.centred
        ? `translate(${x.centred ? "-50%" : "0"}, ${y.centred ? "-50%" : "0"})`
        : "none",
  };
}

/**
 * A CSS length resolved to px, by measuring a hidden fixed probe (so `vw`, `calc()` and
 * `min()` all resolve against the viewport). Undefined outside a browser, and when the
 * probe measures 0 (no layout, as in jsdom).
 */
export function cssLengthPx(
  value: string,
  axis: "w" | "h",
): number | undefined {
  if (typeof document === "undefined" || !document.body) return undefined;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.left = "0";
  probe.style.top = "0";
  if (axis === "w") probe.style.width = value;
  else probe.style.height = value;
  document.body.appendChild(probe);
  const px = axis === "w" ? probe.offsetWidth : probe.offsetHeight;
  probe.remove();
  return px > 0 ? px : undefined;
}

/**
 * The px cap on a panel resize: a strip of page stays visible (a panel dragged past the
 * viewport edge has no handle left to drag back), and a caller `maxWidth` lowers it.
 * Undefined outside a browser.
 */
export function panelMaxWidth(
  style: PanelStyle | undefined,
): number | undefined {
  if (typeof window === "undefined") return undefined;
  const room = Math.max(320, window.innerWidth - 48);
  const cap =
    style?.maxWidth !== undefined
      ? cssLengthPx(style.maxWidth, "w")
      : undefined;
  return cap === undefined ? room : Math.min(room, cap);
}
