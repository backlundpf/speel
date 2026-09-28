import { describe, it, expect } from "vitest";
import type { IWriteField, FieldConfig } from "@speel/core";
import { DataException } from "@speel/core";
import {
  textProperty,
  numberProperty,
  booleanProperty,
  dateTimeProperty,
  choiceProperty,
  lookupProperty,
  stubEntityType,
} from "@speel/core/testing";
import {
  toJsonPayload,
  toFormValues,
  collectPrincipalIds,
  firstUnresolvedPrincipal,
  formFieldName,
  UnresolvedPrincipalException,
  encodeLookupCollectionFormValue,
  encodeMultiChoiceFormValue,
  encodeClaimsFormValue,
  encodeDateTimeFormValue,
} from "../src/formValues.js";

const TAGS = stubEntityType("Tags", {
  kind: "list",
  list: { kind: "title", value: "Tags" },
});
const PROGRAMS = stubEntityType("Programs", {
  kind: "list",
  list: { kind: "title", value: "Programs" },
});
const PRINCIPAL = stubEntityType("Principal", {
  kind: "provider",
  key: "principals",
});
const OWNER = lookupProperty("Owner", PRINCIPAL);
const REVIEWERS = lookupProperty("Reviewers", PRINCIPAL, { multi: true });
const TAGS_PROP = lookupProperty("Tags", TAGS, { multi: true });
const LABELS = choiceProperty("Labels", { multi: true });
const when = new Date(Date.UTC(2027, 2, 15, 12, 30, 45, 123));
const FIELDS: IWriteField[] = [
  { property: textProperty("Title"), value: "t" },
  { property: numberProperty("Budget"), value: 12.5 },
  { property: booleanProperty("IsPublic"), value: false },
  { property: booleanProperty("IsActive"), value: true },
  { property: dateTimeProperty("StartDate"), value: when },
  { property: choiceProperty("Status"), value: "Planning" },
  { property: LABELS, value: ["A", "B"] },
  { property: lookupProperty("Program", PROGRAMS), value: 2 },
  { property: TAGS_PROP, value: [3, 7] },
  { property: OWNER, value: 6 },
  { property: REVIEWERS, value: [6, 12] },
];
const logins = new Map([
  [6, "i:0#.f|membership|ada@x"],
  [12, "Audit Members"],
]);
/** A person column whose target names a key the provider does not serve. */
const mistyped: IWriteField = {
  property: lookupProperty(
    "Owner",
    stubEntityType("Nope", { kind: "provider", key: "nope" }),
  ),
  value: 6,
};
/** A field kind neither switch knows — only a cast gets one past the compiler. */
function bogusField(): IWriteField {
  const property = textProperty("Odd");
  property.config = { kind: "Bogus" } as unknown as FieldConfig;
  return { property, value: "x" };
}

describe("encoders", () => {
  it("lookup collection: id;# pairs, empty for none", () => {
    expect(encodeLookupCollectionFormValue([3, 7])).toBe("3;#;#7;#");
    expect(encodeLookupCollectionFormValue([3])).toBe("3;#");
    expect(encodeLookupCollectionFormValue([])).toBe("");
  });
  it("multi-choice: wrapped in ;#, both delimiters even for one value, empty for none", () => {
    expect(encodeMultiChoiceFormValue(["Red", "Blue"])).toBe(";#Red;#Blue;#");
    // Unlike the lookup collection, a single choice still carries the LEADING ;#.
    expect(encodeMultiChoiceFormValue(["Red"])).toBe(";#Red;#");
    expect(encodeMultiChoiceFormValue([])).toBe("");
  });
  it("claims: a JSON array of Keys", () => {
    expect(encodeClaimsFormValue(["i:0#.f|m|a", "Audit Members"])).toBe(
      '[{"Key":"i:0#.f|m|a"},{"Key":"Audit Members"}]',
    );
  });
  it("date: the sortable form, no T, no fraction, no zone", () => {
    expect(encodeDateTimeFormValue(when)).toBe("2027-03-15 12:30:45");
    expect(encodeDateTimeFormValue("not a date")).toBe("not a date");
  });
});

describe("formFieldName", () => {
  it("addresses a lookup by its bare field for the form API, everything else by its column", () => {
    expect(formFieldName(OWNER)).toBe("Owner");
    expect(formFieldName(REVIEWERS)).toBe("Reviewers");
    expect(formFieldName(textProperty("Title"))).toBe("Title");
    // A non-lookup column that happens to end in Id keeps its name.
    expect(formFieldName(textProperty("ExternalId"))).toBe("ExternalId");
  });
});

describe("toJsonPayload", () => {
  it("emits what items.add takes: ISO dates, arrays for multi, the FK column for every lookup, no claims", () => {
    expect(toJsonPayload(FIELDS)).toEqual({
      Title: "t",
      Budget: 12.5,
      IsPublic: false,
      IsActive: true,
      StartDate: when.toISOString(),
      Status: "Planning",
      Labels: ["A", "B"],
      ProgramId: 2,
      TagsId: [3, 7],
      OwnerId: 6,
      ReviewersId: [6, 12],
    });
  });
  it("a non-array on a multi-value column carries no collection", () => {
    expect(toJsonPayload([{ property: TAGS_PROP, value: 3 }])).toEqual({
      TagsId: [],
    });
    expect(toJsonPayload([{ property: LABELS, value: "A" }])).toEqual({
      Labels: [],
    });
  });
  it("null passes through as JSON null — a clear on update — whatever the kind", () => {
    expect(
      toJsonPayload([
        { property: dateTimeProperty("StartDate"), value: null },
        { property: textProperty("RepoUrl"), value: null },
        { property: OWNER, value: null },
      ]),
    ).toEqual({ StartDate: null, RepoUrl: null, OwnerId: null });
  });
  it("refuses an unsupported field kind loudly, naming it — never written as given", () => {
    expect(() => toJsonPayload([bogusField()])).toThrow(DataException);
    expect(() => toJsonPayload([bogusField()])).toThrow(
      /Column Odd: unsupported field kind 'Bogus'/,
    );
  });
});

