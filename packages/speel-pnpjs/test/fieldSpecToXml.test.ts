import { describe, it, expect } from "vitest";
import { fieldSpecToXml } from "../src/schema/fieldSpecToXml.js";
import { emptySnapshot, type SchemaSnapshot } from "@speel/migrations";

function snapWithOwners(): SchemaSnapshot {
  const s = emptySnapshot();
  s.lists.set("Owners", {
    id: "owners-guid",
    title: "Owners",
    fields: new Map(),
  });
  return s;
}

const snap = emptySnapshot();

describe("fieldSpecToXml", () => {
  it("single-line text carries name, display name, required, indexed, MaxLength", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "Text",
          internalName: "Code",
          displayName: "Project Code",
          multiline: false,
          maxLength: 64,
          required: true,
          indexed: true,
        },
        snap,
      ),
    ).toBe(
      '<Field Type="Text" Name="Code" StaticName="Code" DisplayName="Project Code" Required="TRUE" Indexed="TRUE" MaxLength="64" />',
    );
  });

  it("defaults DisplayName to the internal name and flags to FALSE", () => {
    expect(
      fieldSpecToXml({ kind: "Boolean", internalName: "Done" }, snap),
    ).toBe(
      '<Field Type="Boolean" Name="Done" StaticName="Done" DisplayName="Done" Required="FALSE" Indexed="FALSE" />',
    );
  });

  it("multiline text becomes Note with rich-text mode and append-only", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "Text",
          internalName: "Body",
          multiline: true,
          richText: true,
          appendOnly: true,
          numberOfLines: 12,
        },
        snap,
      ),
    ).toBe(
      '<Field Type="Note" Name="Body" StaticName="Body" DisplayName="Body" Required="FALSE" Indexed="FALSE" NumLines="12" RichText="TRUE" RichTextMode="FullHtml" AppendOnly="TRUE" />',
    );
  });

  it("omits RichTextMode for a plain-text Note", () => {
    const xml = fieldSpecToXml(
      { kind: "Text", internalName: "Body", multiline: true, richText: false },
      snap,
    );
    expect(xml).toContain('RichText="FALSE"');
    expect(xml).not.toContain("RichTextMode");
  });

  it("number emits Decimals and Percentage, which the old path dropped", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "Number",
          internalName: "Ratio",
          min: 0,
          max: 1,
          decimalPlaces: 3,
          showAsPercentage: true,
        },
        snap,
      ),
    ).toBe(
      '<Field Type="Number" Name="Ratio" StaticName="Ratio" DisplayName="Ratio" Required="FALSE" Indexed="FALSE" Min="0" Max="1" Decimals="3" Percentage="TRUE" />',
    );
  });

  it("omits Decimals when decimalPlaces is 'auto'", () => {
    const xml = fieldSpecToXml(
      { kind: "Number", internalName: "N", decimalPlaces: "auto" },
      snap,
    );
    expect(xml).not.toContain("Decimals");
  });

  it("keeps a zero Min, which a truthiness check would drop", () => {
    const xml = fieldSpecToXml(
      { kind: "Number", internalName: "N", min: 0 },
      snap,
    );
    expect(xml).toContain('Min="0"');
  });

  it("currency emits Decimals but never a currency code", () => {
    const xml = fieldSpecToXml(
      {
        kind: "Currency",
        internalName: "Cost",
        decimalPlaces: 2,
        currencyCode: "USD",
      },
      snap,
    );
    expect(xml).toContain('Type="Currency"');
    expect(xml).toContain('Decimals="2"');
    expect(xml).not.toContain("USD");
    expect(xml).not.toContain("LCID");
  });

  it("datetime emits Format and FriendlyDisplayFormat, which the old path dropped", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "DateTime",
          internalName: "Due",
          displayFormat: "DateOnly",
          friendlyFormat: "Relative",
        },
        snap,
      ),
    ).toBe(
      '<Field Type="DateTime" Name="Due" StaticName="Due" DisplayName="Due" Required="FALSE" Indexed="FALSE" Format="DateOnly" FriendlyDisplayFormat="Relative" />',
    );
  });

  it("choice nests CHOICES children and carries Format and FillInChoice", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "Choice",
          internalName: "Status",
          multi: false,
          choices: ["Open", "Closed"],
          fillIn: true,
          displayAs: "RadioButtons",
        },
        snap,
      ),
    ).toBe(
      '<Field Type="Choice" Name="Status" StaticName="Status" DisplayName="Status" Required="FALSE" Indexed="FALSE" FillInChoice="TRUE" Format="RadioButtons">' +
        "<CHOICES><CHOICE>Open</CHOICE><CHOICE>Closed</CHOICE></CHOICES></Field>",
    );
  });

  it("multi choice becomes MultiChoice with Mult and no Format", () => {
    const xml = fieldSpecToXml(
      {
        kind: "Choice",
        internalName: "Tags",
        multi: true,
        choices: ["A"],
        fillIn: false,
        displayAs: "Dropdown",
      },
      snap,
    );
    expect(xml).toContain('Type="MultiChoice"');
    expect(xml).toContain('Mult="TRUE"');
    expect(xml).not.toContain("Format=");
  });

  it("lookup resolves its target list guid from the snapshot", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "Lookup",
          internalName: "Owner",
          list: "Owners",
          showField: "Title",
          multi: false,
        },
        snapWithOwners(),
      ),
    ).toBe(
      '<Field Type="Lookup" Name="Owner" StaticName="Owner" DisplayName="Owner" Required="FALSE" Indexed="FALSE" List="{owners-guid}" ShowField="Title" />',
    );
  });

  it("multi lookup becomes LookupMulti with Mult", () => {
    const xml = fieldSpecToXml(
      {
        kind: "Lookup",
        internalName: "Owners",
        list: "Owners",
        showField: "Title",
        multi: true,
      },
      snapWithOwners(),
    );
    expect(xml).toContain('Type="LookupMulti"');
    expect(xml).toContain('Mult="TRUE"');
  });

  it("throws a named error when the lookup target is not in the snapshot", () => {
    expect(() =>
      fieldSpecToXml(
        {
          kind: "Lookup",
          internalName: "Owner",
          list: "Ghost",
          showField: "Title",
          multi: false,
        },
        snap,
      ),
    ).toThrow(/lookup target 'Ghost'/);
  });

  it("user emits UserSelectionMode and never ShowField", () => {
    expect(
      fieldSpecToXml(
        {
          kind: "User",
          internalName: "Assignee",
          showField: "Title",
          multi: false,
        },
        snap,
      ),
    ).toBe(
      '<Field Type="User" Name="Assignee" StaticName="Assignee" DisplayName="Assignee" Required="FALSE" Indexed="FALSE" UserSelectionMode="1" />',
    );
  });

  it("multi user becomes UserMulti with Mult", () => {
    const xml = fieldSpecToXml(
      { kind: "User", internalName: "Team", showField: "Title", multi: true },
      snap,
    );
    expect(xml).toContain('Type="UserMulti"');
    expect(xml).toContain('Mult="TRUE"');
    expect(xml).not.toContain("ShowField");
  });

  it("escapes every interpolated value", () => {
    const xml = fieldSpecToXml(
      {
        kind: "Choice",
        internalName: "A&B",
        displayName: '<script>"x"',
        multi: false,
        choices: ["a<b"],
        fillIn: false,
        displayAs: "Dropdown",
      },
      snap,
    );
    expect(xml).toContain('Name="A&amp;B"');
    expect(xml).toContain('DisplayName="&lt;script&gt;&quot;x&quot;"');
    expect(xml).toContain("<CHOICE>a&lt;b</CHOICE>");
  });

  it("emits Description only when the spec sets one", () => {
    expect(
      fieldSpecToXml(
        { kind: "Boolean", internalName: "D", description: "why" },
        snap,
      ),
    ).toContain('Description="why"');
    expect(
      fieldSpecToXml({ kind: "Boolean", internalName: "D" }, snap),
    ).not.toContain("Description");
  });
});
