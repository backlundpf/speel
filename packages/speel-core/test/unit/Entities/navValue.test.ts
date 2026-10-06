import { describe, it, expect } from "vitest";
import { isUnloadedNavValue } from "../../../src/Entities/navValue.js";
import type { INavigation } from "../../../src/Metadata/Navigation.js";

const nav = (storage: INavigation["storage"]) =>
  ({
    name: "Program",
    storage,
    foreignKey: { propertyName: "ProgramId" },
  }) as unknown as INavigation;

describe("isUnloadedNavValue", () => {
  it("undefined is unloaded", () => {
    expect(isUnloadedNavValue(nav("self-fk-scalar"), {})).toBe(true);
  });

  it("null with a set FK is unloaded; null with an empty FK is an explicit empty", () => {
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), {
        Program: null,
        ProgramId: 9,
      }),
    ).toBe(true);
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), {
        Program: null,
        ProgramId: null,
      }),
    ).toBe(false);
    expect(
      isUnloadedNavValue(nav("self-fk-array"), {
        Program: null,
        ProgramId: [1],
      }),
    ).toBe(true);
    expect(
      isUnloadedNavValue(nav("self-fk-array"), {
        Program: null,
        ProgramId: [],
      }),
    ).toBe(false);
  });

  it("null on an inverse-fk navigation is unloaded; [] is an explicit empty", () => {
    expect(isUnloadedNavValue(nav("inverse-fk"), { Program: null })).toBe(true);
    expect(isUnloadedNavValue(nav("inverse-fk"), { Program: [] })).toBe(false);
  });

  it("a value is loaded", () => {
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), { Program: { Id: 1 } }),
    ).toBe(false);
  });
});
