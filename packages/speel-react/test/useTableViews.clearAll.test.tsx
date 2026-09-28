import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { useTableViews } from "../src/table/views/useTableViews.js";
import type {
  AppDefaultView,
  TableViewStore,
} from "../src/table/views/viewStore.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  FiscalYear?: string;
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
    });
  }
}

const rows = [
  Object.assign(new Task(), {
    Id: 1,
    Title: "Alpha",
    Status: "Open",
    FiscalYear: "2026",
  }),
  Object.assign(new Task(), {
    Id: 2,
    Title: "Beta",
    Status: "Closed",
    FiscalYear: "2025",
  }),
];
const cols = [{ key: "Title" }, { key: "Status" }, { key: "FiscalYear" }];

/** A "Current FY"-style view: one whose baseline carries two filters. */
const scopedView: AppDefaultView = {
  name: "Current FY",
  descriptor: {
    columns: [],
    filters: {
      Status: { kind: "select", selected: ["Open"] },
      FiscalYear: { kind: "select", selected: ["2026"] },
    },
  },
};

const emptyStore = (): TableViewStore => ({
  list: () => Promise.resolve([]),
  save: (v) => Promise.resolve(v),
  remove: () => Promise.resolve(),
});

// Module-level: a fresh store per render would retrigger the views load effect
// forever (the exact trap sharedViewStoreFor's memoisation exists to prevent).
const store = emptyStore();

function ViewsTable(): JSX.Element {
  const v = useTableViews({
    tableId: "t1",
    viewStore: store,
    defaultViews: [scopedView],
    debounceMs: 0,
  });
  return <SpeelTable of={Task} items={rows} columns={cols} {...v.table} />;
}

function wrap(): ReturnType<typeof render> {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <ViewsTable />
    </SpeelProvider>,
  );
}

/** The one param the table owns, decoded. */
const question = (): Record<string, unknown> | null => {
  const raw = new URLSearchParams(window.location.search).get("t1");
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};

/** A link carrying `blob` as this table's question. */
const at = (blob: unknown): void => {
  window.history.replaceState(
    null,
    "",
    `/page?t1=${encodeURIComponent(JSON.stringify(blob))}`,
  );
  __resetUrlStoreForTests();
};

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  window.localStorage.clear();
});

describe("clear-all against a view baseline", () => {
  it("clearing every filter STAYS cleared instead of resurrecting the view's baseline", async () => {
    wrap();
    // Baseline applied: only the Open/2026 row shows.
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    });

    screen.getByRole("button", { name: "Clear" }).click();

    // Both rows visible — and they STAY visible (the regression re-applied the
    // baseline because an empty overlay was indistinguishable from no overlay).
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
    // The blob is present and says "no filters" — which is a different thing
    // from the blob being absent.
    expect(question()).toEqual({ f: {} });
  });

  it("a cleared question hydrates unfiltered despite the baseline", async () => {
    at({ f: {} });
    wrap();
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
  });

  it("removing one chip still narrows to the remaining filter", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    screen.getByRole("button", { name: "Clear Status" }).click();
    await waitFor(() => {
      // FiscalYear=2026 still applies: Beta (2025) stays hidden.
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    });
    // The whole effective question is written, so the removal is the absence of
    // the key inside a blob that lists everything still asked.
    expect(question()).toEqual({ f: { FiscalYear: "s:2026" } });
  });

  it("a question that names one filter ignores the baseline's other one", async () => {
    // Wholesale: the blob answers for the filters entirely, so Status=Open is
    // gone even though the view asks for it.
    at({ f: { FiscalYear: "s:2025" } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    });
  });

  it("warns once about a blob it cannot read and falls back to the view", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/page?t1=%7Bnope");
    __resetUrlStoreForTests();
    wrap();
    // The baseline stands, exactly as a bare URL would give it.
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[speel] table 't1': the url question could not be read — using the view instead.",
    );
    // Re-rendering says nothing further.
    screen.getByRole("button", { name: "Clear Status" }).click();
    await waitFor(() => expect(question()).not.toBeNull());
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
