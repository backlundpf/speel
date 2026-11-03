import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

/** Dialogs and sheets are named by their title, else by ariaLabel — the v8 contract. */

const noop = (): void => {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["Dialog", ui.Dialog],
  ["Drawer", ui.Drawer],
] as const)("shadcn %s name", (_kind, Surface) => {
  it("titled surface is named by its title", () => {
    render(
      <Surface open onOpenChange={noop} title="History">
        body
      </Surface>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
  });

  it("untitled surface is named by ariaLabel", () => {
    render(
      <Surface open onOpenChange={noop} ariaLabel="History">
        body
      </Surface>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
    // The name is not painted as a heading the sighted user never asked for.
    expect(screen.getByText("History")).toHaveClass("sr-only");
  });

  it("title wins over ariaLabel", () => {
    render(
      <Surface open onOpenChange={noop} title="History" ariaLabel="Other">
        body
      </Surface>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
  });

  it("unnamed surface warns once and Radix stays quiet", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <Surface open onOpenChange={noop}>
        body
      </Surface>,
    );
    rerender(
      <Surface open onOpenChange={noop}>
        body again
      </Surface>,
    );
    const ours = warn.mock.calls.filter((c) =>
      String(c[0]).includes("ariaLabel"),
    );
    expect(ours).toHaveLength(1);
    expect(
      error.mock.calls.filter((c) => String(c[0]).includes("Title")),
    ).toHaveLength(0);
  });
});

describe("shadcn unnamed warning in production", () => {
  it("stays silent when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <ui.Dialog open onOpenChange={noop}>
          body
        </ui.Dialog>,
      );
      expect(
        warn.mock.calls.filter((c) => String(c[0]).includes("ariaLabel")),
      ).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("shadcn close buttons are named", () => {
  it("dialog Close", () => {
    render(
      <ui.Dialog open onOpenChange={noop} title="History">
        body
      </ui.Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("sheet Close", () => {
    render(
      <ui.Drawer open onOpenChange={noop} title="History">
        body
      </ui.Drawer>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
