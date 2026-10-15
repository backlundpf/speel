import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  V8Button,
  V8IconButton,
  V8Popover,
} from "../src/fluent-v8/primitives.js";
import { spyFocus } from "./focusSpy.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <V8Popover
      label="Contact"
      open={open}
      onOpenChange={(o) => {
        onOpenChange?.(o);
        setOpen(o);
      }}
      trigger={(t) => (
        <V8Button text="Org" {...t} onClick={() => setOpen((o) => !o)} />
      )}
    >
      <a href="mailto:x@example.com">mail</a>
    </V8Popover>
  );
}

describe("V8Popover", () => {
  it("is a labelled dialog its trigger points at", () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-expanded", "false");
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(org).toHaveAttribute("aria-expanded", "true");
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab past the last element closes and focuses the trigger", () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Org" }));
    const mail = screen.getByText("mail");
    mail.focus();
    const spy = spyFocus();
    fireEvent.keyDown(mail, { key: "Tab" });
    spy.restore();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(spy.calls[0]).toEqual({
      el: screen.getByRole("button", { name: "Org" }),
      opts: { preventScroll: true },
    });
  });

  it("Esc closes and focuses the trigger", async () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    const mail = screen.getByText("mail");
    mail.focus();
    fireEvent.keyDown(mail, { key: "Escape", which: 27, keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(org);
  });
});

describe("v8 buttons carry the aria fields", () => {
  it("Button and IconButton", () => {
    render(
      <>
        <V8Button
          text="Views"
          ariaExpanded={false}
          ariaHasPopup="menu"
          ariaControls="m1"
        />
        <V8IconButton
          iconName="Filter"
          title="Filter"
          ariaExpanded
          ariaHasPopup="dialog"
          ariaControls="p1"
        />
      </>,
    );
    const views = screen.getByRole("button", { name: "Views" });
    expect(views).toHaveAttribute("aria-expanded", "false");
    expect(views).toHaveAttribute("aria-haspopup", "menu");
    expect(views).toHaveAttribute("aria-controls", "m1");
    const filter = screen.getByRole("button", { name: "Filter" });
    expect(filter).toHaveAttribute("aria-expanded", "true");
    expect(filter).toHaveAttribute("aria-haspopup", "dialog");
    expect(filter).toHaveAttribute("aria-controls", "p1");
  });
});
