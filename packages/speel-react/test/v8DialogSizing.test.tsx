import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { V8Button, V8Dialog } from "../src/fluent-v8/primitives.js";
import type { DialogProps } from "../src/adapter/SpeelUIAdapter.js";

const tick = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
};

const main = (): CSSStyleDeclaration =>
  getComputedStyle(document.querySelector(".ms-Dialog-main") as HTMLElement);

function open(p: Partial<DialogProps> = {}) {
  return render(
    <V8Dialog open onOpenChange={() => {}} title="Sized" {...p}>
      {p.children ?? <p id="desc">Body text</p>}
    </V8Dialog>,
  );
}

describe("V8Dialog sizing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("no style keeps the medium preset", async () => {
    open();
    await tick();
    expect(main().width).toBe("640px");
    expect(main().height).toBe("560px");
  });

  it("style width and auto height reach the frame", async () => {
    open({ style: { width: "300px", height: "auto" } });
    await tick();
    expect(main().width).toBe("300px");
    expect(main().height).toBe("auto");
  });

  it("is described by ariaDescribedBy", async () => {
    open({ ariaDescribedBy: "desc" });
    await tick();
    expect(
      screen.getByRole("dialog", { description: "Body text" }),
    ).toBeInTheDocument();
  });

  it("initialFocus picks what takes focus on open", async () => {
    open({
      footer: <button id="safe">Cancel</button>,
      initialFocus: () => document.getElementById("safe"),
      children: <input aria-label="field" />,
    });
    await tick();
    expect(document.activeElement).toBe(document.getElementById("safe"));
  });

  it("initialFocus wins even when something inside took focus first", async () => {
    // On a real page Fluent's focus trap focuses the first focusable before speel's
    // deferred focus runs; the caller's initialFocus must still win.
    open({
      footer: <button id="safe">Cancel</button>,
      initialFocus: () => document.getElementById("safe"),
      children: <input aria-label="field" autoFocus />,
    });
    await tick();
    expect(document.activeElement).toBe(document.getElementById("safe"));
  });

  it("leaving fullscreen returns an untouched auto modal to auto", async () => {
    open({ style: { height: "auto" } });
    await tick();
    fireEvent.click(screen.getByLabelText("Toggle fullscreen"));
    expect(main().height).toBe("92vh");
    fireEvent.click(screen.getByLabelText("Toggle fullscreen"));
    expect(main().height).toBe("auto");
  });
});

describe("V8Button id", () => {
  it("reaches the button element, with or without a tooltip", () => {
    render(
      <>
        <V8Button text="Plain" id="b1" />
        <V8Button text="Tipped" id="b2" tooltip="Hint" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute(
      "id",
      "b1",
    );
    expect(screen.getByRole("button", { name: "Tipped" })).toHaveAttribute(
      "id",
      "b2",
    );
  });
});
