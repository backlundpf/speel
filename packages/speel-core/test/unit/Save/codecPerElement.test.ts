import { describe, it, expect } from "vitest";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";
import { Materialize } from "../../../src/Query/Materialize.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property, type IValueCodec } from "../../../src/Metadata/Property.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";
import type { IWriteField } from "../../../src/providers/ISharePointProvider.js";
import { ModelBuilder, Entity, JsonField } from "../../../src/index.js";
import type { PropertyBuilder } from "../../../src/ModelBuilder/PropertyBuilder.js";

interface Def {
  propertyName: string;
}

const jsonArray: IValueCodec = {
  toProvider: (v) => JSON.stringify(v),
  fromProvider: (s) => JSON.parse(s as string) as unknown,
};

const NOTE: FieldConfig = { kind: "Text", multiline: true };
const TEXT: FieldConfig = { kind: "Text", multiline: false };
const MULTI_CHOICE: FieldConfig = {
  kind: "Choice",
  multi: true,
  fillIn: false,
  radioButtons: false,
};
// PayloadBuilder/Materialize read only `kind` and `multi`; a real target is not needed.
const MULTI_LOOKUP = { kind: "Lookup", multi: true } as unknown as FieldConfig;

class Row {
  Id?: number;
  Value?: unknown;
}

function typeWith(config: FieldConfig, codec: IValueCodec): EntityType<Row> {
  return new EntityType<Row>({
    ctor: Row,
    list: { kind: "title", value: "Rows" },
    properties: [
      new Property({
        propertyName: "Id",
        columnName: "ID",
        displayName: "ID",
        config: { kind: "Number" },
        required: true,
        readOnly: true,
        key: true,
      }),
      new Property({
        propertyName: "Value",
        columnName: "Value",
        displayName: "Value",
        config,
        required: false,
        readOnly: false,
        key: false,
        codec,
      }),
    ],
  });
}

const byColumn = (fields: readonly IWriteField[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f.property.columnName, f.value]));

const row = (value: unknown): Row => Object.assign(new Row(), { Value: value });

describe("a codec on a single-valued column runs once, on the whole value", () => {
  const defs: Def[] = [{ propertyName: "username" }];
  const wire = '[{"propertyName":"username"}]';

  it("a Note column with an array model writes one string on add", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForAdd(row(defs), typeWith(NOTE, jsonArray)),
      ),
    ).toEqual({ Value: wire });
  });

  it("a Note column with an array model writes one string on update", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForUpdate(row(defs), typeWith(NOTE, jsonArray), [
          "Value",
        ]),
      ),
    ).toEqual({ Value: wire });
  });

  it("a single-line Text column with an array model writes one string", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForAdd(row(defs), typeWith(TEXT, jsonArray)),
      ),
    ).toEqual({ Value: wire });
  });

  it("reads the string back into the array model", () => {
    const e = Materialize.item(
      { ID: 1, Value: wire },
      typeWith(NOTE, jsonArray),
    );
    expect(e.Value).toEqual(defs);
  });

  it("hands a single-valued column's array to fromProvider whole", () => {
    const seen: unknown[] = [];
    const et = typeWith(TEXT, {
      fromProvider: (v) => {
        seen.push(v);
        return v;
      },
    });
    Materialize.item({ ID: 1, Value: ["a", "b"] }, et);
    expect(seen).toEqual([["a", "b"]]);
  });
});

describe("a codec on a multi-valued column runs per element", () => {
  const upper: IValueCodec = {
    toProvider: (v) => String(v).toUpperCase(),
    fromProvider: (v) => String(v).toLowerCase(),
  };

  it("multi-Choice: per element on write and on read", () => {
    const et = typeWith(MULTI_CHOICE, upper);
    expect(byColumn(PayloadBuilder.buildForAdd(row(["a", "b"]), et))).toEqual({
      Value: ["A", "B"],
    });
    expect(Materialize.item({ ID: 1, Value: ["A", "B"] }, et).Value).toEqual([
      "a",
      "b",
    ]);
  });

  it("multi-Lookup: per element on write and on read", () => {
    const et = typeWith(MULTI_LOOKUP, {
      toProvider: (v) => (v as { Id: number }).Id,
      fromProvider: (id) => ({ Id: id }),
    });
    expect(
      byColumn(PayloadBuilder.buildForAdd(row([{ Id: 1 }, { Id: 2 }]), et)),
    ).toEqual({ Value: [1, 2] });
    expect(Materialize.item({ ID: 1, Value: [1, 2] }, et).Value).toEqual([
      { Id: 1 },
      { Id: 2 },
    ]);
  });

  it("a multi column whose model is not an array gets the codec once", () => {
    const et = typeWith(MULTI_CHOICE, {
      toProvider: (s) => String(s).split(","),
    });
    expect(byColumn(PayloadBuilder.buildForAdd(row("a,b"), et))).toEqual({
      Value: ["a", "b"],
    });
  });
});

// The typed builders (decorators and fluent alike) type a Note property as a string;
// a model carried by a codec is reached the way the decorators do internally.
class Template {
  FieldDefinitions?: Def[];
  Name?: string;
}

@Entity({ list: "Templates" })
class TemplateRow {
  Id?: number;
  @JsonField({ of: () => Template }) Body?: Template;
}

function bodyCodec(): IValueCodec {
  const mb = new ModelBuilder();
  mb.shape(Template, (b) => {
    (
      b.property(
        (s) => s.FieldDefinitions,
      ) as unknown as PropertyBuilder<unknown>
    )
      .isNote()
      .hasCodec<Def[], string>({
        toProvider: (v: Def[]) => JSON.stringify(v),
        fromProvider: (s: string) => JSON.parse(s) as Def[],
      });
    b.property((s) => s.Name).isText();
  });
  mb.entity(TemplateRow as never);
  return mb
    .build()
    .findEntityType(TemplateRow as never)!
    .findProperty("Body")!.codec!;
}

describe("inside a Json shape", () => {
  it("an array-model codec on a Note property writes one string and reads it back", () => {
    const t = new Template();
    t.Name = "T";
    t.FieldDefinitions = [{ propertyName: "username" }];
    const wire = bodyCodec().toProvider!(t) as string;
    expect(JSON.parse(wire)).toEqual({
      Name: "T",
      FieldDefinitions: '[{"propertyName":"username"}]',
    });
    const back = bodyCodec().fromProvider!(wire) as Template;
    expect(back.FieldDefinitions).toEqual([{ propertyName: "username" }]);
  });
});