describe("toFormValues", () => {
  it("emits what addValidateUpdateItemUsingPath takes, person columns as claims", () => {
    expect(toFormValues(FIELDS, (id) => logins.get(id))).toEqual([
      { FieldName: "Title", FieldValue: "t" },
      { FieldName: "Budget", FieldValue: "12.5" },
      { FieldName: "IsPublic", FieldValue: "0" },
      { FieldName: "IsActive", FieldValue: "1" },
      { FieldName: "StartDate", FieldValue: "2027-03-15 12:30:45" },
      { FieldName: "Status", FieldValue: "Planning" },
      { FieldName: "Labels", FieldValue: ";#A;#B;#" },
      { FieldName: "Program", FieldValue: "2" },
      { FieldName: "Tags", FieldValue: "3;#;#7;#" },
      { FieldName: "Owner", FieldValue: '[{"Key":"i:0#.f|membership|ada@x"}]' },
      {
        FieldName: "Reviewers",
        FieldValue:
          '[{"Key":"i:0#.f|membership|ada@x"},{"Key":"Audit Members"}]',
      },
    ]);
  });
  it("throws UnresolvedPrincipalException, naming id and field, for an id with no login — or an empty one", () => {
    const owner: IWriteField = { property: OWNER, value: 99 };
    expect(() => toFormValues([owner], () => undefined)).toThrow(
      UnresolvedPrincipalException,
    );
    try {
      toFormValues([owner], () => "");
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UnresolvedPrincipalException);
      // Named, since the class crosses a package boundary and callers match by name.
      expect((e as Error).name).toBe("UnresolvedPrincipalException");
      expect((e as UnresolvedPrincipalException).id).toBe(99);
      expect((e as UnresolvedPrincipalException).field).toBe("Owner");
    }
  });
  it("throws, naming the key, for a person column whose target this provider does not serve — before any login is asked for", () => {
    let asked = 0;
    expect(() =>
      toFormValues([mistyped], () => {
        asked++;
        return "i:0#.f|membership|ada@x";
      }),
    ).toThrow(/'nope'/);
    expect(asked).toBe(0);
  });
  it("refuses an unsupported field kind loudly, naming it — never String(value)", () => {
    expect(() => toFormValues([bogusField()], () => undefined)).toThrow(
      DataException,
    );
    expect(() => toFormValues([bogusField()], () => undefined)).toThrow(
      /Column Odd: unsupported field kind 'Bogus'/,
    );
  });
  it("a null element in a multi-person value names no principal — it is skipped, not resolved as 'principal 0'", () => {
    expect(
      toFormValues([{ property: REVIEWERS, value: [6, null, 12] }], (id) =>
        logins.get(id),
      ),
    ).toEqual([
      {
        FieldName: "Reviewers",
        FieldValue:
          '[{"Key":"i:0#.f|membership|ada@x"},{"Key":"Audit Members"}]',
      },
    ]);
  });
});

describe("collectPrincipalIds", () => {
  it("returns the distinct ids of every person field, single and multi, and nothing from list lookups", () => {
    expect(collectPrincipalIds(FIELDS)).toEqual([6, 12]);
  });
  it("a null, undefined or non-numeric value names no principal — never 'principal 0'", () => {
    const fields: IWriteField[] = [
      { property: OWNER, value: null },
      { property: REVIEWERS, value: [6, null, undefined, "x"] },
    ];
    expect(collectPrincipalIds(fields)).toEqual([6]);
  });
  it("names nothing for a person column whose target this provider does not serve — its operation is refused, not resolved", () => {
    // Throwing here would reject the whole batch from the up-front resolve; the
    // per-operation refusal belongs to firstUnresolvedPrincipal / toFormValues.
    expect(collectPrincipalIds([mistyped])).toEqual([]);
    expect(collectPrincipalIds([mistyped, FIELDS[9]!])).toEqual([6]);
  });
});

describe("firstUnresolvedPrincipal", () => {
  const loginOf = (id: number) => logins.get(id);
  it("null when every named principal resolves; the first unresolved one otherwise, naming id and field", () => {
    expect(firstUnresolvedPrincipal(FIELDS, loginOf)).toBeNull();
    const err = firstUnresolvedPrincipal(
      [
        { property: OWNER, value: 6 },
        { property: REVIEWERS, value: [12, 99, 98] },
      ],
      loginOf,
    );
    expect(err).toBeInstanceOf(UnresolvedPrincipalException);
    expect(err?.id).toBe(99);
    expect(err?.field).toBe("Reviewers");
    // An empty login is unresolved too — the same rule as toFormValues.
    expect(
      firstUnresolvedPrincipal([{ property: OWNER, value: 6 }], () => "")?.id,
    ).toBe(6);
  });
  it("skips null, undefined and non-numeric values — the same ids collectPrincipalIds resolves, no 'principal 0'", () => {
    const fields: IWriteField[] = [
      { property: OWNER, value: null },
      { property: REVIEWERS, value: [6, undefined, "x"] },
    ];
    expect(firstUnresolvedPrincipal(fields, loginOf)).toBeNull();
  });
  it("throws, naming the key, for a person column whose target this provider does not serve — even when its id would resolve", () => {
    expect(() => firstUnresolvedPrincipal([mistyped], loginOf)).toThrow(
      /'nope'/,
    );
  });
});
