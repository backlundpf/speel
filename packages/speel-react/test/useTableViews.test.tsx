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
import { useTableViews } from "../src/table/views/useTableViews.js";
import { createLocalViewStore } from "../src/table/views/viewStore.js";
import type {
  StoredView,
  TableViewStore,
} from "../src/table/views/viewStore.js";
import type { SharedTableViewStore } from "../src/table/views/sharedViewStore.js";
import {
  createLocalUserSettingsStore,
  initSpeelIdentity,
} from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

// The hook renders its own picker, so it needs the skin — same provider requirement as the
// table it is used with.
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
/**
 * Settings in localStorage rather than the UserSetting list: this context is a plain DbContext,
 * and the point of these tests is the view hook, not where preferences are stored.
 */
const identityFor = (ctx: DbContext) =>
  initSpeelIdentity(ctx, (b) =>
    b
      .useProvider(new FakeIdentityProvider())
      .useSettings(createLocalUserSettingsStore()),
  );

const renderProbe = (store: TableViewStore, shared?: SharedTableViewStore) => {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider
      db={ctx as never}
      ui={fakeAdapter}
      identity={identityFor(ctx)}
    >
      <Probe store={store} {...(shared ? { shared } : {})} />
    </SpeelProvider>,
  );
};

/** A shared store whose contents and permission are controllable from a test. */
export function fakeShared(
  canPublish: boolean,
  seed: StoredView[] = [],
): SharedTableViewStore {
  const rows = new Map(seed.map((v) => [v.id, v]));
  let n = 0;
  return {
    list: (tableId) =>
      Promise.resolve([...rows.values()].filter((v) => v.tableId === tableId)),
    save: (view) => {
      const id = view.id === "" ? `s${(n += 1)}` : view.id;
      const saved = { ...view, id };
      rows.set(id, saved);
      return Promise.resolve(saved);
    },
    remove: (id) => {
      rows.delete(id);
      return Promise.resolve();
    },
    canPublish: () => Promise.resolve(canPublish),
  };
}

const defaultView = { name: "All items", descriptor: { columns: [] } };

function Probe({
  store,
  shared,
}: {
  store: TableViewStore;
  shared?: SharedTableViewStore;
}): React.ReactElement {
  const v = useTableViews({
    tableId: "t1",
    viewStore: store,
    defaultViews: [defaultView],
    debounceMs: 0,
    ...(shared ? { sharedViewStore: shared } : {}),
  });
  return (
    <div>
      <span data-testid="loading">{String(v.loading)}</span>
      <span data-testid="dirty">{String(v.dirty)}</span>
      <span data-testid="active">
        {v.activeView?.name ?? v.activeDefaultView.name}
      </span>
      <span data-testid="views">{v.views.map((x) => x.name).join(",")}</span>
      <span data-testid="shared">
        {v.sharedViews.map((x) => x.name).join(",")}
      </span>
      <span data-testid="canpublish">{String(v.canPublish)}</span>
      <span data-testid="caneditactive">{String(v.canEditActive)}</span>
      <span data-testid="isshared">{String(v.activeIsShared)}</span>
      <button onClick={() => void v.publish()}>publish</button>
      <button onClick={() => void v.unpublish()}>unpublish</button>
      <button onClick={() => void v.setStartingView()}>start here</button>
      <span data-testid="error">{v.error ?? ""}</span>
      <span data-testid="sort">{v.table.tableState.sort?.key ?? ""}</span>
      <span data-testid="cols">
        {v.table.tableState.columns.map((c) => c.key).join(",")}
      </span>
      <span data-testid="page">{String(v.table.tableState.page ?? 0)}</span>
      <span data-testid="pagesize">
        {String(v.table.tableState.pageSize ?? "")}
      </span>
      <span data-testid="cleared">
        {(v.table.tableState.clearedScope ?? []).join(",")}
      </span>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            page: 2,
          })
        }
      >
        next page
      </button>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            clearedScope: ["Status"],
          })
        }
      >
        dismiss scope
      </button>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            pageSize: 25,
            page: 0,
          })
        }
      >
        page size 25
      </button>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            sort: { key: "Title", direction: "asc" },
          })
        }
      >
        sort
      </button>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            sort: { key: "Status", direction: "desc" },
          })
        }
      >
        sort other
      </button>
      <button
        onClick={() =>
          v.table.onTableStateChange({
            ...v.table.tableState,
            columns: [{ key: "Title", hidden: true }],
          })
        }
      >
        hide column
      </button>
      <button onClick={() => void v.saveAs("Mine")}>save as</button>
      <button onClick={() => void v.save()}>save</button>
      <button onClick={() => v.reset()}>reset</button>
      <button onClick={() => v.switchTo(undefined)}>to default</button>
      <button onClick={() => v.switchTo("s0")}>to shared</button>
    </div>
  );
}

