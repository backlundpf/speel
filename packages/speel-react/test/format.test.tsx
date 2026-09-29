import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { FieldConfig } from "@speel/core";
import { formatFieldValue } from "../src/fields/format.js";

function text(node: React.ReactNode): string {
  const { container } = render(<>{node}</>);
  return container.textContent ?? "";
}
const cfg = (c: FieldConfig) => c;

describe("formatFieldValue", () => {
  it("Text → string", () => {
    expect(
      text(
        formatFieldValue(
          cfg({ kind: "Text", multiline: false, maxLength: 255 }),
          "hi",
        ),
      ),
    ).toBe("hi");
  });
  it("Boolean → Yes/No", () => {
    expect(text(formatFieldValue(cfg({ kind: "Boolean" }), true))).toBe("Yes");
    expect(text(formatFieldValue(cfg({ kind: "Boolean" }), false))).toBe("No");
  });
  it("Number → decimalPlaces / percentage", () => {
    expect(
      text(formatFieldValue(cfg({ kind: "Number", decimalPlaces: 2 }), 3.5)),
    ).toBe("3.50");
    expect(
      text(
        formatFieldValue(cfg({ kind: "Number", showAsPercentage: true }), 0.25),
      ),
    ).toBe("25%");
  });
  it("Currency → currency formatting", () => {
    expect(
      text(
        formatFieldValue(
          cfg({ kind: "Currency", decimalPlaces: 2, currencyCode: "USD" }),
          12,
        ),
      ),
    ).toMatch(/\$12\.00/);
  });
  it("DateTime DateOnly → date string", () => {
    const out = text(
      formatFieldValue(
        cfg({
          kind: "DateTime",
          displayFormat: "DateOnly",
          friendlyFormat: "Disabled",
        }),
        new Date("2026-06-03T12:00:00Z"),
      ),
    );
    expect(out).toMatch(/2026/);
  });
  it("Choice → optionsRender label", () => {
    const c = cfg({
      kind: "Choice",
      options: [{ id: "a", label: "Alpha" }],
      multi: false,
      fillIn: false,
      radioButtons: false,
      optionsRender: (o) => (o as { label: string }).label,
    });
    expect(text(formatFieldValue(c, { id: "a", label: "Alpha" }))).toBe(
      "Alpha",
    );
  });
  it("empty → em dash", () => {
    expect(
      text(
        formatFieldValue(
          cfg({ kind: "Text", multiline: false, maxLength: 255 }),
          null,
        ),
      ),
    ).toBe("—");
  });
  it("Lookup (single) → display field", () => {
    const c = cfg({
      kind: "Lookup",
      target: {} as never,
      displayField: "Title",
      multi: false,
    });
    expect(text(formatFieldValue(c, { Id: 1, Title: "Alpha" }))).toBe("Alpha");
  });
  it("Lookup (collection/inverse) → joined display fields", () => {
    const c = cfg({
      kind: "Lookup",
      target: {} as never,
      displayField: "Title",
      multi: false,
    });
    expect(
      text(
        formatFieldValue(c, [
          { Id: 1, Title: "Alpha" },
          { Id: 2, Title: "Beta" },
        ]),
      ),
    ).toBe("Alpha, Beta");
  });
});
