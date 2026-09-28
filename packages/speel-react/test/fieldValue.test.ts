import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import {
  isEmptyValue,
  displayString,
  choiceIndex,
} from "../src/table/fieldValue.js";

describe("isEmptyValue", () => {
  it('treats null/undefined/""/[] as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue("")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue("x")).toBe(false);
  });
});

describe("displayString", () => {
  it("Lookup uses displayField then Title", () => {
    const cfg = {
      kind: "Lookup",
      displayField: "Name",
      multi: false,
    } as unknown as FieldConfig;
    expect(displayString(cfg, { Name: "Acme" })).toBe("Acme");
    expect(displayString(cfg, { Title: "Beta" })).toBe("Beta");
  });
  it("a multi-value Lookup (a person column) joins the Titles", () => {
    const cfg = {
      kind: "Lookup",
      displayField: "Title",
      multi: true,
    } as unknown as FieldConfig;
    expect(displayString(cfg, [{ Title: "Ann" }, { Title: "Bob" }])).toBe(
      "Ann, Bob",
    );
  });
  it("Choice uses optionsRender", () => {
    const cfg = {
      kind: "Choice",
      options: [1, 2],
      fillIn: false,
      radioButtons: false,
      optionsRender: (o: unknown) => `#${o}`,
    } as unknown as FieldConfig;
    expect(displayString(cfg, 2)).toBe("#2");
  });
  it("empty value → empty string", () => {
    expect(displayString(undefined, null)).toBe("");
  });
});

describe("choiceIndex", () => {
  it("returns declared position via optionsValue identity", () => {
    const cfg = {
      kind: "Choice",
      options: [{ id: "a" }, { id: "b" }],
      fillIn: false,
      radioButtons: false,
      optionsValue: (o: unknown) => (o as { id: string }).id,
    } as unknown as Extract<FieldConfig, { kind: "Choice" }>;
    expect(choiceIndex(cfg, { id: "b" })).toBe(1);
  });
  it("returns -1 when the option list is not literal", () => {
    const cfg = {
      kind: "Choice",
      fillIn: false,
      radioButtons: false,
      options: () => ["a"],
    } as unknown as Extract<FieldConfig, { kind: "Choice" }>;
    expect(choiceIndex(cfg, "a")).toBe(-1);
  });
});
