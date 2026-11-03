import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
import type { ConfirmRequest } from "../src/surface/SurfaceManager.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class TCtx extends DbContext {
  protected override onModelCreating(_mb: ModelBuilder): void {}
}

/** Opens one confirm on click and records what its promise settled to. */
async function openConfirm(
  opts: ConfirmRequest,
): Promise<{ result: () => boolean | undefined }> {
  let settled: boolean | undefined;
  function Opener() {
    const { confirm } = useSurfaces();
    return (
      <button
        onClick={() => {
          void confirm(opts).then((v) => {
            settled = v;
          });
        }}
      >
        ask
      </button>
    );
  }
  render(
    <SpeelProvider
      db={new TCtx({ provider: makeFakeProvider({}) } as never) as never}
      ui={fakeAdapter}
    >
      <Opener />
    </SpeelProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("ask"));
  });
  return { result: () => settled };
}

const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(el);
  });
};

const base: ConfirmRequest = {
  title: "Delete item?",
  message: "This cannot be undone.",
  confirmText: "Delete",
};

describe("useSurfaces().confirm", () => {
  it("resolves true on confirm and closes", async () => {
    const c = await openConfirm(base);
    await click(screen.getByText("Delete"));
    expect(c.result()).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const c = await openConfirm(base);
    await click(screen.getByText("Cancel"));
    expect(c.result()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves false when the dialog is closed", async () => {
    const c = await openConfirm(base);
    await click(screen.getByLabelText("Close"));
    expect(c.result()).toBe(false);
  });

  it("is named by its title and described by its message", async () => {
    await openConfirm(base);
    expect(
      screen.getByRole("dialog", {
        name: "Delete item?",
        description: "This cannot be undone.",
      }),
    ).toBeInTheDocument();
  });

  it("a destructive confirm opens on Cancel", async () => {
    await openConfirm({ ...base, destructive: true });
    expect(document.activeElement).toBe(screen.getByText("Cancel"));
  });

  it("any other confirm opens on the confirm button", async () => {
    await openConfirm(base);
    expect(document.activeElement).toBe(screen.getByText("Delete"));
  });

  it("is content-sized, with no resize, drag or fullscreen", async () => {
    await openConfirm(base);
    const d = screen.getByRole("dialog");
    expect(JSON.parse(d.getAttribute("data-style")!)).toEqual({
      height: "auto",
    });
    expect(d).toHaveAttribute("data-draggable", "false");
    expect(screen.queryByTestId("resize-handle")).toBeNull();
    expect(screen.queryByLabelText("Toggle fullscreen")).toBeNull();
  });

  it("destructive marks the confirm button as danger", async () => {
    await openConfirm({ ...base, destructive: true });
    expect(screen.getByText("Delete")).toHaveAttribute(
      "data-appearance",
      "danger",
    );
  });

  it("defaults to OK and Cancel, confirm first", async () => {
    await openConfirm({ title: "Continue?", message: "Sure?" });
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => ["OK", "Cancel"].includes(b.textContent ?? ""));
    expect(buttons.map((b) => b.textContent)).toEqual(["OK", "Cancel"]);
    expect(screen.getByText("OK")).toHaveAttribute(
      "data-appearance",
      "primary",
    );
  });
});
