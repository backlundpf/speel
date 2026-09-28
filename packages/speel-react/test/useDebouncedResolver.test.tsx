import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useDebouncedResolver } from "../src/fields/useDebouncedResolver.js";

/** Fake timers on purpose: a real-timer debounce test is a flake waiting for a
 *  loaded CI box, and the thing under test IS the timing. */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function Probe({
  resolve,
  onAnswer,
}: {
  resolve: (q: string) => Promise<string[]>;
  onAnswer: (items: string[]) => void;
}): JSX.Element {
  const debounced = useDebouncedResolver(resolve, 200);
  return (
    <button
      onClick={() => {
        void debounced((window as { __q?: string }).__q ?? "").then(onAnswer);
      }}
    >
      ask
    </button>
  );
}

/** Fire `ask` with a query, the way a picker calls its resolver per keystroke. */
const ask = (q: string): void => {
  (window as { __q?: string }).__q = q;
  screen.getByRole("button", { name: "ask" }).click();
};

describe("useDebouncedResolver", () => {
  it("asks once for a burst of keystrokes, with the last query", async () => {
    const resolve = vi.fn(async (q: string) => [q]);
    render(<Probe resolve={resolve} onAnswer={() => {}} />);

    ask("l");
    ask("lo");
    ask("lon");
    expect(resolve).not.toHaveBeenCalled(); // still inside the window

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("lon");
  });

  it("settles every caller in the burst, not just the last", async () => {
    const answers: string[][] = [];
    render(
      <Probe
        resolve={async (q: string) => [q]}
        onAnswer={(items) => answers.push(items)}
      />,
    );

    ask("l");
    ask("lo");
    ask("lon");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Three calls, three settled promises — a picker left awaiting one that
    // never settles hangs its suggestion list forever.
    expect(answers).toEqual([["lon"], ["lon"], ["lon"]]);
  });

  it("asks again once the window has passed", async () => {
    const resolve = vi.fn(async (q: string) => [q]);
    render(<Probe resolve={resolve} onAnswer={() => {}} />);

    ask("a");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    ask("b");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenLastCalledWith("b");
  });

  it("settles empty when the search fails, rather than rejecting", async () => {
    const answers: string[][] = [];
    render(
      <Probe
        resolve={async () => {
          throw new Error("Graph is down");
        }}
        onAnswer={(items) => answers.push(items)}
      />,
    );

    ask("x");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // A picker has nowhere to put an exception; an unhandled rejection in a
    // keystroke handler is worse than an empty list.
    expect(answers).toEqual([[]]);
  });
});
