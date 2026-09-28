import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import { defaultFilterFor } from "../src/table/filter/defaults.js";

const cfg = (kind: string, extra: Record<string, unknown> = {}) =>
  ({ kind, ...extra }) as unknown as FieldConfig;

describe("defaultFilterFor", () => {
  it("maps each kind to its default filter", () => {
    expect(defaultFilterFor(cfg("Text", { multiline: false }))).toEqual({
      kind: "text",
    });
    expect(defaultFilterFor(cfg("Number"))).toEqual({ kind: "numberRange" });
    expect(defaultFilterFor(cfg("Currency", { decimalPlaces: 2 }))).toEqual({
      kind: "numberRange",
    });
    expect(
      defaultFilterFor(
        cfg("DateTime", {
          displayFormat: "DateOnly",
          friendlyFormat: "Disabled",
        }),
      ),
    ).toEqual({ kind: "dateRange" });
    expect(defaultFilterFor(cfg("Boolean"))).toEqual({ kind: "boolean" });
    expect(
      defaultFilterFor(
        cfg("Choice", {
          options: ["A", "B"],
          fillIn: false,
          radioButtons: false,
        }),
      ),
    ).toEqual({ kind: "select", multi: true });
    expect(
      defaultFilterFor(
        cfg("Choice", {
          multi: true,
          options: ["A", "B"],
          fillIn: false,
          radioButtons: false,
        }),
      ),
    ).toEqual({ kind: "select", multi: true });
    expect(
      defaultFilterFor(cfg("Lookup", { displayField: "Title", multi: false })),
    ).toEqual({ kind: "text" });
  });

  it("a literal Choice defaults to a select filter", () => {
    expect(
      defaultFilterFor(
        cfg("Choice", {
          options: ["A", "B"],
          fillIn: false,
          radioButtons: false,
        }),
      ),
    ).toEqual({ kind: "select", multi: true });
  });

  it("a Choice whose list is not literal defaults to a text filter", () => {
    expect(
      defaultFilterFor(
        cfg("Choice", {
          fillIn: false,
          radioButtons: false,
          options: () => ["A"],
        }),
      ),
    ).toEqual({ kind: "text" });
  });
});
