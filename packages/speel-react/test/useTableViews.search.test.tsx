import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import {
  createLocalUserSettingsStore,
  initSpeelIdentity,
} from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { useTableViews } from "../src/table/views/useTableViews.js";
import type {
  AppDefaultView,
  StoredView,
  TableViewStore,
} from "../src/table/views/viewStore.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}

const ALL: AppDefaultView = { name: "All items", descriptor: { columns: [] } };

const storeWith = (
  views: StoredView[],
): TableViewStore & { rows: StoredView[] } => {
  const rows = [...views];
  let n = 0;
  return {
    rows,
    list: () => Promise.resolve([...rows]),
    save: (v) => {
      const saved = { ...v, id: v.id === "" ? `p${(n += 1)}` : v.id };
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx === -1) rows.push(saved);
      else rows[idx] = saved;
      return Promise.resolve(saved);
    },
    remove: () => Promise.resolve(),
  };
};

function Probe({ store }: { store: TableViewStore }): React.ReactElement {
  const v = useTableViews({
    tableId: "t1",
    viewStore: store,
    defaultViews: [ALL],
    debounceMs: 0,
  });
  return (
    <div>
      <span data-testid="loading">{String(v.loading)}</span>
      <span data-testid="active">
        {v.activeView?.name ?? v.activeDefaultView.name}
      </span>
      <span data-testid="search">{v.table.tableState.search ?? ""}</span>
      <span data-testid="dirty">{String(v.dirty)}</span>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            search: "smith",
            page: 0,
          })
        }
      >
        search smith
      </button>
      <button onClick={() => void v.saveAs("Mine")}>save as</button>
      <button onClick={() => void v.save()}>save</button>
      {v.picker}
    </div>
  );
}

const renderProbe = (store: TableViewStore = storeWith([])) => {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  const identity = initSpeelIdentity(ctx, (b) =>
    b
      .useProvider(new FakeIdentityProvider())
      .useSettings(createLocalUserSettingsStore()),
  );
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter} identity={identity}>
      <Probe store={store} />
    </SpeelProvider>,
  );
};

const at = (search: string): void => {
  window.history.replaceState(null, "", `/page${search}`);
  __resetUrlStoreForTests();
};

const ready = async (): Promise<void> => {
  await waitFor(() =>
    expect(screen.getByTestId("loading")).toHaveTextContent("false"),
  );
};

const question = (): Record<string, unknown> | null => {
  const raw = new URLSearchParams(window.location.search).get("t1");
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};

beforeEach(() => {
  at("");
  window.localStorage.clear();
});

describe("the search is part of the question", () => {
  it("arrives from the URL", async () => {
    at(`?t1=${encodeURIComponent('{"f":{},"q":"smith"}')}`);
    renderProbe();
    await ready();
    expect(screen.getByTestId("search")).toHaveTextContent("smith");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("is written to the URL and dirties the view when committed", async () => {
    renderProbe();
    await ready();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "search smith" }));
    });
    expect(question()).toEqual({ f: {}, q: "smith" });
    expect(screen.getByTestId("search")).toHaveTextContent("smith");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("saves into a view and opens with it", async () => {
    const store = storeWith([]);
    renderProbe(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "search smith" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save as" }));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    expect(store.rows[0]?.descriptor.search).toBe("smith");
    // The saved view now asks the question, so nothing is dirty.
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(screen.getByTestId("search")).toHaveTextContent("smith");
  });

  it("is dropped by a URL question that does not carry it — the blob speaks wholesale", async () => {
    const store = storeWith([
      {
        id: "p1",
        tableId: "t1",
        name: "Mine",
        descriptor: { columns: [], search: "smith" },
      },
    ]);
    at(`?t1.v=Mine&t1=${encodeURIComponent('{"f":{}}')}`);
    renderProbe(store);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Mine");
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
  });
});
