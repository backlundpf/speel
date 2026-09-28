import { describe, it, expect } from "vitest";
import { itemIn, list, resourceKey, web, item } from "../src/resources.js";

describe("resource descriptors", () => {
  it("distinguishes the three scopes", () => {
    expect(resourceKey(web() as never)).toBe("web");
    expect(resourceKey(list("Contracts") as never)).toBe("list:Contracts");
    expect(resourceKey(itemIn("Contracts", 4) as never)).toBe(
      "item:Contracts:4",
    );
  });

  it("distinguishes two items in the same list", () => {
    // Grouping a save by resource depends on this: two items sharing a bucket would apply
    // one item's inheritance break before the other's grants.
    expect(resourceKey(itemIn("Contracts", 4) as never)).not.toBe(
      resourceKey(itemIn("Contracts", 5) as never),
    );
  });

  it("distinguishes a list from an item in it", () => {
    expect(resourceKey(list("Contracts") as never)).not.toBe(
      resourceKey(itemIn("Contracts", 4) as never),
    );
  });

  it("records the entity without touching it", () => {
    const entity = { Id: 4 };
    expect(item(entity)).toEqual({ kind: "entity", entity });
  });
});
