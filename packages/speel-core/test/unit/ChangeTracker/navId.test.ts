import { describe, it, expect } from "vitest";
import { navIdOf, navIdsEqual } from "../../../src/ChangeTracker/navId.js";

describe("navId", () => {
  it("navIdOf reads .Id from an object, ids from an array (sorted), null otherwise", () => {
    expect(navIdOf({ Id: 5 })).toBe(5);
    expect(navIdOf([{ Id: 3 }, { Id: 1 }])).toEqual([1, 3]);
    expect(navIdOf(null)).toBeNull();
    expect(navIdOf(undefined)).toBeNull();
  });
  it("navIdsEqual compares scalars and arrays", () => {
    expect(navIdsEqual(5, 5)).toBe(true);
    expect(navIdsEqual(5, 6)).toBe(false);
    expect(navIdsEqual([1, 2], [1, 2])).toBe(true);
    expect(navIdsEqual([1, 2], [2, 1])).toBe(false); // caller passes sorted
    expect(navIdsEqual(null, null)).toBe(true);
  });
});
