import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { useState, type ComponentType } from "react";
import type { DrawerProps, ReturnFocusTarget } from "@speel/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";
import { spyFocus, type FocusCall } from "./focusSpy";

afterEach(() => {
  // Unmount first: an open popover's portal lives in body.
  cleanup();
  document.body.innerHTML = "";
});

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};

const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];

describe.each([
  ["Dialog", shadcnAdapter.Dialog as ComponentType<DrawerProps>],
  ["Drawer", shadcnAdapter.Drawer],
])("shadcn %s focus return", (_n, Surface) => {
  async function cycle(returnFocus?: ReturnFocusTarget): Promise<{
    calls: FocusCall[];
    opener: HTMLButtonElement;
  }> {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const rf = returnFocus !== undefined ? { returnFocus } : {};
    const ui = (open: boolean) => (
      <Surface open={open} onOpenChange={() => {}} title="S" {...rf}>
        <button>inside</button>
      </Surface>
    );
    const { rerender, unmount } = render(ui(false));
    rerender(ui(true));
    await flush();
    screen.getByText("inside").focus();
    const spy = spyFocus();
    rerender(ui(false));
    await flush();
    spy.restore();
    unmount();
    return { calls: spy.calls, opener };
  }

  it("returns to the opener with preventScroll", async () => {
    const { calls, opener } = await cycle();
    expect(last(calls)).toEqual({ el: opener, opts: { preventScroll: true } });
  });

  it("goes to returnFocus, or nowhere with false", async () => {
    const named = document.createElement("button");
    document.body.appendChild(named);
    expect(last((await cycle(named)).calls)?.el).toBe(named);
    expect((await cycle(false)).calls).toEqual([]);
  });
});

describe("shadcn Popover", () => {
  function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const P = shadcnAdapter.Popover;
    const B = shadcnAdapter.Button;
    return (
      <P
        label="Contact"
        open={open}
        onOpenChange={(o) => {
          onOpenChange?.(o);
          setOpen(o);
        }}
        trigger={(t) => (
          <B text="Org" {...t} onClick={() => setOpen((o) => !o)} />
        )}
      >
        <a href="mailto:x@example.com">mail</a>
      </P>
    );
  }

  it("puts the aria wiring on the button, not a wrapper", () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    expect(org).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(org).toHaveAttribute("aria-expanded", "true");
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab past the last element closes and focuses the trigger", async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    const mail = screen.getByText("mail");
    mail.focus();
    fireEvent.keyDown(mail, { key: "Tab" });
    await flush();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(org);
  });

  it("Esc closes and focuses the trigger", async () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    fireEvent.keyDown(screen.getByText("mail"), { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(org);
  });
});
