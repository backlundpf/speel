import { useRef, useState, useLayoutEffect, type ReactElement } from "react";

/**
 * Measures the font-family in effect where the caller renders — so an overlay portaled to
 * `document.body` can match the host page's font instead of the body's (which SharePoint,
 * for one, leaves at the browser's serif default).
 *
 * Render `probe` in-flow (it is hidden and empty); `fontFamily` is the computed value at
 * that position, or undefined where nothing is measurable (SSR, test DOMs without cascade).
 */
export function useHostFontFamily(): {
  probe: ReactElement;
  fontFamily: string | undefined;
} {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [fontFamily, setFontFamily] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const measured = window.getComputedStyle(ref.current).fontFamily;
    if (measured) setFontFamily(measured);
  }, []);
  const probe = <span ref={ref} aria-hidden style={{ display: "none" }} />;
  return { probe, fontFamily };
}
