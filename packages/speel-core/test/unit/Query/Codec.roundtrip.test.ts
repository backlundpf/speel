import { describe, it, expect } from "vitest";
import { Property } from "../../../src/Metadata/Property.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Materialize } from "../../../src/Query/Materialize.js";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";

interface Opt {
  id: string;
  label: string;
}
const OPTS: Opt[] = [
  { id: "a", label: "Apple" },
  { id: "b", label: "Banana" },
];
const codec = {
  toProvider: (m: unknown) => (m as Opt).id,
  fromProvider: (s: unknown) => OPTS.find((o) => o.id === s),
};

class Row {
  Id?: number;
  Fruit?: Opt;
}

function rowEt(): EntityType<Row> {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const fruit = new Property({
    propertyName: "Fruit",
    columnName: "Fruit",
    displayName: "Fruit",
    config: {
      kind: "Choice",
      multi: false,
      options: [],
      fillIn: false,
      radioButtons: false,
    },
    required: false,
    readOnly: false,
    key: false,
    codec,
  });
  return new EntityType<Row>({
    ctor: Row,
    list: { kind: "title", value: "Rows" },
    properties: [id, fruit],
  });
}

describe("value codec round-trip", () => {
  it("Materialize maps the provider scalar to the model object (fromProvider)", () => {
    const r = Materialize.item({ ID: 1, Fruit: "b" }, rowEt());
    expect(r.Fruit).toEqual({ id: "b", label: "Banana" });
  });

  it("an unmatched provider scalar leaves the property undefined", () => {
    const r = Materialize.item({ ID: 2, Fruit: "zzz" }, rowEt());
    expect(r.Fruit).toBeUndefined();
  });

  it("PayloadBuilder maps the model object to the provider scalar (toProvider)", () => {
    const row = new Row();
    row.Fruit = { id: "a", label: "Apple" };
    const fields = PayloadBuilder.buildForAdd(row, rowEt());
    expect(fields.map((f) => [f.property.columnName, f.value])).toEqual([
      ["Fruit", "a"],
    ]);
  });
});
