import { describe, it, expect } from "vitest";
import { codecFor } from "../../../src/Metadata/valueCodec.js";
import { Property } from "../../../src/Metadata/Property.js";
import { DataException } from "../../../src/errors.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";

const text: FieldConfig = { kind: "Text", multiline: false };
const dateTime: FieldConfig = {
  kind: "DateTime",
  displayFormat: "DateTime",
  friendlyFormat: "Disabled",
};

describe("codecFor", () => {
  it("has nothing to do for the kinds JSON represents natively", () => {
    expect(codecFor(text, "textProp")).toBeUndefined();
    expect(codecFor({ kind: "Boolean" }, "boolProp")).toBeUndefined();
    expect(codecFor({ kind: "Number" }, "numProp")).toBeUndefined();
  });

  it("writes a Date as an ISO string and reads it back as a Date", () => {
    const codec = codecFor(dateTime, "when")!;
    const when = new Date("2026-09-22T14:30:00.000Z");
    expect(codec.toWire!(when)).toBe("2026-09-22T14:30:00.000Z");
    const back = codec.fromWire!("2026-09-22T14:30:00.000Z");
    expect(back).toBeInstanceOf(Date);
    expect((back as Date).getTime()).toBe(when.getTime());
  });

  it("passes null and undefined through untouched", () => {
    const codec = codecFor(dateTime, "when")!;
    expect(codec.toWire!(null)).toBeNull();
    expect(codec.fromWire!(undefined)).toBeUndefined();
  });

  it("rejects an unparseable date string from fromWire", () => {
    const codec = codecFor(dateTime, "when")!;
    expect(() => codec.fromWire!("banana")).toThrow(DataException);
    const err = () => codec.fromWire!("banana");
    expect(() => err()).toThrow(/when.*banana/);
  });

  it("rejects an invalid Date from toWire", () => {
    const codec = codecFor(dateTime, "when")!;
    const invalid = new Date("banana");
    expect(() => codec.toWire!(invalid)).toThrow(DataException);
  });

  it("leaves a Choice alone — there is nothing to resolve against", () => {
    // A Choice's options may be a literal array, a thunk evaluated per field
    // instance, or a server-side loader run per search term, so no codec can
    // resolve a stored value synchronously. Core does not map an option to a
    // stored value in a COLUMN either — `optionsValue` is the picker's key, and
    // only the user's `codec` runs on the read/write path. A property
    // inside JSON therefore behaves exactly as it does in a column.
    expect(
      codecFor(
        {
          kind: "Choice",
          multi: false,
          fillIn: false,
          radioButtons: false,
          options: ["Low", "High"],
        },
        "choice",
      ),
    ).toBeUndefined();
  });
});

describe("Property.codec — the merged container", () => {
  it("merges the kind's wire pair with the author's provider pair", () => {
    // A DateTime property with an author codec: the per-kind ISO handling and the
    // author's own codec live in ONE container, in different slots.
    const property = new Property({
      propertyName: "DueDate",
      columnName: "DueDate",
      displayName: "Due",
      config: {
        kind: "DateTime",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      },
      required: false,
      readOnly: false,
      key: false,
      codec: {
        toProvider: (model) => new Date(model as string),
        fromProvider: (provider) =>
          (provider as Date).toISOString().slice(0, 10),
      },
    });

    expect(property.codec?.toWire).toBeTypeOf("function"); // from the kind
    expect(property.codec?.toProvider).toBeTypeOf("function"); // from the author
    expect(
      property.codec?.fromProvider?.(new Date("2026-10-01T00:00:00.000Z")),
    ).toBe("2026-10-01");
  });

  it("gives a property with no author codec only the kind's wire pair", () => {
    const property = new Property({
      propertyName: "DueDate",
      columnName: "DueDate",
      displayName: "Due",
      config: {
        kind: "DateTime",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      },
      required: false,
      readOnly: false,
      key: false,
    });
    expect(property.codec?.toWire).toBeTypeOf("function");
    expect(property.codec?.toProvider).toBeUndefined();
  });
});
