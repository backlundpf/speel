import { describe, it, expect } from "vitest";
import {
  encodeCriteria,
  decodeCriteria,
  encodeSort,
  decodeSort,
  encodeQuestion,
  decodeQuestion,
  tableUrlKeys,
} from "../src/table/views/tableUrlCodecs.js";
import type { FilterCriteria } from "../src/table/filter/match.js";

const roundTrip = (c: FilterCriteria): FilterCriteria | undefined =>
  decodeCriteria(encodeCriteria(c) ?? null);

describe("criteria round-trips", () => {
  it("text", () => {
    expect(roundTrip({ kind: "text", query: 'a,b "c"' })).toEqual({
      kind: "text",
      query: 'a,b "c"',
    });
  });

  it("select, including values with commas", () => {
    expect(
      roundTrip({ kind: "select", selected: ["Open", "On, hold"] }),
    ).toEqual({ kind: "select", selected: ["Open", "On, hold"] });
  });

  it("numberRange with one bound", () => {
    expect(roundTrip({ kind: "numberRange", min: 5 })).toEqual({
      kind: "numberRange",
      min: 5,
    });
  });

  it("boolean", () => {
    expect(roundTrip({ kind: "boolean", value: false })).toEqual({
      kind: "boolean",
      value: false,
    });
  });

  it("keeps a date PRESET as the preset, not the dates it resolved to", () => {
    const c: FilterCriteria = {
      kind: "dateRange",
      preset: "thisFiscalQuarter",
      from: new Date(2026, 6, 1),
      to: new Date(2026, 8, 30),
    };
    expect(roundTrip(c)).toEqual({
      kind: "dateRange",
      preset: "thisFiscalQuarter",
    });
  });

  it("keeps explicit dates as ISO and revives them as Dates", () => {
    const decoded = roundTrip({
      kind: "dateRange",
      from: new Date(2026, 7, 4),
    });
    expect(decoded).toMatchObject({ kind: "dateRange" });
    expect((decoded as { from?: Date }).from).toBeInstanceOf(Date);
    expect((decoded as { from: Date }).from.getFullYear()).toBe(2026);
  });

  it("decodes junk to undefined rather than throwing", () => {
    expect(decodeCriteria("not-a-criteria")).toBeUndefined();
    expect(decodeCriteria(null)).toBeUndefined();
  });

  it("writes nothing for criteria that constrain nothing", () => {
    expect(encodeCriteria({ kind: "text", query: "   " })).toBeUndefined();
    expect(encodeCriteria({ kind: "select", selected: [] })).toBeUndefined();
    expect(encodeCriteria({ kind: "numberRange" })).toBeUndefined();
    expect(encodeCriteria({ kind: "dateRange" })).toBeUndefined();
  });
});

describe("sort", () => {
  it("round-trips key and direction", () => {
    expect(decodeSort(encodeSort({ key: "Title", direction: "desc" }))).toEqual(
      { key: "Title", direction: "desc" },
    );
  });

  it("decodes junk and absence to undefined", () => {
    expect(decodeSort(null)).toBeUndefined();
    expect(decodeSort("Title:sideways")).toBeUndefined();
  });
});

describe("the question blob", () => {
  it("round-trips filters, sort, page and dismissed scope", () => {
    const encoded = encodeQuestion({
      filters: {
        Status: { kind: "select", selected: ["Open", "On, hold"] },
        Title: { kind: "text", query: "alpha" },
      },
      sort: { key: "Title", direction: "desc" },
      page: 2,
      clearedScope: ["FiscalYear"],
    });
    expect(decodeQuestion(encoded)).toEqual({
      filters: {
        Status: { kind: "select", selected: ["Open", "On, hold"] },
        Title: { kind: "text", query: "alpha" },
      },
      sort: { key: "Title", direction: "desc" },
      page: 2,
      clearedScope: ["FiscalYear"],
    });
  });

  it("carries criteria as the per-criteria strings, not raw JSON objects", () => {
    const encoded = encodeQuestion({
      filters: { Status: { kind: "select", selected: ["Open"] } },
      sort: { key: "Title", direction: "asc" },
    });
    expect(JSON.parse(encoded)).toEqual({
      f: { Status: "s:Open" },
      s: "Title:asc",
    });
  });

  it("writes f even when empty — {} is how 'cleared' is said", () => {
    expect(JSON.parse(encodeQuestion({}))).toEqual({ f: {} });
    expect(decodeQuestion(encodeQuestion({}))).toEqual({
      filters: {},
      clearedScope: [],
    });
  });

  it("omits page 0 and criteria that constrain nothing", () => {
    const blob = JSON.parse(
      encodeQuestion({
        filters: { Title: { kind: "text", query: "  " } },
        page: 0,
      }),
    ) as Record<string, unknown>;
    expect(blob).toEqual({ f: {} });
  });

  it("reads a hand-written blob that leaves parts out", () => {
    expect(decodeQuestion('{"f":{"Status":"s:Closed"}}')).toEqual({
      filters: { Status: { kind: "select", selected: ["Closed"] } },
      clearedScope: [],
    });
  });

  it("returns undefined for a blob it cannot read", () => {
    expect(decodeQuestion("not json")).toBeUndefined();
    expect(decodeQuestion("[1,2]")).toBeUndefined();
    expect(decodeQuestion('"a string"')).toBeUndefined();
    expect(decodeQuestion('{"f":"not a map"}')).toBeUndefined();
    expect(decodeQuestion(null)).toBeUndefined();
    expect(decodeQuestion("")).toBeUndefined();
  });

  it("drops junk parts rather than failing the whole question", () => {
    expect(
      decodeQuestion(
        '{"f":{"Status":"s:Open","Nope":"garbage"},"s":"Title:sideways","pg":"x","cs":"nope","q":7}',
      ),
    ).toEqual({
      filters: { Status: { kind: "select", selected: ["Open"] } },
      clearedScope: [],
    });
  });

  it("carries the search as q, trimmed, and only when it says something", () => {
    expect(JSON.parse(encodeQuestion({ search: " smith 2026 " }))).toEqual({
      f: {},
      q: "smith 2026",
    });
    expect(JSON.parse(encodeQuestion({ search: "   " }))).toEqual({ f: {} });
    expect(decodeQuestion(encodeQuestion({ search: "smith" }))).toEqual({
      filters: {},
      clearedScope: [],
      search: "smith",
    });
  });
});

describe("tableUrlKeys", () => {
  it("lowercases the prefix: the question is the bare prefix, the view its own key", () => {
    const keys = tableUrlKeys("T1");
    expect(keys.question).toBe("t1");
    expect(keys.view).toBe("t1.v");
  });

  it("lists every key it owns, so a table can clear its own params wholesale", () => {
    expect(tableUrlKeys("t1").all()).toEqual(["t1", "t1.v"]);
  });
});
