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
  type IdentityDbContext,
  type UserSettingsStore,
} from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { useTableViews } from "../src/table/views/useTableViews.js";
import {
  createLocalViewStore,
  type StoredView,
  type TableViewStore,
} from "../src/table/views/viewStore.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

/**
 * #105: the hook knows whether views (the view store) and the starting view (the settings
 * store) can be saved, and never writes where it can't.
 */

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

const mine: StoredView = {
  id: "v1",
  tableId: "t1",
  name: "Mine",
  descriptor: { columns: [] },
};

/** A view store holding one personal view, with an optional canSave and a save spy. */
function storeWith(canSave?: () => Promise<boolean>) {
  const save = vi.fn((v: StoredView) => Promise.resolve(v));
  const store: TableViewStore = {
    ...(canSave ? { canSave } : {}),
    list: () => Promise.resolve([mine]),
    save,
    remove: () => Promise.resolve(),
  };
  return Object.assign(store, { save });
}

const readOnlySettings = (): UserSettingsStore => ({
  ...createLocalUserSettingsStore(),
  canWrite: () => Promise.resolve(false),
});

function Probe({ store }: { store: TableViewStore | undefined }) {
  const v = useTableViews({
    tableId: "t1",
    ...(store ? { viewStore: store } : {}),
    defaultViews: [{ name: "All items", descriptor: { columns: [] } }],
    debounceMs: 0,
  });
  return (
    <div>
      <span data-testid="loading">{String(v.loading)}</span>
      <span data-testid="cansave">{String(v.canSaveViews)}</span>
      <span data-testid="canstart">{String(v.canSetStartingView)}</span>
      <span data-testid="canedit">{String(v.canEditActive)}</span>
      <span data-testid="count">{String(v.views.length)}</span>
      <span data-testid="error">{v.error ?? ""}</span>
      <span data-testid="pending">
        {String(v.dirty || v.pendingDefaultEdits)}
      </span>
      <button onClick={() => v.switchTo("v1")}>to mine</button>
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
    </div>
  );
}

function renderWith(
  store: TableViewStore | undefined,
  settings: UserSettingsStore = createLocalUserSettingsStore(),
) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  const identity = initSpeelIdentity(
    ctx as DbContext as IdentityDbContext,
    (b) => b.useProvider(new FakeIdentityProvider()).useSettings(settings),
  );
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter} identity={identity}>
      <Probe store={store} />
    </SpeelProvider>,
  );
}

const ready = () =>
  waitFor(() =>
    expect(screen.getByTestId("loading")).toHaveTextContent("false"),
  );
const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  window.localStorage.clear();
});

describe("useTableViews save permissions", () => {
  it("stores without the methods answer yes", async () => {
    renderWith(createLocalViewStore());
    await ready();
    expect(text("cansave")).toBe("true");
    expect(text("canstart")).toBe("true");
  });

  it("canSave false: no saving, and canEditActive is false on a personal view", async () => {
    renderWith(storeWith(() => Promise.resolve(false)));
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to mine"));
    });
    expect(text("cansave")).toBe("false");
    expect(text("canedit")).toBe("false");
  });

  it("does not save tweaks it can't write", async () => {
    const store = storeWith(() => Promise.resolve(false));
    renderWith(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to mine"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("hide column"));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.save).not.toHaveBeenCalled();
    expect(text("pending")).toBe("true");
  });

  it("a rejected check is no, and the lists still load", async () => {
    renderWith(storeWith(() => Promise.reject(new Error("403"))));
    await ready();
    expect(text("cansave")).toBe("false");
    expect(text("count")).toBe("1");
    expect(text("error")).toBe("");
  });

  it("custom view store, read-only settings", async () => {
    renderWith(storeWith(), readOnlySettings());
    await ready();
    expect(text("cansave")).toBe("true");
    expect(text("canstart")).toBe("false");
  });

  it("the default store follows the settings", async () => {
    renderWith(undefined, readOnlySettings());
    await ready();
    expect(text("cansave")).toBe("false");
    expect(text("canstart")).toBe("false");
  });

  it("a personal view the user can save stays editable", async () => {
    const store = storeWith(() => Promise.resolve(true));
    renderWith(store);
    await ready();
    act(() => {
      fireEvent.click(screen.getByText("to mine"));
    });
    expect(text("canedit")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByText("hide column"));
    });
    await waitFor(() => expect(store.save).toHaveBeenCalled());
  });
});