/** This table's one question param, decoded. */
const question = (): Record<string, unknown> | null => {
  const raw = new URLSearchParams(window.location.search).get("t1");
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};

const ready = async (): Promise<void> => {
  await waitFor(() =>
    expect(screen.getByTestId("loading")).toHaveTextContent("false"),
  );
};

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  window.localStorage.clear();
});

describe("useTableViews", () => {
  it("gates on the store so the layout never flips under the user", async () => {
    renderProbe(createLocalViewStore());
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    await ready();
  });

  it("starts clean and writes nothing to the URL on load", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(window.location.search).toBe("");
  });

  it("goes dirty and writes params on the first change", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    // One param carries the whole question — filters (none), sort, page.
    expect(question()).toEqual({ f: {}, s: "Title:asc" });
  });

  it("reads a deep link on first render", async () => {
    window.history.replaceState(
      null,
      "",
      `/page?t1=${encodeURIComponent(JSON.stringify({ s: "Title:desc" }))}`,
    );
    __resetUrlStoreForTests();
    renderProbe(createLocalViewStore());
    await ready();
    expect(screen.getByTestId("sort")).toHaveTextContent("Title");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("reset clears the params and the dirty flag", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    act(() => {
      fireEvent.click(screen.getByText("reset"));
    });
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("save-as mints a view, switches to it, and clears the params", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    // The question is folded into the view, so its params go; what is left is the address of
    // the view now selected, which is what a refresh needs to land back on it.
    expect(window.location.search).toBe("?t1.v=Mine");
    expect(screen.getByTestId("sort")).toHaveTextContent("Title"); // folded into the view
  });

  it("switching a view clears the params, or the URL would override the pick", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    // A *different* question — re-applying the view's own sort would correctly clear instead.
    act(() => {
      fireEvent.click(screen.getByText("sort other"));
    });
    expect(window.location.search).not.toBe("");
    act(() => {
      fireEvent.click(screen.getByText("to default"));
    });
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("active")).toHaveTextContent("All items");
  });

  it("holds column edits on the pristine default instead of storing them", async () => {
    const store = createLocalViewStore();
    renderProbe(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("hide column"));
    });
    expect(screen.getByTestId("cols")).toHaveTextContent("Title"); // applied…
    expect(await store.list("t1")).toEqual([]); // …but not stored
  });

  it("writes column edits through to a stored view", async () => {
    const store = createLocalViewStore();
    renderProbe(store);
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    await act(async () => {
      fireEvent.click(screen.getByText("hide column"));
    });
    await waitFor(async () => {
      const saved = await store.list("t1");
      expect(saved[0]!.descriptor.columns).toEqual([
        { key: "Title", hidden: true },
      ]);
    });
  });

  it("keeps the arrangement and surfaces an error when a save fails", async () => {
    const store = createLocalViewStore();
    vi.spyOn(store, "save").mockRejectedValue(new Error("offline"));
    renderProbe(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("offline"),
    );
    expect(screen.getByTestId("dirty")).toHaveTextContent("true"); // not reverted
  });

  it("keeps a page change, even though it is the same question", async () => {
    // Regression: page was compared out of "same question", so turning a page looked like a
    // revert and the params were cleared — the next-page button did nothing at all.
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("next page"));
    });
    expect(screen.getByTestId("page")).toHaveTextContent("2");
    expect(question()).toEqual({ f: {}, pg: 2 });
  });

  it("carries a dismissed scope chip in the question", async () => {
    // A dismissal used to ride as a sentinel on a per-column filter key; it is `cs`
    // inside the blob now.
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("dismiss scope"));
    });
    expect(question()).toEqual({ f: {}, cs: ["Status"] });
  });

  it("reads a dismissed scope back out of a shared link", async () => {
    window.history.replaceState(
      null,
      "",
      `/page?t1=${encodeURIComponent(JSON.stringify({ cs: ["Status"] }))}`,
    );
    __resetUrlStoreForTests();
    renderProbe(createLocalViewStore());
    await ready();
    expect(screen.getByTestId("cleared")).toHaveTextContent("Status");
  });

  it("keeps a page change made alongside a filter or sort", async () => {
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("sort"));
    });
    act(() => {
      fireEvent.click(screen.getByText("next page"));
    });
    expect(screen.getByTestId("page")).toHaveTextContent("2");
  });

  it("persists a page-size change instead of snapping back", async () => {
    // Regression: pageSize was routed neither to the URL nor to the view, and tableState
    // recomputed it from the view every render, so the picker reverted instantly.
    const store = createLocalViewStore();
    renderProbe(store);
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    await act(async () => {
      fireEvent.click(screen.getByText("page size 25"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("pagesize")).toHaveTextContent("25"),
    );
    await waitFor(async () => {
      const saved = await store.list("t1");
      expect(saved[0]!.descriptor.pageSize).toBe(25);
    });
  });

  it("holds a page-size change on the pristine default, like a column edit", async () => {
    const store = createLocalViewStore();
    renderProbe(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("page size 25"));
    });
    expect(screen.getByTestId("pagesize")).toHaveTextContent("25"); // applied…
    expect(await store.list("t1")).toEqual([]); // …but not stored
  });

  it("reset discards held presentation too, not just the params", async () => {
    // "Discard changes" has to mean all of it. Column and page-size edits made on the
    // pristine default live in session state, and leaving them behind would make the
    // button a liar.
    renderProbe(createLocalViewStore());
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("hide column"));
    });
    act(() => {
      fireEvent.click(screen.getByText("page size 25"));
    });
    expect(screen.getByTestId("cols")).toHaveTextContent("Title");
    act(() => {
      fireEvent.click(screen.getByText("reset"));
    });
    expect(screen.getByTestId("cols")).toHaveTextContent("");
    expect(screen.getByTestId("pagesize")).toHaveTextContent("");
  });

  it("loads the starting view named in user settings", async () => {
    const store = createLocalViewStore();
    const saved = await store.save({
      id: "",
      tableId: "t1",
      name: "Start here",
      descriptor: { columns: [{ key: "Status" }] },
    });
    // The pointer is a per-user setting now, not a flag on the record.
    window.localStorage.setItem(
      "speel.userSettings",
      JSON.stringify({ "table.startingView.t1": saved.id }),
    );
    renderProbe(store);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Start here");
    expect(screen.getByTestId("cols")).toHaveTextContent("Status");
  });
});

