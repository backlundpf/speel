import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { V8Dialog, V8Panel } from "../src/fluent-v8/primitives.js";

/**
 * Every modal and panel has an accessible name — its title, else `ariaLabel` (#97) —
 * and the panel's close button is named (#96).
 */

const noop = (): void => {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("V8Dialog name", () => {
  it("modal is named by its title", () => {
    render(
      <V8Dialog open onOpenChange={noop} title="History">
        body
      </V8Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
  });

  it("untitled modal is named by ariaLabel", () => {
    render(
      <V8Dialog open onOpenChange={noop} ariaLabel="History">
        body
      </V8Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
  });

  it("title wins over ariaLabel", () => {
    render(
      <V8Dialog open onOpenChange={noop} title="History" ariaLabel="Other">
        body
      </V8Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
  });

  it("unnamed modal warns once in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <V8Dialog open onOpenChange={noop}>
        body
      </V8Dialog>,
    );
    rerender(
      <V8Dialog open onOpenChange={noop}>
        body again
      </V8Dialog>,
    );
    const ours = warn.mock.calls.filter((c) => String(c[0]).includes("ariaLabel"));
    expect(ours).toHaveLength(1);
  });
});

describe("V8Panel name and close button", () => {
  it("panel is named by its title", () => {
    render(
      <V8Panel open onOpenChange={noop} title="Details">
        body
      </V8Panel>,
    );
    expect(screen.getByRole("dialog", { name: "Details" })).toBeInTheDocument();
  });

  it("untitled panel is named by ariaLabel", () => {
    render(
      <V8Panel open onOpenChange={noop} ariaLabel="Details">
        body
      </V8Panel>,
    );
    expect(screen.getByRole("dialog", { name: "Details" })).toBeInTheDocument();
  });

  it("panel close button is named", () => {
    render(
      <V8Panel open onOpenChange={noop} title="Details">
        body
      </V8Panel>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("blocking panel has no close button", () => {
    render(
      <V8Panel open blocking onOpenChange={noop} title="Details">
        body
      </V8Panel>,
    );
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });
});
