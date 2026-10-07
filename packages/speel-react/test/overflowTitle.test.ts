import { describe, it, expect, vi } from "vitest";
import { setOverflowTitle } from "../src/table/overflowTitle.js";

/** jsdom has no layout: give the element the box sizes a browser would report. */
function box(scrollWidth: number, clientWidth: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { value: clientWidth });
  return el;
}

describe("setOverflowTitle", () => {
  it("titles an element whose content is cut off", () => {
    const el = box(200, 80);
    setOverflowTitle(el, () => "Bartholomew Longname");
    expect(el.title).toBe("Bartholomew Longname");
  });

  it("clears the title once the content fits, and never computes the text", () => {
    const el = box(80, 80);
    el.title = "stale";
    const getText = vi.fn(() => "x");
    setOverflowTitle(el, getText);
    expect(el.hasAttribute("title")).toBe(false);
    expect(getText).not.toHaveBeenCalled();
  });

  it("sets no title when a cut-off cell has no text", () => {
    const el = box(200, 80);
    setOverflowTitle(el, () => "");
    expect(el.hasAttribute("title")).toBe(false);
  });
});
