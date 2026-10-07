import { describe, it, expect } from "vitest";
import {
  FILTER_BUTTON_ROOM,
  SORT_ARROW_ROOM,
  SORT_LABEL_PADDING,
  headerFloor,
  textMeasurer,
} from "../src/fluent-v8/headerFloor.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

/** 10px a character: easy arithmetic. */
const measure = (text: string): number => text.length * 10;
const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "k",
  header: "Separation Date",
  render: () => "",
  ...extra,
});
const filter = { headerFilter: { active: false, content: null } };

describe("headerFloor", () => {
  it("is the longest word plus the label padding", () => {
    expect(headerFloor(column({}), false, measure)).toBe(
      100 + SORT_LABEL_PADDING,
    );
  });

  it("adds room for the sort arrow and the filter button", () => {
    expect(headerFloor(column(filter), true, measure)).toBe(
      100 + SORT_LABEL_PADDING + SORT_ARROW_ROOM + FILTER_BUTTON_ROOM,
    );
  });

  it("is only the filter room for a header with no words, and 0 without one", () => {
    expect(headerFloor(column({ header: "" }), false, measure)).toBe(0);
    expect(headerFloor(column({ header: " ", ...filter }), true, measure)).toBe(
      FILTER_BUTTON_ROOM,
    );
  });

  it("is 0 for a column whose header is content, not text", () => {
    expect(
      headerFloor(column({ headerContent: "x", ...filter }), true, measure),
    ).toBe(0);
  });

  it("rounds up to whole pixels", () => {
    expect(headerFloor(column({ header: "ab" }), false, () => 10.2)).toBe(
      Math.ceil(10.2 + SORT_LABEL_PADDING),
    );
  });
});

describe("textMeasurer", () => {
  it("estimates per character where there is no canvas (jsdom)", () => {
    const m = textMeasurer("600 14px Arial", 14);
    expect(m("Supervisor")).toBeCloseTo(10 * 0.6 * 14);
  });
});
