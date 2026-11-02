import { describe, it, expect } from "vitest";
import {
  DbContext,
  initSpeelDbContext,
  InvalidOperationException,
  type ModelBuilder,
} from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import { USER_SETTINGS_LIST } from "../src/UserSetting.js";
import {
  createEntityUserSettingsStore,
  createLocalUserSettingsStore,
} from "../src/userSettingsStore.js";

class AppContext extends IdentityDbContext {}
class Thing {
  Id?: number;
  Title?: string;
}
/** Extends DbContext, not IdentityDbContext — with one list so the model is not empty. */
class PlainContext extends DbContext {
  things = this.set(Thing);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Thing, (e) => {
      e.toList("Things");
      e.property((t) => t.Title).isText();
    });
  }
}

function build(Ctx: new (o: never) => DbContext) {
  const sp = new FakeStorageProvider();
  const db = initSpeelDbContext(Ctx as never, (b) => b.useProvider(sp));
  return {
    // PlainContext deliberately is not an IdentityDbContext: the runtime guard is under test.
    identity: initSpeelIdentity(db as IdentityDbContext, (b) =>
      b.useProvider(new FakeIdentityProvider()),
    ),
    sp,
  };
}

describe("identity.settings", () => {
  it("round-trips a value", async () => {
    const { identity } = build(AppContext);
    await identity.settings.set("theme.dark", true);
    expect(await identity.settings.getAll()).toEqual({ "theme.dark": true });
  });

  it("stores structured values, not just scalars", async () => {
    const { identity } = build(AppContext);
    const view = {
      name: "Needs action",
      descriptor: { sort: [{ key: "Due", desc: false }] },
    };
    await identity.settings.set("table.view.ao.v1", view);
    expect((await identity.settings.getAll())["table.view.ao.v1"]).toEqual(
      view,
    );
  });

  it("overwrites the existing row for a key rather than adding a second", async () => {
    const { identity } = build(AppContext);
    await identity.settings.set("theme.dark", true);
    await identity.settings.set("theme.dark", false);
    expect(await identity.settings.getAll()).toEqual({ "theme.dark": false });
  });

  it("removes a setting", async () => {
    const { identity } = build(AppContext);
    await identity.settings.set("theme.dark", true);
    await identity.settings.remove("theme.dark");
    expect(await identity.settings.getAll()).toEqual({});
  });

  it("survives a row whose JSON is corrupt, and still returns the rest", async () => {
    const { identity, sp } = build(AppContext);
    await identity.settings.set("good", 1);
    // A hand-edited row in the SharePoint UI is the realistic way this happens.
    sp.seedRow(
      { kind: "title", value: USER_SETTINGS_LIST },
      { Title: "bad", Value: "{not json" },
    );
    expect(await identity.settings.getAll()).toEqual({ good: 1 });
  });

  it("names the fix when the context did not extend IdentityDbContext", async () => {
    const { identity } = build(PlainContext);
    // Without this guard the failure is a bare "not mapped" from deep inside a query.
    await expect(identity.settings.getAll()).rejects.toThrow(
      InvalidOperationException,
    );
    await expect(identity.settings.getAll()).rejects.toThrow(
      /IdentityDbContext/,
    );
    await expect(identity.settings.set("x", 1)).rejects.toThrow(
      /IdentityDbContext/,
    );
  });
});

describe("identity.settings.canWrite", () => {
  const SETTINGS = { kind: "list", list: USER_SETTINGS_LIST } as const;
  function withPermissions() {
    const sp = new FakeStorageProvider();
    const ids = new FakeIdentityProvider();
    const db = initSpeelDbContext(AppContext, (b) => b.useProvider(sp));
    const identity = initSpeelIdentity(db, (b) => b.useProvider(ids));
    return { identity, ids };
  }
  const settingsReads = (ids: FakeIdentityProvider): string[] =>
    ids.reads.filter((r) => r.includes(USER_SETTINGS_LIST));

  it("canWrite is true with addListItems on the settings list", async () => {
    const { identity, ids } = withPermissions();
    ids.seedPermissions(SETTINGS, ["viewListItems", "addListItems"]);
    expect(await identity.settings.canWrite!()).toBe(true);
  });

  it("canWrite is false without it", async () => {
    const { identity, ids } = withPermissions();
    ids.seedPermissions(SETTINGS, ["viewListItems"]);
    expect(await identity.settings.canWrite!()).toBe(false);
  });

  it("reads access once across calls", async () => {
    const { identity, ids } = withPermissions();
    ids.seedPermissions(SETTINGS, ["addListItems"]);
    await Promise.all([
      identity.settings.canWrite!(),
      identity.settings.canWrite!(),
    ]);
    await identity.settings.canWrite!();
    expect(settingsReads(ids)).toHaveLength(1);
  });

  it("checks once even after a save drops identity's permission cache", async () => {
    const { identity, ids } = withPermissions();
    ids.seedPermissions(SETTINGS, ["addListItems"]);
    await identity.settings.canWrite!();
    await identity.settings.set("k", 1);
    await identity.settings.canWrite!();
    expect(settingsReads(ids)).toHaveLength(1);
  });

  it("retries after a failed read", async () => {
    const { identity, ids } = withPermissions();
    let calls = 0;
    const real = ids.getEffectivePermissionsAsync.bind(ids);
    ids.seedPermissions(SETTINGS, ["addListItems"]);
    ids.getEffectivePermissionsAsync = (...args) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("boom")) : real(...args);
    };
    await expect(identity.settings.canWrite!()).rejects.toThrow("boom");
    expect(await identity.settings.canWrite!()).toBe(true);
  });

  it("a store passed with useSettings is used as-is", () => {
    const sp = new FakeStorageProvider();
    const db = initSpeelDbContext(AppContext, (b) => b.useProvider(sp));
    const identity = initSpeelIdentity(db, (b) =>
      b
        .useProvider(new FakeIdentityProvider())
        .useSettings(createLocalUserSettingsStore()),
    );
    expect(identity.settings.canWrite).toBeUndefined();
  });

  it("createEntityUserSettingsStore without canWrite answers nothing", () => {
    const sp = new FakeStorageProvider();
    const db = initSpeelDbContext(AppContext, (b) => b.useProvider(sp));
    expect(createEntityUserSettingsStore(db).canWrite).toBeUndefined();
  });
});
