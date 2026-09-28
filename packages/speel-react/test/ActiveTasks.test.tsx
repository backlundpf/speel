import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
