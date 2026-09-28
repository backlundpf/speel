import { it, expect } from "vitest";
import { captureSelectorName } from "../../../src/Metadata/selectorName.js";
import { InvalidOperationException } from "../../../src/errors.js";

it("captures the accessed property name", () => {
  expect(captureSelectorName((e: { Program?: unknown }) => e.Program)).toBe(
    "Program",
  );
});

it("throws when the selector accesses nothing", () => {
  expect(() => captureSelectorName(() => undefined)).toThrow(
    InvalidOperationException,
  );
});
