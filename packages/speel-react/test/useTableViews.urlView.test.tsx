import { describe, it, expect, beforeEach, vi } from "vitest";
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
import type { SharedTableViewStore } from "../src/table/views/sharedViewStore.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"]);
    });
  }
}

const ALL: AppDefaultView = { name: "All items", descriptor: { columns: [] } };
const SUBMITTED: AppDefaultView = {
  name: "Submitted",
  descriptor: { columns: [], sort: { key: "Title", direction: "desc" } },
};
const RETURNED: AppDefaultView = {
  name: "Returned to GFS",
  descriptor: { columns: [], sort: { key: "Id", direction: "asc" } },
};

const storeWith = (views: StoredView[]): TableViewStore => {
  const rows = [...views];
  let n = 0;
  return {
    list: () => Promise.resolve([...rows]),
    save: (v) => {
      const saved = { ...v, id: v.id === "" ? `p${(n += 1)}` : v.id };
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx === -1) rows.push(saved);
      else rows[idx] = saved;
      return Promise.resolve(saved);
    },
    remove: (id) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) rows.splice(idx, 1);
      return Promise.resolve();
    },
  };
};

const sharedWith = (views: StoredView[]): SharedTableViewStore => ({
  ...storeWith(views),
  canPublish: () => Promise.resolve(false),
});

function Probe({
  defaultViews,
  store,
  shared,
}: {
  defaultViews: readonly AppDefaultView[];
  store: TableViewStore;
  shared?: SharedTableViewStore;
}): React.ReactElement {
  const v = useTableViews({
    tableId: "t1",
    viewStore: store,
    defaultViews,
    debounceMs: 0,
    ...(shared ? { sharedViewStore: shared } : {}),
  });
  return (
    <div>
      <span data-testid="loading">{String(v.loading)}</span>
      <span data-testid="active">
        {v.activeView?.name ?? v.activeDefaultView.name}
      </span>
      <span data-testid="kind">
        {v.activeView === undefined
          ? "app"
          : v.activeIsShared
            ? "shared"
            : "personal"}
      </span>
      <span data-testid="sort">{v.table.tableState.sort?.key ?? ""}</span>
      <span data-testid="filters">
        {Object.entries(v.table.tableState.filters ?? {})
          .map(
            ([k, c]) =>
              `${k}=${c.kind === "select" ? c.selected.join("|") : c.kind}`,
          )
          .join(",")}
      </span>
      <span data-testid="dirty">{String(v.dirty)}</span>
      <button onClick={() => void v.saveAs("Mine")}>save as</button>
      <button onClick={() => void v.rename("Ours")}>rename</button>
      <button onClick={() => void v.remove()}>delete</button>
      {v.picker}
    </div>
  );
}

const renderProbe = (
  defaultViews: readonly AppDefaultView[],
  store: TableViewStore = storeWith([]),
  shared?: SharedTableViewStore,
) => {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  const identity = initSpeelIdentity(ctx, (b) =>
    b
      .useProvider(new FakeIdentityProvider())
      .useSettings(createLocalUserSettingsStore()),
  );
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter} identity={identity}>
      <Probe
        defaultViews={defaultViews}
        store={store}
        {...(shared ? { shared } : {})}
      />
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

const pick = (trigger: string, item: string): void => {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: item }));
};

const viewParam = (): string | null =>
  new URLSearchParams(window.location.search).get("t1.v");

beforeEach(() => {
  at("");
  window.localStorage.clear();
});

