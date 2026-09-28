import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import {
  createLocalUserSettingsStore,
  initSpeelIdentity,
} from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { useTableViews } from "../src/table/views/useTableViews.js";
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
      b.property((e) => e.Title).isText();
    });
  }
}

const DEFAULT_VIEW = {
  name: "All",
  descriptor: { sort: [], filters: {}, columns: undefined },
};

function Probe(): JSX.Element {
  // No viewStore: the hook picks one.
  const views = useTableViews({
    tableId: "tasks",
    defaultViews: [DEFAULT_VIEW] as never,
  });
  return <div>{views.loading ? "loading" : `views:${views.views.length}`}</div>;
}

function renderWith(identity?: unknown) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider
      db={ctx as never}
      ui={fakeAdapter}
      {...(identity ? { identity: identity as never } : {})}
    >
      <Probe />
    </SpeelProvider>,
  );
}

function identityWithLocalSettings() {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return initSpeelIdentity(ctx as never, (b) =>
    b
      .useProvider(new FakeIdentityProvider())
      .useSettings(createLocalUserSettingsStore()),
  );
}

describe("useTableViews default store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetUrlStoreForTests();
  });

  it("works with no view store and no identity at all", async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText("views:0")).toBeTruthy());
  });

  it("reads views from settings when identity is wired", async () => {
    const identity = identityWithLocalSettings();
    // Seeded through the settings store, so it is only visible if the hook chose that store
    // rather than the per-browser one.
    await identity.settings.set("table.view.tasks.v1", {
      id: "v1",
      tableId: "tasks",
      name: "Mine",
      descriptor: DEFAULT_VIEW.descriptor,
    });
    renderWith(identity);
    await waitFor(() => expect(screen.getByText("views:1")).toBeTruthy());
  });

  it("does not see settings-backed views when no identity is wired", async () => {
    const identity = identityWithLocalSettings();
    await identity.settings.set("table.view.tasks.v1", {
      id: "v1",
      tableId: "tasks",
      name: "Mine",
      descriptor: DEFAULT_VIEW.descriptor,
    });
    // The documented cost of the fallback: local views and settings-backed views are
    // different stores, and nothing migrates between them.
    renderWith();
    await waitFor(() => expect(screen.getByText("views:0")).toBeTruthy());
  });
});
