import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { ActiveTasksProvider } from "../src/tasks/ActiveTasksProvider.js";
import type {
  ActiveTasksApi,
  TaskHandle,
} from "../src/tasks/ActiveTasksProvider.js";
import { useActiveTasks } from "../src/tasks/useActiveTasks.js";
import { fakeAdapter } from "./fakeAdapter.js";

function mountApi(): { current: ActiveTasksApi | null } {
  const apiRef = { current: null as ActiveTasksApi | null };
  function Capture(): null {
    apiRef.current = useActiveTasks();
    return null;
  }
  render(
    <SpeelProvider db={{} as never} ui={fakeAdapter}>
      <ActiveTasksProvider>
        <Capture />
      </ActiveTasksProvider>
    </SpeelProvider>,
  );
  return apiRef;
}

describe("active tasks", () => {
  it("routes a blocking task to the overlay and a non-blocking task to the stack (no bar without progress)", () => {
    const api = mountApi();
    act(() => {
      api.current!.begin({ label: "Saving", blocking: true });
    });
    expect(screen.getByTestId("blocking-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("task-stack")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => {
      api.current!.begin({ label: "Loading" });
    });
    expect(screen.getByTestId("task-stack")).toBeInTheDocument();
    expect(screen.getByText("Saving")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("a completed blocking task leaves the overlay, lingers in the stack, then is removed", () => {
    vi.useFakeTimers();
    try {
      const api = mountApi();
      let h!: TaskHandle;
      act(() => {
        h = api.current!.begin({ label: "Deleting", blocking: true });
      });
      expect(screen.getByTestId("blocking-overlay")).toBeInTheDocument();
      act(() => {
        h.done();
      });
      expect(screen.queryByTestId("blocking-overlay")).toBeNull();
      expect(screen.getByTestId("task-stack")).toBeInTheDocument();
      expect(screen.getByText("Deleting")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByTestId("task-stack")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a task with progress shows the percentage and a determinate bar", () => {
    const api = mountApi();
    let h!: TaskHandle;
    act(() => {
      h = api.current!.begin({ label: "Uploading" });
    });
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => {
      h.update({ progress: 0.6 });
    });
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").getAttribute("data-state")).toBe(
      "determinate",
    );
  });

  it("updating a task resets its aging timeout", () => {
    vi.useFakeTimers();
    try {
      const api = mountApi();
      let h!: TaskHandle;
      act(() => {
        h = api.current!.begin({ label: "Indexing", expectedMs: 1000 });
      });
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(900);
      });
      act(() => {
        h.update({ label: "Indexing more" });
      });
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.queryByText("Aging")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("Aging")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("run resolves the work value and clears the task after persistence", async () => {
    vi.useFakeTimers();
    try {
      const api = mountApi();
      let result: string | undefined;
      await act(async () => {
        result = await api.current!.run(() => Promise.resolve("ok"), {
          label: "Quick",
        });
      });
      expect(result).toBe("ok");
      expect(screen.getByText("Completed")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByTestId("task-stack")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("run rethrows on failure and marks the task failed", async () => {
    vi.useFakeTimers();
    try {
      const api = mountApi();
      let caught: unknown;
      await act(async () => {
        try {
          await api.current!.run(() => Promise.reject(new Error("nope")), {
            label: "Broken",
          });
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as Error).message).toBe("nope");
      expect(screen.getByText("Failed")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByTestId("task-stack")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a still-running task ages after its expectedMs", () => {
    vi.useFakeTimers();
    try {
      const api = mountApi();
      act(() => {
        api.current!.begin({ label: "Slow", expectedMs: 1000 });
      });
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText("Aging")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the portaled stack and blocking overlay carry the host's font-family", () => {
    // jsdom's getComputedStyle does not cascade, so the value the in-flow probe
    // would inherit in a browser is stubbed in.
    const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontFamily: "TestFont, serif",
    } as CSSStyleDeclaration);
    try {
      const api = mountApi();
      act(() => {
        api.current!.begin({ label: "Loading" });
        api.current!.begin({ label: "Saving", blocking: true });
      });
      expect(screen.getByTestId("task-stack").style.fontFamily).toBe(
        "TestFont, serif",
      );
      expect(screen.getByTestId("blocking-overlay").style.fontFamily).toBe(
        "TestFont, serif",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("no measurable host font leaves the surfaces unstyled", () => {
    const api = mountApi();
    act(() => {
      api.current!.begin({ label: "Loading" });
    });
    expect(screen.getByTestId("task-stack").style.fontFamily).toBe("");
  });

  it("useActiveTasks outside a provider throws", () => {
    // SpeelProvider now mounts the active-tasks host, so the throw only holds with no provider at all.
    function Bad(): null {
      useActiveTasks();
      return null;
    }
    expect(() => render(<Bad />)).toThrow();
  });
});

describe("a blocking task holds the background still (#45)", () => {
  function mountWithBackground(): {
    api: { current: ActiveTasksApi | null };
    onKey: ReturnType<typeof vi.fn>;
    button: HTMLButtonElement;
    container: HTMLElement;
  } {
    const apiRef = { current: null as ActiveTasksApi | null };
    const onKey = vi.fn();
    function Capture(): null {
      apiRef.current = useActiveTasks();
      return null;
    }
    const { container } = render(
      <SpeelProvider db={{} as never} ui={fakeAdapter}>
        <Capture />
        <button onKeyDown={onKey}>Save</button>
      </SpeelProvider>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    return {
      api: apiRef,
      onKey,
      button: button as HTMLButtonElement,
      container,
    };
  }

  it("the overlay announces itself and takes focus into its status region", () => {
    const { api, button } = mountWithBackground();
    button.focus();
    act(() => {
      api.current!.begin({ label: "Saving", blocking: true });
    });
    const overlay = screen.getByTestId("blocking-overlay");
    expect(overlay).toHaveAttribute("role", "alertdialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(overlay).toHaveAttribute("aria-busy", "true");
    const status = screen.getByRole("status");
    expect(overlay).toContainElement(status);
    expect(overlay).toHaveAttribute("aria-labelledby", status.id);
    expect(status).toHaveTextContent("Saving");
    expect(document.activeElement).toBe(status);
  });

  it("the background is inert (and hidden from AT where inert is unsupported)", () => {
    const { api, container } = mountWithBackground();
    act(() => {
      api.current!.begin({ label: "Saving", blocking: true });
    });
    expect(container).toHaveAttribute("inert");
    // jsdom has no native inert, so the fallback applies too.
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("blocking-overlay")).not.toHaveAttribute("inert");
  });

  it("a keydown on a background control triggers nothing while blocking", () => {
    const { api, onKey, button } = mountWithBackground();
    act(() => {
      api.current!.begin({ label: "Saving", blocking: true });
    });
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("focus that wanders into the background is pulled back to the overlay", () => {
    const { api, button } = mountWithBackground();
    act(() => {
      api.current!.begin({ label: "Saving", blocking: true });
    });
    act(() => {
      button.focus();
    });
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("the last blocking task ending lifts the block and gives focus back", () => {
    const { api, onKey, button, container } = mountWithBackground();
    button.focus();
    let a!: TaskHandle, b!: TaskHandle;
    act(() => {
      a = api.current!.begin({ label: "One", blocking: true });
      b = api.current!.begin({ label: "Two", blocking: true });
    });
    act(() => {
      a.done();
    });
    // One blocking task still running: still blocked.
    expect(container).toHaveAttribute("inert");
    act(() => {
      b.done();
    });
    expect(screen.queryByTestId("blocking-overlay")).toBeNull();
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("does not restore focus to an element that left the document", () => {
    const { api } = mountWithBackground();
    const gone = document.createElement("button");
    document.body.appendChild(gone);
    gone.focus();
    let h!: TaskHandle;
    act(() => {
      h = api.current!.begin({ label: "Saving", blocking: true });
    });
    gone.remove();
    act(() => {
      h.done();
    });
    expect(document.activeElement).not.toBe(gone);
  });

  it("covers body-level portals too, including ones opened mid-task, and leaves their own attributes alone", async () => {
    const { api } = mountWithBackground();
    // A modal layer portaled to the body before the task, already aria-hidden by its owner.
    const before = document.createElement("div");
    before.setAttribute("aria-hidden", "true");
    document.body.appendChild(before);
    let h!: TaskHandle;
    act(() => {
      h = api.current!.begin({ label: "Saving", blocking: true });
    });
    expect(before).toHaveAttribute("inert");
    // A layer that opens while the task runs.
    const during = document.createElement("div");
    document.body.appendChild(during);
    await act(async () => {
      await Promise.resolve();
    });
    expect(during).toHaveAttribute("inert");
    act(() => {
      h.done();
    });
    expect(before).not.toHaveAttribute("inert");
    expect(before).toHaveAttribute("aria-hidden", "true");
    expect(during).not.toHaveAttribute("inert");
    before.remove();
    during.remove();
  });

  it("toasts and the running-task stack stay reachable above the scrim", () => {
    const { api } = mountWithBackground();
    act(() => {
      api.current!.begin({ label: "Loading" });
      api.current!.begin({ label: "Saving", blocking: true });
    });
    expect(screen.getByTestId("task-stack")).not.toHaveAttribute("inert");
  });
});
