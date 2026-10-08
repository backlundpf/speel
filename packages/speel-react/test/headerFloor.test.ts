import { describe, it, expect } from "vitest";
import { headerFloor, textMeasurer } from "../src/table/layout/headerFloor.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

/** 10px a character: easy arithmetic. */
const measure = (text: string): number => text.length * 10;
const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "k",
  header: "Separation Date",
  render: () => "",
  ...extra,
});
const room = { label: 8, sortArrow: 16, filterButton: 28 };
const filter = { headerFilter: { active: false, content: null } };

describe("headerFloor", () => {
  it("is the longest word plus the label padding", () => {
    expect(headerFloor(column({}), false, measure, room)).toBe(
      100 + room.label,
    );
  });

  it("adds room for the sort arrow and the filter button", () => {
    expect(headerFloor(column(filter), true, measure, room)).toBe(
      100 + room.label + room.sortArrow + room.filterButton,
    );
  });

  it("is only the filter room for a header with no words, and 0 without one", () => {
    expect(headerFloor(column({ header: "" }), false, measure, room)).toBe(0);
    expect(
      headerFloor(column({ header: " ", ...filter }), true, measure, room),
    ).toBe(room.filterButton);
  });

  it("is 0 for a column whose header is content, not text", () => {
    expect(
      headerFloor(
        column({ headerContent: "x", ...filter }),
        true,
        measure,
        room,
      ),
    ).toBe(0);
  });

  it("rounds up to whole pixels", () => {
    expect(headerFloor(column({ header: "ab" }), false, () => 10.2, room)).toBe(
      Math.ceil(10.2 + room.label),
    );
  });
});

it("uses the skin's own room", () => {
  const shad = { label: 12, sortArrow: 18, filterButton: 36 };
  expect(headerFloor(column(filter), true, measure, shad)).toBe(
    100 + 12 + 18 + 36,
  );
});

describe("textMeasurer", () => {
  it("estimates per character where there is no canvas (jsdom)", () => {
    const m = textMeasurer("600 14px Arial", 14);
    expect(m("Supervisor")).toBeCloseTo(10 * 0.6 * 14);
  });
});
