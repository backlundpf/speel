import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

/** Modal size and placement come from `style` (and the presets without it) — the v8 contract. */

const noop = (): void => {};
const Dialog = ui.Dialog;

describe("shadcn Dialog sizing", () => {
  it("no style keeps the medium preset", () => {
    render(
      <Dialog open onOpenChange={noop} title="Sized">
        body
      </Dialog>,
    );
    const d = screen.getByRole("dialog");
    expect(d.style.width).toBe("640px");
    expect(d.style.height).toBe("560px");
  });

  it("style width and auto height reach the frame", () => {
    render(
      <Dialog
        open
        onOpenChange={noop}
        title="Sized"
        style={{ width: "300px", height: "auto" }}
      >
        body
      </Dialog>,
    );
    const d = screen.getByRole("dialog");
    expect(d.style.width).toBe("300px");
    expect(d.style.height).toBe("auto");
  });

  it("defaultFullscreen opens maximized", () => {
    render(
      <Dialog open onOpenChange={noop} title="Sized" defaultFullscreen>
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog").style.width).toBe("96vw");
  });

  it("is described by ariaDescribedBy", () => {
    render(
      <Dialog open onOpenChange={noop} title="Sized" ariaDescribedBy="desc">
        <p id="desc">Body text</p>
      </Dialog>,
    );
    expect(
      screen.getByRole("dialog", { description: "Body text" }),
    ).toBeInTheDocument();
  });

  it("initialFocus picks what takes focus on open", async () => {
    render(
      <Dialog
        open
        onOpenChange={noop}
        title="Sized"
        footer={<button id="safe">Cancel</button>}
        initialFocus={() => document.getElementById("safe")}
      >
        <input aria-label="field" />
      </Dialog>,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("safe")),
    );
  });
});

describe("shadcn Drawer sizing", () => {
  const Drawer = ui.Drawer;
  it("no style keeps the medium preset at today's cap", () => {
    render(
      <Drawer open onOpenChange={noop} title="P">
        body
      </Drawer>,
    );
    const d = screen.getByRole("dialog");
    expect(d.style.width).toBe("640px");
    expect(d.style.maxWidth).toBe("96vw");
  });

  it("style width and maxWidth reach the panel; the screen still wins", () => {
    render(
      <Drawer
        open
        onOpenChange={noop}
        title="P"
        style={{ width: "40vw", maxWidth: "700px" }}
      >
        body
      </Drawer>,
    );
    const d = screen.getByRole("dialog");
    expect(d.style.width).toBe("40vw");
    expect(d.style.maxWidth).toBe("min(700px, 96vw)");
  });
});
