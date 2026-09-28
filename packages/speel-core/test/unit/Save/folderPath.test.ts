import { describe, it, expect } from "vitest";
import { normalizeFolderPath } from "../../../src/Save/folderPath.js";
import { InvalidOperationException } from "../../../src/errors.js";

describe("normalizeFolderPath", () => {
  it("passes a clean nested path through", () => {
    expect(normalizeFolderPath("folder1/nested")).toBe("folder1/nested");
  });
  it("trims leading/trailing slashes and collapses doubles", () => {
    expect(normalizeFolderPath("/a//b/")).toBe("a/b");
  });
  it("converts backslashes and trims segment whitespace", () => {
    expect(normalizeFolderPath("a\\ b \\c")).toBe("a/b/c");
  });
  it('drops "." segments', () => {
    expect(normalizeFolderPath("a/./b")).toBe("a/b");
  });
  it("returns empty string for empty/whitespace/only-slashes", () => {
    expect(normalizeFolderPath("")).toBe("");
    expect(normalizeFolderPath("   ")).toBe("");
    expect(normalizeFolderPath("///")).toBe("");
  });
  it('rejects ".." path traversal', () => {
    expect(() => normalizeFolderPath("a/../b")).toThrow(
      InvalidOperationException,
    );
  });
});
