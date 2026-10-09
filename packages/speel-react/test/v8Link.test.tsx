import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Link } from "../src/fluent-v8/primitives.js";

const sized = (el: HTMLElement, s: number, c: number): void => {
  Object.defineProperty(el, "scrollWidth", { value: s, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: c, configurable: true });
};
/** Whether the link's own handler prevented the click — read at the document, after React's
 *  root listener, which then prevents it: jsdom implements no navigation and logs each try. */
const clickPrevented = (
  el: HTMLElement,
  init: MouseEventInit = {},
): boolean => {
  let prevented = false;
  const settle = (e: Event): void => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener("click", settle);
  try {
    fireEvent.click(el, { button: 0, ...init });
  } finally {
    document.removeEventListener("click", settle);
  }
  return prevented;
};

describe("V8Link", () => {
  it("renders a real anchor for href, a button without one", () => {
    const { rerender } = render(<V8Link text="Spec" href="/spec" />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/spec");
    expect(a.className).toContain("ms-Link");
    rerender(<V8Link text="Spec" onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Spec" }).className).toContain(
      "ms-Link",
    );
  });

  it("captures a plain click for onClick and leaves modified clicks to the browser", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(clickPrevented(a)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    for (const mod of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      expect(clickPrevented(a, mod)).toBe(false);
    }
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("runs onClick for a keyboard activation", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} />);
    expect(
      clickPrevented(screen.getByRole("link", { name: "Spec" }), { detail: 0 }),
    ).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a new tab safely", () => {
    render(<V8Link text="Spec" href="/spec" target="_blank" />);
    expect(screen.getByRole("link", { name: "Spec" }).getAttribute("rel")).toBe(
      "noreferrer noopener",
    );
  });

  it("disabled: aria-disabled, no onClick, no navigation", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} disabled />);
    const el = screen.getByText("Spec").closest(".ms-Link") as HTMLElement;
    expect(el.getAttribute("aria-disabled")).toBe("true");
    const prevented = clickPrevented(el);
    expect(onClick).not.toHaveBeenCalled();
    expect(prevented || !el.hasAttribute("href")).toBe(true);
  });

  it("disabled: stays focusable in both forms, and the button form ignores clicks", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <V8Link text="Spec" href="/spec" onClick={onClick} disabled />,
    );
    const a = screen.getByText("Spec").closest(".ms-Link") as HTMLElement;
    expect(a.tagName).toBe("A");
    a.focus();
    expect(document.activeElement).toBe(a);
    rerender(<V8Link text="Spec" onClick={onClick} disabled />);
    const b = screen.getByRole("button", { name: "Spec" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("truncates at the end and titles itself when cut off", () => {
    render(<V8Link text="A long title" href="/x" />);
    const a = screen.getByRole("link", { name: "A long title" });
    const cs = getComputedStyle(a);
    expect([
      cs.display,
      cs.overflow,
      cs.textOverflow,
      cs.whiteSpace,
      cs.maxWidth,
    ]).toEqual(["inline-block", "hidden", "ellipsis", "nowrap", "100%"]);
    sized(a, 200, 80);
    fireEvent.mouseEnter(a);
    expect(a.title).toBe("A long title");
  });
});
