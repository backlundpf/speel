// test/unit/errors.test.ts
import { describe, it, expect } from "vitest";
import {
  DbUpdateException,
  DbUpdateConcurrencyException,
  ModelConfigurationException,
  DataException,
  InvalidOperationException,
  QueryTranslationException,
  NavigationConfigurationException,
} from "../../src/errors.js";

describe("errors", () => {
  it("DbUpdateException carries entries and inner errors", () => {
    const entries = [{ tag: "a" }, { tag: "b" }] as unknown[];
    const inners = [new Error("x"), new Error("y")];
    const e = new DbUpdateException("bad save", entries as never, inners);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DbUpdateException");
    expect(e.entries).toEqual(entries);
    expect(e.innerErrors).toEqual(inners);
  });

  it("DbUpdateConcurrencyException extends DbUpdateException", () => {
    const e = new DbUpdateConcurrencyException("conflict", [], []);
    expect(e).toBeInstanceOf(DbUpdateException);
    expect(e.name).toBe("DbUpdateConcurrencyException");
  });

  it("ModelConfigurationException, DataException, InvalidOperationException are Errors with their names", () => {
    expect(new ModelConfigurationException("m").name).toBe(
      "ModelConfigurationException",
    );
    expect(new DataException("d").name).toBe("DataException");
    expect(new InvalidOperationException("i").name).toBe(
      "InvalidOperationException",
    );
  });

  it("QueryTranslationException carries the offending node", () => {
    const node = {
      kind: "compare" as const,
      column: "X",
      op: "eq" as const,
      value: "v",
    };
    const e = new QueryTranslationException("untranslatable", node);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("QueryTranslationException");
    expect(e.node).toBe(node);
  });
});

describe("NavigationConfigurationException", () => {
  it("subclasses ModelConfigurationException", () => {
    const e = new NavigationConfigurationException("bad nav");
    expect(e).toBeInstanceOf(ModelConfigurationException);
    expect(e.name).toBe("NavigationConfigurationException");
    expect(e.message).toBe("bad nav");
  });
});
