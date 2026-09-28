import { describe, it, expect } from "vitest";
import { DbContext, initSpeelDbContext, type ModelBuilder } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { UserSetting, USER_SETTINGS_LIST } from "../src/UserSetting.js";

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

function modelOf(Ctx: new (o: never) => DbContext) {
  return initSpeelDbContext(Ctx as never, (b) =>
    b.useProvider(new FakeStorageProvider()),
  ).model;
}

describe("UserSetting", () => {
  it("maps to the settings list with item-level security", () => {
    const et = modelOf(AppContext).findEntityType(UserSetting);
    const source = et?.source as {
      kind: "list";
      list: { value: string };
      provisioning?: { readSecurity?: string; writeSecurity?: string };
    };
    expect(source.list.value).toBe(USER_SETTINGS_LIST);
    // 'own' is what makes the server, not a query, responsible for per-user scoping.
    expect(source.provisioning?.readSecurity).toBe("own");
    expect(source.provisioning?.writeSecurity).toBe("own");
  });

  it("keys off the built-in Title column rather than a parallel one", () => {
    const et = modelOf(AppContext).findEntityType(UserSetting);
    expect(et?.properties.map((p) => p.columnName)).toContain("Title");
  });
});

describe("IdentityDbContext", () => {
  it("registers UserSetting by declaration, so any construction path sees it", () => {
    // Declared, not builder-registered: the migrations CLI news a context up directly with a
    // stub provider, and would diff the list as deleted if this arrived any other way.
    expect(modelOf(AppContext).findEntityType(UserSetting)).toBeDefined();
  });

  it("is absent from a context that extends plain DbContext", () => {
    expect(modelOf(PlainContext).findEntityType(UserSetting)).toBeUndefined();
  });
});
