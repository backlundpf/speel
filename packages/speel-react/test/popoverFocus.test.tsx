import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { PopoverTriggerProps } from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { spyFocus } from "./focusSpy.js";

const Popover = fakeAdapter.Popover;
const Button = fakeAdapter.Button;
const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];

afterEach(() => {
  document.body.innerHTML = "";
});

function Harness(p: {
  children?: ReactNode;
  seen?: PopoverTriggerProps[];
  onOpenChange?: (o: boolean) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(p.initiallyOpen ?? false);
  return (
    <Popover
      label="Contact"
      open={open}
      onOpenChange={(o) => {
        p.onOpenChange?.(o);
        setOpen(o);
      }}
      trigger={(t) => {
        p.seen?.push(t);
        return <Button text="Org" {...t} onClick={() => setOpen((o) => !o)} />;
      }}
    >
      {p.children ?? (
        <>
          <button>first</button>
          <button>last</button>
        </>
      )}
    </Popover>
  );
}

describe("usePopoverFocus (via fakeAdapter.Popover)", () => {
  it("wires the trigger closed and open", () => {
    const seen: PopoverTriggerProps[] = [];
    render(<Harness seen={seen} />);
    expect(last(seen)).toEqual({
      ariaExpanded: false,
      ariaHasPopup: "dialog",
      ariaControls: undefined,
    });
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-expanded", "false");
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    expect(org).not.toHaveAttribute("aria-controls");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(last(seen)?.ariaExpanded).toBe(true);
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab from the last element closes and focuses the trigger", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const lastButton = screen.getByText("last");
    lastButton.focus();
    const spy = spyFocus();
    fireEvent.keyDown(lastButton, { key: "Tab" });
    spy.restore();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const org = screen.getByRole("button", { name: "Org" });
    expect(spy.calls).toEqual([{ el: org, opts: { preventScroll: true } }]);
  });

  it("Shift+Tab from the first element closes too", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const first = screen.getByText("first");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Org" }),
    );
  });

  it("Tab between inner elements leaves it open", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const first = screen.getByText("first");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Tab with nothing focusable inside closes and returns to the trigger", () => {
    const onOpenChange = vi.fn();
    render(
      <Harness initiallyOpen onOpenChange={onOpenChange}>
        <span>only text</span>
      </Harness>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Org" }),
    );
  });

  it("a plain node trigger still renders", () => {
    render(
      <Popover open onOpenChange={() => {}} trigger={<button>plain</button>}>
        body
      </Popover>,
    );
    expect(screen.getByText("plain")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("body");
  });
});
