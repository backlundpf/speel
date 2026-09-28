// test/readValues.test.ts
//
// SharePoint's REST JSON → the contract's typed values. These are facts about the
// wire (ISO strings, 0/1 booleans, `{results:[…]}` envelopes, Int64-as-string), so
// they live here rather than in core's Materialize.
import { describe, it, expect } from "vitest";
import { DataException, type Property } from "@speel/core";
import {
  textProperty,
  numberProperty,
  booleanProperty,
  dateTimeProperty,
  choiceProperty,
  lookupProperty,
  stubEntityType,
} from "@speel/core/testing";
import { coerceRecord, coerceRecords, coerceValue } from "../src/readValues.js";

const tags = stubEntityType("Tags", {
  kind: "list",
  list: { kind: "title", value: "Tags" },
});
const P = [
  textProperty("Title"),
  numberProperty("Views"),
  booleanProperty("IsPublic"),
  dateTimeProperty("StartDate"),
  choiceProperty("Labels", { multi: true }),
  choiceProperty("Status"),
  lookupProperty("Program", tags),
  lookupProperty("Tags", tags, { multi: true }),
];

describe("coerceRecord", () => {
  it("types every described column and leaves the rest as-is", () => {
    const out = coerceRecord(
      {
        Title: "t",
        Views: "12",
        IsPublic: 1,
        StartDate: "2027-03-15T12:00:00Z",
        Labels: { results: ["A", "B"] },
        Status: "Planning",
        ProgramId: "2",
        TagsId: { results: [3, 7] },
        ContentTypeId: "0x01",
      },
      P,
    );
    expect(out.Title).toBe("t");
    expect(out.Views).toBe(12);
    expect(out.IsPublic).toBe(true);
    expect(out.StartDate).toBeInstanceOf(Date);
    expect((out.StartDate as Date).toISOString()).toBe(
      "2027-03-15T12:00:00.000Z",
    );
    expect(out.Labels).toEqual(["A", "B"]);
    expect(out.Status).toBe("Planning");
    expect(out.ProgramId).toBe(2);
    expect(out.TagsId).toEqual([3, 7]);
    expect(out.ContentTypeId).toBe("0x01");
  });
  it("passes null through and never invents a value for an absent column", () => {
    const out = coerceRecord({ StartDate: null }, P);
    expect(out.StartDate).toBeNull();
    expect("Views" in out).toBe(false);
  });
  it("passes a present-but-undefined value through (inboundRecord can emit Id: undefined)", () => {
    const out = coerceRecord({ Views: undefined, StartDate: undefined }, P);
    expect(out).toHaveProperty("Views", undefined);
    expect(out).toHaveProperty("StartDate", undefined);
  });
  it("returns the record as-is when no properties are given", () => {
    const rec = { IsPublic: 1, StartDate: "2027-03-15T12:00:00Z" };
    expect(coerceRecord(rec)).toEqual(rec);
  });
  it("throws DataException for an invalid date and a non-finite number", () => {
    expect(() => coerceRecord({ StartDate: "not a date" }, P)).toThrow(
      DataException,
    );
    expect(() => coerceRecord({ Views: "abc" }, P)).toThrow(DataException);
  });
  it("throws DataException for an unrecognised multi-value shape", () => {
    expect(() => coerceRecord({ TagsId: "3;#x" }, P)).toThrow(DataException);
  });
  it("types expanded sub-records with the clause's properties, unwrapping {results}", () => {
    const out = coerceRecord(
      {
        Id: 1,
        Owner: { Id: 6, Title: "Ada" },
        Tags: { results: [{ Id: 3, Title: "a" }] },
      },
      [],
      [
        {
          navColumn: "Owner",
          selectFields: ["Title"],
          properties: [numberProperty("Id"), textProperty("Title")],
        },
        {
          navColumn: "Tags",
          selectFields: ["Title"],
          properties: [numberProperty("Id"), textProperty("Title")],
        },
      ],
    );
    expect(out.Owner).toEqual({ Id: 6, Title: "Ada" });
    expect(out.Tags).toEqual([{ Id: 3, Title: "a" }]);
  });
  it("names a bad sub-record value by its nav path (Author/Created, not Created)", () => {
    expect(() =>
      coerceRecord(
        { Author: { Created: "bad" } },
        [],
        [
          {
            navColumn: "Author",
            selectFields: ["Created"],
            properties: [dateTimeProperty("Created")],
          },
        ],
      ),
    ).toThrow(/Column Author\/Created received invalid date/);
  });
});

