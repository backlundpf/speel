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
