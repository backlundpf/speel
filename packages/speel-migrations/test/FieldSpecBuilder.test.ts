import { describe, it, expect } from "vitest";
import { FieldSpecBuilder } from "../src/operations/FieldSpecBuilder.js";

const f = (name: string) => new FieldSpecBuilder(name);

describe("FieldSpecBuilder", () => {
  it("text: single-line with attributes", () => {
    expect(
      f("Title").text({ maxLength: 255, required: true, indexed: true }),
    ).toEqual({
      kind: "Text",
      internalName: "Title",
      multiline: false,
      maxLength: 255,
      required: true,
      indexed: true,
    });
  });
  it("note: multiline text", () => {
    expect(f("Body").note({ richText: true })).toEqual({
      kind: "Text",
      internalName: "Body",
      multiline: true,
      richText: true,
    });
  });
  it("number / currency / boolean / dateTime", () => {
    expect(f("N").number({ min: 0 })).toEqual({
      kind: "Number",
      internalName: "N",
      min: 0,
    });
    expect(f("C").currency({ decimalPlaces: 2 })).toEqual({
      kind: "Currency",
      internalName: "C",
      decimalPlaces: 2,
    });
    expect(f("B").boolean()).toEqual({ kind: "Boolean", internalName: "B" });
    expect(f("D").dateTime({ displayFormat: "DateOnly" })).toEqual({
      kind: "DateTime",
      internalName: "D",
      displayFormat: "DateOnly",
      friendlyFormat: "Disabled",
    });
  });
  it("choice / multiChoice", () => {
    expect(f("S").choice(["a", "b"])).toEqual({
      kind: "Choice",
      internalName: "S",
      multi: false,
      choices: ["a", "b"],
      fillIn: false,
      displayAs: "Dropdown",
    });
    expect(f("M").multiChoice(["a"])).toMatchObject({
      kind: "Choice",
      multi: true,
      choices: ["a"],
    });
  });
  it("lookup / user", () => {
    expect(f("OwnerId").lookup({ list: "People", showField: "Title" })).toEqual(
      {
        kind: "Lookup",
        internalName: "OwnerId",
        list: "People",
        showField: "Title",
        multi: false,
      },
    );
    expect(f("AssigneeId").user({ multi: true })).toEqual({
      kind: "User",
      internalName: "AssigneeId",
      showField: "Title",
      multi: true,
    });
  });
  it("carries the creation-only hidden and addToDefaultView flags", () => {
    expect(
      f("Tracking").text({ hidden: true, addToDefaultView: false }),
    ).toEqual({
      kind: "Text",
      internalName: "Tracking",
      multiline: false,
      hidden: true,
      addToDefaultView: false,
    });
    expect(f("Flag").boolean({ addToDefaultView: false })).toEqual({
      kind: "Boolean",
      internalName: "Flag",
      addToDefaultView: false,
    });
  });
});
