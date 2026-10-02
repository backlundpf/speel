import { describe, it, expect } from "vitest";
import {
  alterFieldDataLoss,
  annotateDataLoss,
  spFieldTypeOf,
} from "../src/plan/dataLoss.js";
import { buildSteps } from "../src/plan/buildSteps.js";
import { emptySnapshot } from "../src/schema/SchemaSnapshot.js";
import { FieldSpecBuilder } from "../src/operations/FieldSpecBuilder.js";

const f = new FieldSpecBuilder("Value");

describe("spFieldTypeOf", () => {
  it("names the SharePoint type a spec creates", () => {
    expect(spFieldTypeOf(f.text())).toBe("Text");
    expect(spFieldTypeOf(f.note())).toBe("Note");
    expect(spFieldTypeOf(f.number())).toBe("Number");
    expect(spFieldTypeOf(f.currency({ decimalPlaces: 2 }))).toBe("Currency");
    expect(spFieldTypeOf(f.boolean())).toBe("Boolean");
    expect(spFieldTypeOf(f.dateTime())).toBe("DateTime");
    expect(spFieldTypeOf(f.choice(["a"]))).toBe("Choice");
    expect(spFieldTypeOf(f.multiChoice(["a"]))).toBe("MultiChoice");
    expect(spFieldTypeOf(f.lookup({ list: "L" }))).toBe("Lookup");
    expect(spFieldTypeOf(f.lookup({ list: "L", multi: true }))).toBe(
      "LookupMulti",
    );
    expect(spFieldTypeOf(f.user())).toBe("User");
    expect(spFieldTypeOf(f.user({ multi: true }))).toBe("UserMulti");
  });
});

describe("alterFieldDataLoss", () => {
  it("is silent when the type does not change", () => {
    expect(alterFieldDataLoss("Note", f.note())).toBeUndefined();
    expect(
      alterFieldDataLoss("Text", f.text({ maxLength: 50 })),
    ).toBeUndefined();
  });

  it.each([
    ["Text", f.note()],
    ["Number", f.currency({ decimalPlaces: 2 })],
    ["Currency", f.number()],
    ["Number", f.text()],
    ["DateTime", f.note()],
    ["Boolean", f.text()],
    ["Choice", f.multiChoice(["a"])],
    ["Choice", f.text()],
    ["MultiChoice", f.note()],
    ["Lookup", f.lookup({ list: "L", multi: true })],
    ["User", f.user({ multi: true })],
  ] as const)("treats %s as a safe source for a widening", (from, to) => {
    expect(alterFieldDataLoss(from, to)).toBeUndefined();
  });

  it("names the 255-character truncation for Note → Text", () => {
    expect(alterFieldDataLoss("Note", f.text())).toMatch(/255 characters/);
  });

  it.each([
    ["Text", f.number()],
    ["MultiChoice", f.choice(["a"])],
    ["LookupMulti", f.lookup({ list: "L" })],
    ["UserMulti", f.user()],
    ["Text", f.dateTime()],
    ["Note", f.choice(["a"])],
    ["Calculated", f.text()],
  ] as const)("warns when %s narrows", (from, to) => {
    const message = alterFieldDataLoss(from, to);
    expect(message).toBeDefined();
    expect(message).toContain(from);
    expect(message).toContain(spFieldTypeOf(to));
  });
});

describe("annotateDataLoss", () => {
  it("walks the plan over the live types, following earlier steps", () => {
    const snap = emptySnapshot();
    snap.lists.set("Config", {
      id: "g",
      title: "Config",
      fields: new Map([
        [
          "Value",
          {
            internalName: "Value",
            typeAsString: "Note",
            required: false,
            indexed: false,
          },
        ],
      ]),
    });
    const steps = [
      ...buildSteps(
        "m1",
        "down",
        [
          { op: "alterField", list: "Config", field: f.text() },
          {
            op: "addField",
            list: "Config",
            field: new FieldSpecBuilder("N").note(),
          },
        ],
        true,
      ),
      ...buildSteps(
        "m0",
        "down",
        [
          { op: "alterField", list: "Config", field: f.number() },
          {
            op: "alterField",
            list: "Config",
            field: new FieldSpecBuilder("N").text(),
          },
          {
            op: "alterField",
            list: "Config",
            field: new FieldSpecBuilder("Unknown").text(),
          },
        ],
        true,
      ),
    ];
    annotateDataLoss(snap, steps);
    expect(steps[0]!.warning).toMatch(/255 characters/);
    expect(steps[1]!.warning).toBeUndefined();
    // Value is Text by now (step 0), and Text → Number narrows.
    expect(steps[2]!.warning).toMatch(/Text.*Number/);
    // N was added as Note in this same plan.
    expect(steps[3]!.warning).toMatch(/255 characters/);
    // A column the plan knows nothing about cannot be judged.
    expect(steps[4]!.warning).toBeUndefined();
  });
});
