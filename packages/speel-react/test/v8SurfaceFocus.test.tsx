import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { V8Dialog, V8Panel } from "../src/fluent-v8/primitives.js";
import type {
  DrawerProps,
  ReturnFocusTarget,
} from "../src/adapter/SpeelUIAdapter.js";
import { spyFocus, type FocusCall } from "./focusSpy.js";

const surfaces: [string, ComponentType<DrawerProps>][] = [
  ["V8Panel", V8Panel],
  ["V8Dialog", V8Dialog as ComponentType<DrawerProps>],
];

const tick = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
};

describe.each(surfaces)("%s focus return", (_name, Surface) => {
  let opener: HTMLButtonElement;
  beforeEach(() => {
    vi.useFakeTimers();
    opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  /** Open from the focused opener, focus inside, close; the focus calls the close made. */
  async function cycle(
    opts: { returnFocus?: ReturnFocusTarget; beforeClose?: () => void } = {},
  ): Promise<FocusCall[]> {
    opener.focus();
    const rf =
      opts.returnFocus !== undefined ? { returnFocus: opts.returnFocus } : {};
    const ui = (open: boolean) => (
      <Surface open={open} onOpenChange={() => {}} title="S" {...rf}>
        <button>inside</button>
      </Surface>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    await tick();
    screen.getByText("inside").focus();
    opts.beforeClose?.();
    const spy = spyFocus();
    rerender(ui(false));
    await tick();
    spy.restore();
    return spy.calls;
  }

  it("returns to the opener with preventScroll", async () => {
    const calls = await cycle();
    expect(calls).toEqual([{ el: opener, opts: { preventScroll: true } }]);
  });

  it("does not focus body when body had focus at open", async () => {
    opener.remove();
    document.body.focus();
    const calls = await cycle();
    expect(calls.filter((c) => c.el === document.body)).toEqual([]);
  });

  it("skips an opener removed before close", async () => {
    const calls = await cycle({ beforeClose: () => opener.remove() });
    expect(calls).toEqual([]);
  });

  it("goes to returnFocus when given", async () => {
    const named = document.createElement("button");
    document.body.appendChild(named);
    const calls = await cycle({ returnFocus: () => named });
    expect(calls).toEqual([{ el: named, opts: { preventScroll: true } }]);
  });

  it("moves nothing with returnFocus false", async () => {
    const calls = await cycle({ returnFocus: false });
    expect(calls).toEqual([]);
  });
});
