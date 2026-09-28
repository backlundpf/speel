import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { useTableViews } from "../src/table/views/useTableViews.js";
import type {
  StoredView,
  TableViewStore,
} from "../src/table/views/viewStore.js";
import type { AppDefaultView } from "../src/table/views/viewStore.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  FiscalYear?: string;
  Secret?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
      b.property((e) => e.FiscalYear)
        .isChoice()
        .hasOptions(["2025", "2026"])
        .hasDisplayName("Fiscal Year");
      b.property((e) => e.Secret)
        .isText()
        .useTableFilter({ kind: "none" })
        .hasDisplayName("Secret");
    });
  }
}

function wrap(node: JSX.Element) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}

const rows = [
  Object.assign(new Task(), {
    Id: 1,
    Title: "A",
    Status: "Open",
    FiscalYear: "2026",
    Secret: "s1",
  }),
  Object.assign(new Task(), {
    Id: 2,
    Title: "B",
    Status: "Closed",
    FiscalYear: "2025",
    Secret: "s2",
  }),
];
const cols = [{ key: "Title" }, { key: "Status" }];

/** Silences React's own "error during render" log so a thrown-mount test reads cleanly. */
const quietRender = (): { mockRestore: () => void } =>
  vi.spyOn(console, "error").mockImplementation(() => undefined);

function ViewsTable({
  store,
  defaultViews,
}: {
  store: TableViewStore;
  defaultViews: readonly AppDefaultView[];
}): JSX.Element {
  const v = useTableViews({
    tableId: "t1",
    viewStore: store,
    defaultViews,
    debounceMs: 0,
  });
  return (
    <div>
      <span data-testid="loading">{String(v.loading)}</span>
      <span data-testid="active">
        {v.activeView?.name ?? v.activeDefaultView.name}
      </span>
      <button onClick={() => v.switchTo("v1")}>to saved</button>
      <SpeelTable of={Task} items={rows} columns={cols} {...v.table} />
    </div>
  );
}

const storeWith = (views: StoredView[]): TableViewStore => ({
  list: () => Promise.resolve(views),
  save: (v) => Promise.resolve(v),
  remove: () => Promise.resolve(),
});

const plainDefault: AppDefaultView = {
  name: "All items",
  descriptor: { columns: [] },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  window.localStorage.clear();
});

describe("developer-authored filter sources throw on a miss", () => {
  it("throws for a scope filter key that names nothing", () => {
    const err = quietRender();
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          columns={cols}
          scope={{ filters: { Nope: { kind: "text", query: "x" } } }}
        />,
      ),
    ).toThrow(
      "SpeelTable: scope filter key 'Nope' matches no column or model field on Task.",
    );
    err.mockRestore();
  });

  it("throws for a scope filter key on a field that cannot be filtered", () => {
    const err = quietRender();
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          columns={cols}
          scope={{ filters: { Secret: { kind: "text", query: "s1" } } }}
        />,
      ),
    ).toThrow("SpeelTable: scope filter key 'Secret' is not filterable.");
    err.mockRestore();
  });

  it("throws for a defaultTableState filter key that names nothing", () => {
    const err = quietRender();
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          columns={cols}
          defaultTableState={{
            columns: [],
            filters: { Nope: { kind: "text", query: "x" } },
          }}
        />,
      ),
    ).toThrow(
      "SpeelTable: defaultTableState filter key 'Nope' matches no column or model field on Task.",
    );
    err.mockRestore();
  });

  it("throws for an app-default view whose filter key names nothing", () => {
    const err = quietRender();
    expect(() =>
      wrap(
        <ViewsTable
          store={storeWith([])}
          defaultViews={[
            {
              name: "Current FY",
              descriptor: {
                columns: [],
                filters: { Nope: { kind: "text", query: "x" } },
              },
            },
          ]}
        />,
      ),
    ).toThrow(
      "SpeelTable: default view 'Current FY' filter key 'Nope' matches no column or model field on Task.",
    );
    err.mockRestore();
  });

  it("throws for a bad key in an app view nobody has selected yet", () => {
    // Every app-authored view is source code, so waiting until someone picks the third one to
    // discover its filter names nothing is exactly the silent failure this rule exists for.
    const err = quietRender();
    expect(() =>
      wrap(
        <ViewsTable
          store={storeWith([])}
          defaultViews={[
            plainDefault,
            {
              name: "Submitted",
              descriptor: {
                columns: [],
                filters: { Nope: { kind: "text", query: "x" } },
              },
            },
          ]}
        />,
      ),
    ).toThrow(
      "SpeelTable: default view 'Submitted' filter key 'Nope' matches no column or model field on Task.",
    );
    err.mockRestore();
  });

  it("accepts a select criteria on a text-filtering key: exact membership, no throw", async () => {
    wrap(
      <ViewsTable
        store={storeWith([])}
        defaultViews={[
          {
            name: "Only A",
            descriptor: {
              columns: [],
              filters: { Title: { kind: "select", selected: ["A"] } },
            },
          },
        ]}
      />,
    );
    // The matcher dispatches on the CRITERIA's kind — select against a text
    // config is set-membership and has always worked at match time. The
    // authored-kind check must not reject what the matcher supports.
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.queryByText("B")).not.toBeInTheDocument();
    });
  });

  it("does not throw when the key resolves against the model instead of a column", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={cols}
        scope={{
          filters: { FiscalYear: { kind: "select", selected: ["2026"] } },
        }}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();
  });
});

describe("user-carried filter state warns once and is ignored", () => {
  it("warns once for a saved view's dead key, and still applies its live ones", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    wrap(
      <ViewsTable
        store={storeWith([
          {
            id: "v1",
            tableId: "t1",
            name: "Mine",
            descriptor: {
              columns: [],
              filters: {
                Nope: { kind: "text", query: "x" },
                Status: { kind: "select", selected: ["Open"] },
              },
            },
          },
        ])}
        defaultViews={[plainDefault]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByText("to saved"));
    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Mine"),
    );
    // The live key still narrows; the dead one is simply dropped.
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[speel] table 't1': saved view filter key 'Nope' matches no column or model field — ignored.",
    );

    // Re-render: the warning does not repeat.
    fireEvent.click(screen.getByRole("button", { name: /^Title/ }));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("warns once for a URL filter key that names nothing", async () => {
    const blob = { f: { Nope: "t:x", Status: "s:Open" } };
    window.history.replaceState(
      null,
      "",
      `/page?t1=${encodeURIComponent(JSON.stringify(blob))}`,
    );
    __resetUrlStoreForTests();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    wrap(<ViewsTable store={storeWith([])} defaultViews={[plainDefault]} />);
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[speel] table 't1': url filter key 'Nope' matches no column or model field — ignored.",
    );
    warn.mockRestore();
  });
});