describe("coerceRecord — the wire shapes core's Materialize used to absorb", () => {
  it("accepts a boolean as itself, 0/1, and rejects nothing else", () => {
    expect(coerceRecord({ IsPublic: true }, P).IsPublic).toBe(true);
    expect(coerceRecord({ IsPublic: 0 }, P).IsPublic).toBe(false);
    expect(coerceRecord({ IsPublic: 1 }, P).IsPublic).toBe(true);
  });
  it("accepts a multi-choice and multi-lookup that already arrived as arrays", () => {
    const out = coerceRecord({ Labels: ["A"], TagsId: [3, 4] }, P);
    expect(out.Labels).toEqual(["A"]);
    expect(out.TagsId).toEqual([3, 4]);
  });
  it("throws DataException on NaN/Infinity numbers and a non-numeric lookup id", () => {
    expect(() => coerceRecord({ Views: Number.NaN }, P)).toThrow(DataException);
    expect(() => coerceRecord({ Views: Number.POSITIVE_INFINITY }, P)).toThrow(
      DataException,
    );
    expect(() => coerceRecord({ ProgramId: "x" }, P)).toThrow(
      /non-numeric lookup id/,
    );
    expect(() => coerceRecord({ TagsId: "invalid" }, P)).toThrow(
      /unrecognized multi-value lookup shape/,
    );
  });
  it("keeps a Date that is already a Date (a second pass is harmless)", () => {
    const d = new Date("2027-03-15T12:00:00Z");
    const out = coerceRecord({ StartDate: d }, P);
    expect(out.StartDate).toBe(d);
  });
  it("hands back the very same object when nothing describes it — no copy", () => {
    const rec = { IsPublic: 1 };
    expect(coerceRecord(rec)).toBe(rec);
    expect(coerceRecord(rec, [])).toBe(rec);
    expect(
      coerceRecord(rec, [], [{ navColumn: "Owner", selectFields: [] }]),
    ).toBe(rec);
  });
  it("does not mutate the record it was given", () => {
    const rec = { IsPublic: 1, StartDate: "2027-03-15T12:00:00Z" };
    coerceRecord(rec, P);
    expect(rec).toEqual({ IsPublic: 1, StartDate: "2027-03-15T12:00:00Z" });
  });
});

describe("coerceValue — field kinds the factories do not cover", () => {
  it("refuses a field kind it does not know, naming the kind and the column", () => {
    expect(() => coerceValue({ kind: "Bogus" } as never, "x", "Col")).toThrow(
      DataException,
    );
    expect(() => coerceValue({ kind: "Bogus" } as never, "x", "Col")).toThrow(
      /Column Col: unsupported field kind 'Bogus'/,
    );
  });
  it("treats Currency like Number", () => {
    const config = { kind: "Currency", decimalPlaces: 2 } as const;
    expect(coerceValue(config, "12.5", "Price")).toBe(12.5);
    expect(() => coerceValue(config, "abc", "Price")).toThrow(DataException);
  });
  it("a Lookup is ids, single and multi", () => {
    const single = {
      kind: "Lookup",
      target: tags,
      displayField: "Title",
      multi: false,
    } as const;
    const multi = { ...single, multi: true } as const;
    expect(coerceValue(single, "6", "OwnerId")).toBe(6);
    expect(coerceValue(multi, { results: [6, "12"] }, "ReviewersId")).toEqual([
      6, 12,
    ]);
  });
});

describe("coerceRecord — path-shaped columns", () => {
  // SpeelDocument.FileSize maps to 'File/Length': an $expand=File nested value
  // that SharePoint serializes as a string (Int64). It must be typed in place.
  const fileSize: Property = Object.assign(numberProperty("FileSize"), {
    columnName: "File/Length",
  });
  it("types the nested leaf in place and leaves its siblings alone", () => {
    const out = coerceRecord(
      { Id: 1, File: { Length: "2048", Name: "a.pdf" } },
      [fileSize],
    );
    expect(out.File).toEqual({ Length: 2048, Name: "a.pdf" });
  });
  it("leaves a record whose nav is absent or null untouched (a folder row has no File)", () => {
    expect(coerceRecord({ Id: 1 }, [fileSize])).toEqual({ Id: 1 });
    expect(coerceRecord({ Id: 1, File: null }, [fileSize])).toEqual({
      Id: 1,
      File: null,
    });
  });
  it("does not mutate the nested object it was given", () => {
    const file = { Length: "2048" };
    coerceRecord({ Id: 1, File: file }, [fileSize]);
    expect(file.Length).toBe("2048");
  });
});

describe("coerceRecords", () => {
  it("types every record", () => {
    const out = coerceRecords(
      [{ IsPublic: 1 }, { IsPublic: 0 }],
      [booleanProperty("IsPublic")],
    );
    expect(out.map((r) => r.IsPublic)).toEqual([true, false]);
  });
});