describe("<prefix>.v is written when a view is selected", () => {
  it("names the app-authored view that was picked", async () => {
    renderProbe([ALL, SUBMITTED, RETURNED]);
    await ready();
    pick("All items", "Submitted");
    expect(viewParam()).toBe("Submitted");
  });

  it("survives a name with spaces in it", async () => {
    renderProbe([ALL, SUBMITTED, RETURNED]);
    await ready();
    pick("All items", "Returned to GFS");
    expect(viewParam()).toBe("Returned to GFS");
  });

  it("clears on the default view — a bare URL still means the default", async () => {
    renderProbe([ALL, SUBMITTED, RETURNED]);
    await ready();
    pick("All items", "Submitted");
    pick("Submitted", "All items");
    expect(viewParam()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("names a stored view too", async () => {
    renderProbe(
      [ALL],
      storeWith([
        { id: "v1", tableId: "t1", name: "Mine", descriptor: { columns: [] } },
      ]),
    );
    await ready();
    pick("All items", "Mine");
    expect(viewParam()).toBe("Mine");
  });

  it("selecting a view is not unsaved work", async () => {
    renderProbe([ALL, SUBMITTED]);
    await ready();
    pick("All items", "Submitted");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("follows a new view out of Save as, and drops the address on delete", async () => {
    const store = storeWith([]);
    renderProbe([ALL], store);
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() => expect(viewParam()).toBe("Mine"));
    await act(async () => {
      fireEvent.click(screen.getByText("rename"));
    });
    await waitFor(() => expect(viewParam()).toBe("Ours"));
    await act(async () => {
      fireEvent.click(screen.getByText("delete"));
    });
    await waitFor(() => expect(viewParam()).toBeNull());
  });
});

describe("<prefix>.v selects a view on arrival", () => {
  it("resolves an app-authored view by name", async () => {
    at("?t1.v=Submitted");
    renderProbe([ALL, SUBMITTED, RETURNED]);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Submitted");
    expect(screen.getByTestId("kind")).toHaveTextContent("app");
    expect(screen.getByTestId("sort")).toHaveTextContent("Title");
  });

  it("resolves a personal stored view by name", async () => {
    at("?t1.v=Overdue");
    renderProbe(
      [ALL],
      storeWith([
        {
          id: "v1",
          tableId: "t1",
          name: "Overdue",
          descriptor: {
            columns: [],
            sort: { key: "Status", direction: "asc" },
          },
        },
      ]),
    );
    await ready();
    expect(screen.getByTestId("kind")).toHaveTextContent("personal");
    expect(screen.getByTestId("sort")).toHaveTextContent("Status");
  });

  it("resolves a shared view by name", async () => {
    at("?t1.v=Overdue");
    renderProbe(
      [ALL],
      storeWith([]),
      sharedWith([
        {
          id: "s1",
          tableId: "t1",
          name: "Overdue",
          descriptor: { columns: [], sort: { key: "Id", direction: "asc" } },
        },
      ]),
    );
    await ready();
    expect(screen.getByTestId("kind")).toHaveTextContent("shared");
    expect(screen.getByTestId("sort")).toHaveTextContent("Id");
  });

  it("resolves app first, then personal, then shared", async () => {
    const collide = (id: string, sort: string): StoredView => ({
      id,
      tableId: "t1",
      name: "Overdue",
      descriptor: { columns: [], sort: { key: sort, direction: "asc" } },
    });
    at("?t1.v=Overdue");
    const { unmount } = renderProbe(
      [
        ALL,
        {
          name: "Overdue",
          descriptor: { columns: [], sort: { key: "Title", direction: "asc" } },
        },
      ],
      storeWith([collide("v1", "Status")]),
      sharedWith([collide("s1", "Id")]),
    );
    await ready();
    expect(screen.getByTestId("kind")).toHaveTextContent("app");
    expect(screen.getByTestId("sort")).toHaveTextContent("Title");
    unmount();

    at("?t1.v=Overdue");
    renderProbe(
      [ALL],
      storeWith([collide("v1", "Status")]),
      sharedWith([collide("s1", "Id")]),
    );
    await ready();
    expect(screen.getByTestId("kind")).toHaveTextContent("personal");
    expect(screen.getByTestId("sort")).toHaveTextContent("Status");
  });

  it("outranks the user's own starting view — the link says what this visit is about", async () => {
    window.localStorage.setItem(
      "speel.userSettings",
      JSON.stringify({ "table.startingView.t1": "v1" }),
    );
    at("?t1.v=Submitted");
    renderProbe(
      [ALL, SUBMITTED],
      storeWith([
        {
          id: "v1",
          tableId: "t1",
          name: "Start here",
          descriptor: { columns: [] },
        },
      ]),
    );
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Submitted");
  });

  it("warns once about a name nobody has, and shows the default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    at("?t1.v=Deleted%20view");
    renderProbe([ALL, SUBMITTED]);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("All items");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[speel] table 't1': url view 'Deleted view' not found — using the default view.",
    );
    // A re-render says nothing further.
    pick("All items", "Submitted");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("lets an explicit question override the view it arrived with", async () => {
    // The blob is what the table itself would have written: the FULL question,
    // the view's own sort included.
    const blob = { f: { Status: "s:Closed" }, s: "Title:desc" };
    at(`?t1.v=Submitted&t1=${encodeURIComponent(JSON.stringify(blob))}`);
    renderProbe([ALL, SUBMITTED]);
    await ready();
    // The view is selected…
    expect(screen.getByTestId("active")).toHaveTextContent("Submitted");
    expect(screen.getByTestId("sort")).toHaveTextContent("Title");
    // …and the question sits on top of it, exactly as an in-session tweak would.
    expect(screen.getByTestId("filters")).toHaveTextContent("Status=Closed");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("answers for the sort too: a question without one is unsorted", async () => {
    // Wholesale — the blob speaks for the whole question, so a hand-written one
    // that omits the sort does NOT inherit the view's.
    at(`?t1.v=Submitted&t1=${encodeURIComponent('{"f":{}}')}`);
    renderProbe([ALL, SUBMITTED]);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Submitted");
    expect(screen.getByTestId("sort")).toBeEmptyDOMElement();
  });
});
