import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { initSpeelIdentity } from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { useUserSetting } from "../src/settings/useUserSetting.js";
import type { UserSettingsStore } from "@speel/identity";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Thing {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Thing, (b) => {
      b.toList("Things");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}

function spyStore(initial: Record<string, unknown> = {}) {
  const set = vi.fn(() => Promise.resolve());
  const store: UserSettingsStore = {
    getAll: () => Promise.resolve({ ...initial }),
    set: (k, v) => set(k, v),
    remove: () => Promise.resolve(),
  };
  return { set, store };
}

function Probe(): React.ReactElement {
  const [dark, setDark, ready] = useUserSetting("theme.dark", false);
  return (
    <div>
      <span data-testid="dark">{String(dark)}</span>
      <span data-testid="ready">{String(ready)}</span>
      <button onClick={() => setDark(true)}>on</button>
      <button onClick={() => setDark(false)}>off</button>
    </div>
  );
}

/** Settings reach the hook through identity now, so a bare store is wrapped in one. */
const identityWith = (ctx: unknown, store: UserSettingsStore) =>
  initSpeelIdentity(ctx as never, (b) =>
    b.useProvider(new FakeIdentityProvider()).useSettings(store),
  );

const renderProbe = (store?: UserSettingsStore) => {
  const ctx = new TCtx({ provider: makeFakeProvider({ Things: [] }) } as never);
  return render(
    <SpeelProvider
      db={ctx as never}
      ui={fakeAdapter}
      {...(store ? { identity: identityWith(ctx, store) } : {})}
    >
      <Probe />
    </SpeelProvider>,
  );
};

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("useUserSetting", () => {
  it("returns the default until the store resolves", async () => {
    const { store } = spyStore({ "theme.dark": true });
    renderProbe(store);
    expect(screen.getByTestId("dark")).toHaveTextContent("false");
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("dark")).toHaveTextContent("true");
  });

  it("reads synchronously after load, so a preference does not flash", async () => {
    const { store } = spyStore({ "theme.dark": true });
    renderProbe(store);
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("dark")).toHaveTextContent("true");
  });

  it("applies a write optimistically and flushes it after the debounce", async () => {
    const { set, store } = spyStore();
    renderProbe(store);
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );

    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    expect(screen.getByTestId("dark")).toHaveTextContent("true"); // immediate
    expect(set).not.toHaveBeenCalled(); // not yet written

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(set).toHaveBeenCalledWith("theme.dark", true);
  });

  it("collapses repeated writes to one key into a single store call", async () => {
    const { set, store } = spyStore();
    renderProbe(store);
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );

    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    act(() => {
      fireEvent.click(screen.getByText("off"));
    });
    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("theme.dark", true);
  });

  it("flushes a pending write on pagehide, since the page may not survive the debounce", async () => {
    const { set, store } = spyStore();
    renderProbe(store);
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );

    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    expect(set).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(set).toHaveBeenCalledWith("theme.dark", true);
  });

  it("keeps the in-memory value when a write fails", async () => {
    const { store } = spyStore();
    vi.spyOn(store, "set").mockRejectedValue(new Error("offline"));
    renderProbe(store);
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true"),
    );

    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("dark")).toHaveTextContent("true"); // not reverted
  });

  it("works without a store at all, never becoming ready", async () => {
    renderProbe();
    expect(screen.getByTestId("dark")).toHaveTextContent("false");
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    act(() => {
      fireEvent.click(screen.getByText("on"));
    });
    expect(screen.getByTestId("dark")).toHaveTextContent("true"); // still usable in-session
  });
});
