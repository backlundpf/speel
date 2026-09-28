import { describe, it, expect } from "vitest";
import { initSpeelDbContext, SiteUser } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { UserSetting } from "../src/UserSetting.js";

class Ctx extends IdentityDbContext {}

// UserSetting is compiled by identity's tsc and extends a SpeelEntity compiled by
// core's tsc: the system members must survive both emits and the dist boundary.
describe("SpeelEntity's decorated members across the package boundary", () => {
  it("UserSetting has Created, Modified, Author → SiteUser and the file columns", () => {
    const ctx = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    const et = ctx.model.findEntityType(UserSetting)!;
    expect(et.findProperty("Created")!.readOnly).toBe(true);
    expect(et.findNavigation("Author")!.target).toBe(
      ctx.model.findEntityType(SiteUser),
    );
    expect(et.findProperty("FileLeafRef")!.visible).toBe(false);
    expect(et.findProperty("Title")).toBeDefined(); // its own decorated column
  });
});
