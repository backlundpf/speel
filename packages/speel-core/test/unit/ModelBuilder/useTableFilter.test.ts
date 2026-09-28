import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";

class Proj {
  Id?: number;
  Title?: string;
  DueDate?: Date;
  Status?: string;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Proj, (b) => {
    b.toList("Projects");
    b.property((e) => e.Id).isNumber();
    b.property((e) => e.Title).isText();
    b.property((e) => e.DueDate)
      .isDateTime()
      .useTableFilter({
        kind: "dateRange",
        presets: ["thisFiscalQuarter", "thisFiscalYear"],
      });
    b.property((e) => e.Status)
      .isChoice()
      .hasOptions(["Open", "Closed"])
      .useTableFilter({ kind: "none" });
  });
  return mb.build();
}

describe(".useTableFilter", () => {
  it("sets Property.tableFilter; unset stays undefined", () => {
    const et = model().findEntityType(Proj)!;
    expect(et.findProperty("Title")!.tableFilter).toBeUndefined();
    expect(et.findProperty("DueDate")!.tableFilter).toEqual({
      kind: "dateRange",
      presets: ["thisFiscalQuarter", "thisFiscalYear"],
    });
    expect(et.findProperty("Status")!.tableFilter).toEqual({ kind: "none" });
  });
});
