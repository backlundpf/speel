import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { V8Menu } from "../src/fluent-v8/primitives.js";
import type { MenuItem } from "../src/adapter/SpeelUIAdapter.js";

/**
 * MenuItem.tooltip has Button.tooltip's contract (#87): shown on hover and keyboard
 * focus, the item's accessible description, and present while the item is disabled —
 * which stays focusable so the reason can be read.
 */

const TIP = "Sends the stage's notifications again";

function openMenu(items: MenuItem[]): void {
  render(
    <V8Menu
      open
      onOpenChange={() => {}}
      trigger={<button type="button">More</button>}
      sections={[{ key: "s", items }]}
    />,
  );
}

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("V8Menu item tooltip", () => {
  it("item is described by its tooltip", () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    expect(describedText(item)).toContain(TIP);
  });

  it("tooltip shows on keyboard focus", async () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    const before = screen.getAllByText(TIP).length;
    act(() => item.focus());
    await waitFor(
      () => expect(screen.getAllByText(TIP).length).toBeGreaterThan(before),
      { timeout: 2000 },
    );
  });

  it("tooltip shows on hover", async () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    const before = screen.getAllByText(TIP).length;
    fireEvent.mouseEnter(item.parentElement!);
    await waitFor(
      () => expect(screen.getAllByText(TIP).length).toBeGreaterThan(before),
      { timeout: 2000 },
    );
  });

  it("disabled item: focusable, tooltip on focus, no click", async () => {
    const onClick = vi.fn();
    openMenu([
      { key: "r", text: "Resend", tooltip: TIP, disabled: true, onClick },
    ]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toHaveAttribute("disabled");
    const before = screen.getAllByText(TIP).length;
    act(() => item.focus());
    expect(document.activeElement).toBe(item);
    await waitFor(
      () => expect(screen.getAllByText(TIP).length).toBeGreaterThan(before),
      { timeout: 2000 },
    );
    fireEvent.click(item);
    fireEvent.keyDown(item, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("items without a tooltip are unchanged", () => {
    openMenu([{ key: "e", text: "Export", onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Export" });
    expect(item.getAttribute("aria-describedby") ?? "").toBe("");
    expect(item.closest(".ms-TooltipHost")).toBeNull();
  });
});
