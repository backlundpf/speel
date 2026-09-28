import { describe, it, expect } from "vitest";
import { nextMigrationId, renderIndex } from "../src/id.js";

describe("nextMigrationId", () => {
  it("formats YYYYMMDDTHHmm_<Name> from a Date", () => {
    const id = nextMigrationId(
      "AddProjects",
      new Date(Date.UTC(2026, 5, 5, 12, 34)),
    );
    expect(id).toBe("20260605T1234_AddProjects");
  });
  it("sanitizes the name to alphanumerics", () => {
    expect(
      nextMigrationId(
        "Add projects!! v2",
        new Date(Date.UTC(2026, 0, 1, 0, 0)),
      ),
    ).toBe("20260101T0000_Addprojectsv2");
  });
  it("throws on an empty name", () => {
    expect(() => nextMigrationId("  ", new Date())).toThrow(/name/i);
  });
});

describe("renderIndex", () => {
  it("renders an ordered imports + migrations array", () => {
    const src = renderIndex(["20260101T0000_A", "20260102T0000_B"]);
    expect(src).toContain("import m0 from './20260101T0000_A.js';");
    expect(src).toContain("import m1 from './20260102T0000_B.js';");
    expect(src).toContain("export const migrations = [m0, m1];");
  });
  it("renders an empty array for no migrations", () => {
    expect(renderIndex([])).toContain("export const migrations = [];");
  });
});
