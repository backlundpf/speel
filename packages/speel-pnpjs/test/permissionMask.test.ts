import { describe, it, expect } from "vitest";
import { maskFor, withKinds } from "../src/identity/permissionMask.js";

// PnP's PermissionKind values are 1-based bit positions. These four pin the arithmetic
// at the places it can go wrong: bit 0, the top of Low, the sign bit, and the High half.
describe("maskFor", () => {
  it("puts a low permission in Low", () => {
    expect(maskFor(["viewListItems"])).toEqual({ High: 0, Low: 1 }); // position 1
  });

  it("puts position 31 at the top of Low", () => {
    expect(maskFor(["manageWeb"])).toEqual({ High: 0, Low: 0x40000000 });
  });

  it("keeps position 32 unsigned rather than negative", () => {
    expect(maskFor(["anonymousSearchAccessWebLists"])).toEqual({
      High: 0,
      Low: 2147483648,
    });
  });

  it("puts a high permission in High", () => {
    expect(maskFor(["useClientIntegration"])).toEqual({ High: 16, Low: 0 }); // position 37
    expect(maskFor(["enumeratePermissions"])).toEqual({
      High: 0x40000000,
      Low: 0,
    }); // position 63
  });

  it("ors several kinds together", () => {
    expect(maskFor(["viewListItems", "addListItems"])).toEqual({
      High: 0,
      Low: 3,
    });
  });

  it("is empty for no kinds", () => {
    expect(maskFor([])).toEqual({ High: 0, Low: 0 });
  });

  it("throws for a name not in the map", () => {
    // `as never` is how a JS caller (or a config-driven cast) reaches past PermissionKind.
    expect(() => maskFor(["managepermissions" as never])).toThrow(
      /Unknown permission kind/,
    );
  });
});

describe("withKinds", () => {
  const contribute = maskFor(["viewListItems", "addListItems"]);

  it("adds to an existing mask without disturbing it", () => {
    expect(withKinds(contribute, { add: ["managePermissions"] })).toEqual(
      maskFor(["viewListItems", "addListItems", "managePermissions"]),
    );
  });

  it("removes from an existing mask", () => {
    expect(withKinds(contribute, { remove: ["addListItems"] })).toEqual(
      maskFor(["viewListItems"]),
    );
  });

  it("removes a kind that is not there without changing anything", () => {
    expect(withKinds(contribute, { remove: ["manageWeb"] })).toEqual(
      contribute,
    );
  });

  it("lets remove win over add, whatever the order", () => {
    expect(
      withKinds(contribute, { add: ["manageWeb"], remove: ["manageWeb"] }),
    ).toEqual(contribute);
  });

  it("returns the mask unchanged for an empty delta", () => {
    expect(withKinds(contribute, {})).toEqual(contribute);
  });
});
