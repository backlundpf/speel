import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The client width of `ref`'s element, kept current with a ResizeObserver (window `resize`
 * where there is none). 0 until measured — and always in jsdom, which has no layout.
 */
export function useContainerWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = (): void => setWidth(el.clientWidth);
    read();
    const RO = (
      window as unknown as {
        ResizeObserver?: new (cb: () => void) => {
          observe: (target: Element) => void;
          disconnect: () => void;
        };
      }
    ).ResizeObserver;
    if (!RO) {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const observer = new RO(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
