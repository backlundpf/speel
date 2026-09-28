import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

/** The shape this exists for: quick links reborn as app-authored views. */
const OPEN: AppDefaultView = {
  name: "Open",
  descriptor: {
    columns: [],
    filters: { Status: { kind: "select", selected: ["Open"] } },
  },
};
const SUBMITTED: AppDefaultView = {
  name: "Submitted",
  descriptor: { columns: [], sort: { key: "Title", direction: "desc" } },
};
const RETURNED: AppDefaultView = {
  name: "Returned to GFS",
  descriptor: { columns: [{ key: "Status" }] },
};

const storeWith = (views: StoredView[]): TableViewStore => ({
  list: () => Promise.resolve(views),
  save: (v) => Promise.resolve(v),
  remove: () => Promise.resolve(),
});

function Probe({
  store,
  defaultViews,
}: {
  store: TableViewStore;
  defaultViews: readonly AppDefaultView[];
}): React.ReactElement {
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
      <span data-testid="sort">{v.table.tableState.sort?.key ?? ""}</span>
      <span data-testid="filters">
        {Object.keys(v.table.tableState.filters ?? {}).join(",")}
      </span>
      <span data-testid="cols">
        {v.table.tableState.columns.map((c) => c.key).join(",")}
      </span>
      {v.picker}
    </div>
  );
}

const renderProbe = (
  defaultViews: readonly AppDefaultView[],
  store: TableViewStore = storeWith([]),
) => {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  const identity = initSpeelIdentity(ctx, (b) =>
    b
      .useProvider(new FakeIdentityProvider())
      .useSettings(createLocalUserSettingsStore()),
  );
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter} identity={identity}>
      <Probe store={store} defaultViews={defaultViews} />
    </SpeelProvider>,
  );
};

const ready = async (): Promise<void> => {
  await waitFor(() =>
    expect(screen.getByTestId("loading")).toHaveTextContent("false"),
  );
};

/** Opens the picker menu by clicking whatever the trigger currently reads. */
const openMenu = (name: string): void => {
  fireEvent.click(screen.getByRole("button", { name }));
};

/** Silences React's own "error during render" log so a thrown-mount test reads cleanly. */
const quietRender = (): { mockRestore: () => void } =>
  vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  window.localStorage.clear();
});

describe("useTableViews with several app-authored views", () => {
  it("lists them in author order, above the user's own", async () => {
    renderProbe(
      [OPEN, SUBMITTED, RETURNED],
      storeWith([
        { id: "v1", tableId: "t1", name: "Mine", descriptor: { columns: [] } },
      ]),
    );
    await ready();
    openMenu("Open");
    expect(
      screen.getAllByRole("menuitemcheckbox").map((i) => i.textContent),
    ).toEqual(["Open", "Submitted", "Returned to GFS", "Mine"]);
  });

  it("starts on the first entry, applying its descriptor", async () => {
    renderProbe([OPEN, SUBMITTED, RETURNED]);
    await ready();
    expect(screen.getByTestId("active")).toHaveTextContent("Open");
    expect(screen.getByTestId("filters")).toHaveTextContent("Status");
    openMenu("Open");
    const checked = screen
      .getAllByRole("menuitemcheckbox")
      .filter((i) => i.getAttribute("aria-checked") === "true")
      .map((i) => i.textContent);
    expect(checked).toEqual(["Open"]);
  });

  it("applies another entry's descriptor when it is picked", async () => {
    renderProbe([OPEN, SUBMITTED, RETURNED]);
    await ready();
    openMenu("Open");
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Submitted" }),
    );
    expect(screen.getByTestId("active")).toHaveTextContent("Submitted");
    expect(screen.getByTestId("sort")).toHaveTextContent("Title");
    // Open's filter belongs to Open, not to the table.
    expect(screen.getByTestId("filters")).toHaveTextContent("");
  });

  it("goes back to the default entry", async () => {
    renderProbe([OPEN, SUBMITTED, RETURNED]);
    await ready();
    openMenu("Open");
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Submitted" }),
    );
    openMenu("Submitted");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Open" }));
    expect(screen.getByTestId("active")).toHaveTextContent("Open");
    expect(screen.getByTestId("filters")).toHaveTextContent("Status");
  });

  it("refuses two app-authored views with the same name", () => {
    const err = quietRender();
    expect(() =>
      renderProbe([OPEN, SUBMITTED, { ...RETURNED, name: "Open" }]),
    ).toThrow("useTableViews: duplicate app-default view name 'Open'.");
    err.mockRestore();
  });

  it("refuses an empty list — a table is never viewless", () => {
    const err = quietRender();
    expect(() => renderProbe([])).toThrow(
      "useTableViews: defaultViews is empty — supply at least one app-authored view.",
    );
    err.mockRestore();
  });
});
