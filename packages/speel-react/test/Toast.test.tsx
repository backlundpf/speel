import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { ToastProvider } from "../src/toast/ToastProvider.js";
import { useToast } from "../src/toast/useToast.js";
import { fakeAdapter } from "./fakeAdapter.js";

function Trigger({ run }: { run: (t: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  return <button onClick={() => run(toast)}>fire</button>;
}
function mount(
  run: (t: ReturnType<typeof useToast>) => void,
  providerProps: Record<string, unknown> = {},
) {
  return render(
    <SpeelProvider db={{} as never} ui={fakeAdapter}>
      <ToastProvider {...providerProps}>
        <Trigger run={run} />
      </ToastProvider>
    </SpeelProvider>,
  );
}

describe("toasts", () => {
  it("shows a toast message", () => {
    mount((t) => t.success("Saved"));
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
  it("sets the intent", () => {
    mount((t) => t.error("Boom"));
    fireEvent.click(screen.getByText("fire"));
    expect(
      screen
        .getByText("Boom")
        .closest("[data-intent]")
        ?.getAttribute("data-intent"),
    ).toBe("error");
  });
  it("auto-dismisses after duration", () => {
    vi.useFakeTimers();
    try {
      mount((t) => t.info("Bye", { duration: 1000 }));
      fireEvent.click(screen.getByText("fire"));
      expect(screen.getByText("Bye")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByText("Bye")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("a sticky toast (duration null) stays", () => {
    vi.useFakeTimers();
    try {
      mount((t) => t.info("Stay", { duration: null }));
      fireEvent.click(screen.getByText("fire"));
      act(() => {
        vi.advanceTimersByTime(100000);
      });
      expect(screen.getByText("Stay")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("manual dismiss removes it", () => {
    mount((t) => t.info("Dismiss me", { duration: null }));
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Dismiss me")).toBeNull();
  });
  it("useToast outside a provider throws", () => {
    // SpeelProvider now mounts the toast host, so the throw only holds with no provider at all.
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow();
  });
  it("a per-toast position overrides the provider default", () => {
    mount((t) => t.info("Over here", { position: "bottom-center" }), {
      position: "top-right",
    });
    fireEvent.click(screen.getByText("fire"));
    expect(
      document.querySelector('[data-position="bottom-center"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-position="top-right"]')).toBeNull();
  });
  it("the portaled stack carries the host's font-family", () => {
    // jsdom's getComputedStyle does not cascade, so the value the in-flow probe
    // would inherit in a browser is stubbed in.
    const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontFamily: "TestFont, serif",
    } as CSSStyleDeclaration);
    try {
      mount((t) => t.info("Styled"));
      fireEvent.click(screen.getByText("fire"));
      const container = document.querySelector<HTMLElement>("[data-position]");
      expect(container?.style.fontFamily).toBe("TestFont, serif");
    } finally {
      spy.mockRestore();
    }
  });
  it("no measurable host font leaves the stack unstyled", () => {
    mount((t) => t.info("Plain"));
    fireEvent.click(screen.getByText("fire"));
    const container = document.querySelector<HTMLElement>("[data-position]");
    expect(container?.style.fontFamily).toBe("");
  });
  it('size "wide" widens the card; default is "normal"', () => {
    mount((t) => {
      t.info("Big", { size: "wide" });
      t.info("Small");
    });
    fireEvent.click(screen.getByText("fire"));
    expect(
      screen.getByText("Big").closest("[data-size]")?.getAttribute("data-size"),
    ).toBe("wide");
    expect(
      screen
        .getByText("Small")
        .closest("[data-size]")
        ?.getAttribute("data-size"),
    ).toBe("normal");
  });
});
