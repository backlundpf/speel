import { describe, it, expect } from "vitest";
import { fieldSpecToUpdate } from "../src/schema/fieldSpecToUpdate.js";

describe("fieldSpecToUpdate", () => {
  it("always sets Required, defaulting it to false", () => {
    expect(fieldSpecToUpdate({ kind: "Boolean", internalName: "B" })).toEqual({
      Required: false,
    });
    expect(
      fieldSpecToUpdate({ kind: "Boolean", internalName: "B", required: true }),
    ).toEqual({ Required: true });
  });

  it("maps displayName to Title and carries description and index state", () => {
    expect(
      fieldSpecToUpdate({
        kind: "Boolean",
        internalName: "B",
        displayName: "Is Done",
        description: "why",
        indexed: true,
      }),
    ).toEqual({
      Required: false,
      Title: "Is Done",
      Description: "why",
      Indexed: true,
    });
  });

  it("carries type-specific alterable attributes", () => {
    expect(
      fieldSpecToUpdate({
        kind: "Text",
        internalName: "T",
        multiline: false,
        maxLength: 40,
      }),
    ).toEqual({ Required: false, MaxLength: 40 });

    expect(
      fieldSpecToUpdate({
        kind: "Number",
        internalName: "N",
        min: 0,
        max: 9,
      }),
    ).toEqual({ Required: false, MinimumValue: 0, MaximumValue: 9 });

    expect(
      fieldSpecToUpdate({
        kind: "DateTime",
        internalName: "D",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      }),
    ).toEqual({ Required: false, DisplayFormat: 0 });

    expect(
      fieldSpecToUpdate({
        kind: "Choice",
        internalName: "C",
        multi: false,
        choices: ["A", "B"],
        fillIn: true,
        displayAs: "Dropdown",
      }),
    ).toEqual({ Required: false, Choices: ["A", "B"], FillInChoice: true });
  });

  it("never sends a currency code, which SharePoint rejects as Edm.Int32", () => {
    expect(
      fieldSpecToUpdate({
        kind: "Currency",
        internalName: "Cost",
        decimalPlaces: 2,
        currencyCode: "USD",
      }),
    ).toEqual({ Required: false });
  });

  it("omits the structural props Lookup and User cannot alter in place", () => {
    expect(
      fieldSpecToUpdate({
        kind: "Lookup",
        internalName: "L",
        list: "Owners",
        showField: "Title",
        multi: true,
      }),
    ).toEqual({ Required: false });

    expect(
      fieldSpecToUpdate({
        kind: "User",
        internalName: "U",
        showField: "Title",
        multi: false,
      }),
    ).toEqual({ Required: false });
  });
});
