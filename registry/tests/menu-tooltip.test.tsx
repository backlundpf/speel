import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MenuItem } from "@speel/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

/** MenuItem.tooltip — the v8 skin's contract, on Radix's DropdownMenu. */

const TIP = "Sends the stage's notifications again";

function openMenu(items: MenuItem[]): void {
  render(
    <ui.Menu
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

describe("shadcn Menu item tooltip", () => {
  it("item is described by its tooltip", () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    expect(describedText(item)).toContain(TIP);
  });

  it("tooltip shows on keyboard focus", async () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    act(() => item.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(TIP);
  });

  it("tooltip shows on hover", async () => {
    openMenu([{ key: "r", text: "Resend", tooltip: TIP, onClick: vi.fn() }]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    fireEvent.pointerMove(item, { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toHaveTextContent(TIP);
  });

  it("disabled item: focusable, tooltip on focus, no click", async () => {
    const onClick = vi.fn();
    openMenu([
      { key: "r", text: "Resend", tooltip: TIP, disabled: true, onClick },
    ]);
    const item = screen.getByRole("menuitem", { name: "Resend" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    // Radix drops `data-disabled` items from its roving focus; this one stays in it.
    expect(item).not.toHaveAttribute("data-disabled");
    act(() => item.focus());
    expect(document.activeElement).toBe(item);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(TIP);
    fireEvent.click(item);
    fireEvent.keyDown(item, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("items without a tooltip are unchanged", () => {
    openMenu([
      { key: "e", text: "Export", onClick: vi.fn() },
      { key: "d", text: "Delete", disabled: true, onClick: vi.fn() },
    ]);
    const item = screen.getByRole("menuitem", { name: "Export" });
    expect(item.getAttribute("aria-describedby") ?? "").toBe("");
    // A plain disabled item is still Radix-disabled.
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-disabled",
    );
  });
});
