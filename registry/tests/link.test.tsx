import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";

const L = shadcnAdapter.Link;
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

describe("shadcn Link", () => {
  it("renders a real anchor for href, a button without one", () => {
    const { rerender } = render(<L text="Spec" href="/spec" />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/spec");
    rerender(<L text="Spec" onClick={() => undefined} />);
    const b = screen.getByRole("button", { name: "Spec" });
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
  });

  it("gives the anchor and the button the identical look", () => {
    const { rerender } = render(<L text="Spec" href="/spec" />);
    const anchorClass = screen.getByRole("link", { name: "Spec" }).className;
    rerender(<L text="Spec" onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Spec" }).className).toBe(
      anchorClass,
    );
    // Underlined on hover only, and cut off at its end.
    for (const c of [
      "text-primary",
      "font-normal",
      "hover:underline",
      "inline-block",
      "max-w-full",
      "truncate",
      "align-top",
      "text-start",
      "cursor-pointer",
    ]) {
      expect(anchorClass.split(" ")).toContain(c);
    }
    expect(anchorClass.split(" ")).not.toContain("underline");
    // A pushed-down underline falls outside the truncating box and is clipped (Segoe UI).
    expect(anchorClass).not.toMatch(/underline-offset/);
  });

  it("captures a plain click for onClick and leaves modified clicks to the browser", () => {
    const onClick = vi.fn();
    render(<L text="Spec" href="/spec" onClick={onClick} />);
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

  it("leaves every click to the browser when there is no onClick", () => {
    render(<L text="Spec" href="/spec" />);
    expect(clickPrevented(screen.getByRole("link", { name: "Spec" }))).toBe(
      false,
    );
  });

  it("runs onClick for a keyboard activation", () => {
    const onClick = vi.fn();
    render(<L text="Spec" href="/spec" onClick={onClick} />);
    expect(
      clickPrevented(screen.getByRole("link", { name: "Spec" }), { detail: 0 }),
    ).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("runs onClick for the button form", () => {
    const onClick = vi.fn();
    render(<L text="Spec" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Spec" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a new tab safely", () => {
    render(<L text="Spec" href="/spec" target="_blank" />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("takes an aria-label", () => {
    render(<L text="Spec" href="/spec" ariaLabel="Open the spec" />);
    expect(screen.getByRole("link", { name: "Open the spec" })).toBeTruthy();
  });

  it("disabled: aria-disabled, no onClick, no navigation", () => {
    const onClick = vi.fn();
    render(<L text="Spec" href="/spec" onClick={onClick} disabled />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a.tagName).toBe("A");
    expect(a).toHaveAttribute("aria-disabled", "true");
    expect(a).not.toHaveAttribute("href");
    fireEvent.click(a, { button: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled: stays focusable in both forms, and the button form ignores clicks", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <L text="Spec" href="/spec" onClick={onClick} disabled />,
    );
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a).toHaveAttribute("tabindex", "0");
    a.focus();
    expect(document.activeElement).toBe(a);
    rerender(<L text="Spec" onClick={onClick} disabled />);
    const b = screen.getByRole("button", { name: "Spec" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("titles itself with its text when cut off, and not when it fits", () => {
    const { rerender } = render(<L text="A long title" href="/x" />);
    const a = screen.getByRole("link", { name: "A long title" });
    sized(a, 200, 80);
    fireEvent.mouseEnter(a);
    expect(a.title).toBe("A long title");
    rerender(<L text="Short" onClick={() => undefined} />);
    const b = screen.getByRole("button", { name: "Short" });
    sized(b, 40, 80);
    fireEvent.mouseEnter(b);
    expect(b.title).toBe("");
  });
});