describe("useTableViews with shared views", () => {
  const shared = (canPublish: boolean) =>
    fakeShared(canPublish, [
      { id: "s0", tableId: "t1", name: "Overdue", descriptor: { columns: [] } },
    ]);

  it("lists shared views apart from personal ones", async () => {
    renderProbe(createLocalViewStore(), shared(false));
    await ready();
    expect(screen.getByTestId("shared")).toHaveTextContent("Overdue");
    expect(screen.getByTestId("views")).toHaveTextContent("");
  });

  it("a shared view is read-only when the user cannot publish", async () => {
    renderProbe(createLocalViewStore(), shared(false));
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to shared"));
    });
    expect(screen.getByTestId("isshared")).toHaveTextContent("true");
    expect(screen.getByTestId("caneditactive")).toHaveTextContent("false");
  });

  it("a shared view is editable when the user can publish", async () => {
    renderProbe(createLocalViewStore(), shared(true));
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to shared"));
    });
    expect(screen.getByTestId("canpublish")).toHaveTextContent("true");
    expect(screen.getByTestId("caneditactive")).toHaveTextContent("true");
  });

  it("publish MOVES the view: gone from personal, present in shared, and active", async () => {
    const personal = createLocalViewStore();
    const sh = shared(true);
    renderProbe(personal, sh);
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("publish"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("isshared")).toHaveTextContent("true"),
    );
    expect(await personal.list("t1")).toEqual([]); // moved, not copied
    expect((await sh.list("t1")).map((v) => v.name)).toContain("Mine");
    expect(screen.getByTestId("active")).toHaveTextContent("Mine");
  });

  it("unpublish moves it back", async () => {
    const personal = createLocalViewStore();
    const sh = shared(true);
    renderProbe(personal, sh);
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByText("save as"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    await act(async () => {
      fireEvent.click(screen.getByText("publish"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("isshared")).toHaveTextContent("true"),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("unpublish"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("isshared")).toHaveTextContent("false"),
    );
    expect((await personal.list("t1")).map((v) => v.name)).toContain("Mine");
  });

  it("remembers the starting view in user settings, not on the record", async () => {
    const settingsBacked = createLocalUserSettingsStore();
    void settingsBacked;
    renderProbe(createLocalViewStore(), shared(false));
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to shared"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("start here"));
    });
    // Settings writes are debounced; pagehide is the provider's flush path.
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    const raw = window.localStorage.getItem("speel.userSettings") ?? "{}";
    expect(JSON.parse(raw)["table.startingView.t1"]).toBe("s0");
  });

  it("falls back to the app default when the starting view no longer exists", async () => {
    window.localStorage.setItem(
      "speel.userSettings",
      JSON.stringify({ "table.startingView.t1": "deleted-id" }),
    );
    renderProbe(createLocalViewStore(), shared(false));
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("All items");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });
});
