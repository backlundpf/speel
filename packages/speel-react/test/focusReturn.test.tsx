import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import {
  returnFocusTo,
  tabbablesIn,
  useFocusReturn,
} from "../src/surface/focusReturn.js";
import type { ReturnFocusTarget } from "../src/adapter/SpeelUIAdapter.js";
import { spyFocus } from "./focusSpy.js";

const button = (name: string): HTMLButtonElement => {
  const b = document.createElement("button");
  b.textContent = name;
  document.body.appendChild(b);
  return b;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("returnFocusTo", () => {
  it("focuses the target without scrolling when focus is nowhere", () => {
    const target = button("t");
    const spy = spyFocus();
    returnFocusTo(target, false);
    spy.restore();
    expect(spy.calls).toEqual([{ el: target, opts: { preventScroll: true } }]);
    expect(document.activeElement).toBe(target);
  });

  it("skips body, a detached element and a missing one", () => {
    const gone = document.createElement("button");
    const spy = spyFocus();
    returnFocusTo(document.body, true);
    returnFocusTo(gone, true);
    returnFocusTo(null, true);
    spy.restore();
    expect(spy.calls).toEqual([]);
  });

  it("leaves focus where the user put it unless it was inside the surface", () => {
    const target = button("t");
    const elsewhere = button("elsewhere");
    elsewhere.focus();
    returnFocusTo(target, false);
    expect(document.activeElement).toBe(elsewhere);
    returnFocusTo(target, true);
    expect(document.activeElement).toBe(target);
  });
});

describe("tabbablesIn", () => {
  it("lists enabled, tabbable controls in order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<button>a</button><button disabled>b</button><span tabindex="-1">c</span><a href="#">d</a><input type="hidden">';
    document.body.appendChild(root);
    expect(tabbablesIn(root).map((e) => e.textContent)).toEqual(["a", "d"]);
  });
});

function Probe(p: {
  open: boolean;
  returnFocus?: ReturnFocusTarget;
  expose: (restore: (inside: boolean) => void) => void;
}): null {
  const { restore } = useFocusReturn({
    open: p.open,
    returnFocus: p.returnFocus,
  });
  p.expose(restore);
  return null;
}

/** Opens with `opener` focused, then moves focus to body as a closing surface would. */
function openAndClose(returnFocus?: ReturnFocusTarget): {
  restore: (inside: boolean) => void;
  opener: HTMLButtonElement;
} {
  const opener = button("opener");
  opener.focus();
  let restore: (inside: boolean) => void = () => {};
  const expose = (r: (inside: boolean) => void): void => {
    restore = r;
  };
  const props = returnFocus !== undefined ? { returnFocus } : {};
  const { rerender } = render(
    <Probe open={false} expose={expose} {...props} />,
  );
  rerender(<Probe open expose={expose} {...props} />);
  rerender(<Probe open={false} expose={expose} {...props} />);
  opener.blur();
  return { restore, opener };
}

describe("useFocusReturn", () => {
  it("returns focus to the opener captured when it opened", () => {
    const { restore, opener } = openAndClose();
    const spy = spyFocus();
    restore(true);
    spy.restore();
    expect(spy.calls).toEqual([{ el: opener, opts: { preventScroll: true } }]);
  });

  it("returnFocus as an element goes there instead", () => {
    const named = button("named");
    const { restore } = openAndClose(named);
    restore(true);
    expect(document.activeElement).toBe(named);
  });

  it("returnFocus as a function is called at close, and falls back to the opener on null", () => {
    let calls = 0;
    const { restore, opener } = openAndClose(() => {
      calls++;
      return null;
    });
    expect(calls).toBe(0);
    restore(true);
    expect(calls).toBe(1);
    expect(document.activeElement).toBe(opener);
  });

  it("returnFocus false moves nothing", () => {
    const { restore } = openAndClose(false);
    const spy = spyFocus();
    restore(true);
    spy.restore();
    expect(spy.calls).toEqual([]);
  });
});
