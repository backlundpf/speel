import { describe, it, expectTypeOf } from "vitest";
import type {
  INavigation,
  NavigationStorage,
  NavigationKind,
} from "../../../src/Metadata/Navigation.js";
import type { EntityType } from "../../../src/Metadata/EntityType.js";
import type { Property } from "../../../src/Metadata/Property.js";

describe("Navigation types", () => {
  it("NavigationStorage union has three variants", () => {
    expectTypeOf<NavigationStorage>().toEqualTypeOf<
      "self-fk-scalar" | "self-fk-array" | "inverse-fk"
    >();
  });
  it("NavigationKind union has two variants", () => {
    expectTypeOf<NavigationKind>().toEqualTypeOf<"reference" | "collection">();
  });
  it("INavigation has required fields", () => {
    type N = INavigation;
    expectTypeOf<N["name"]>().toEqualTypeOf<string>();
    expectTypeOf<N["kind"]>().toEqualTypeOf<NavigationKind>();
    expectTypeOf<N["storage"]>().toEqualTypeOf<NavigationStorage>();
    expectTypeOf<N["target"]>().toEqualTypeOf<EntityType>();
    expectTypeOf<N["foreignKey"]>().toEqualTypeOf<Property>();
  });
});
