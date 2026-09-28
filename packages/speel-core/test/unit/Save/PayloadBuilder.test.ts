import { describe, it, expect } from "vitest";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import type { IWriteField } from "../../../src/providers/ISharePointProvider.js";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  JsonField,
  MultiJsonField,
} from "../../../src/index.js";

class Blog {
  Id?: number;
  Title?: string;
  Body?: string;
  ViewCount?: number;
  IsPublished?: boolean;
  PublishedAt?: Date;
  Status?: string;
  Tags?: string[];
  Created?: Date;
}

function et() {
  const make = (
    n: string,
    t:
      | "Number"
      | "Text"
      | "Note"
      | "Boolean"
      | "DateTime"
      | "Choice"
      | "MultiChoice",
    isKey = false,
    isReadOnly = false,
  ) => {
    const config = (() => {
      switch (t) {
        case "Text":
          return { kind: "Text", multiline: false, maxLength: 255 } as const;
        case "Note":
          return {
            kind: "Text",
            multiline: true,
            richText: false,
            appendOnly: false,
            numberOfLines: 6,
          } as const;
        case "Boolean":
          return { kind: "Boolean" } as const;
        case "DateTime":
          return {
            kind: "DateTime",
            displayFormat: "DateTime",
            friendlyFormat: "Disabled",
          } as const;
        case "Choice":
        case "MultiChoice":
          return {
            kind: "Choice",
            multi: t === "MultiChoice",
            options: [],
            fillIn: false,
            radioButtons: false,
          } as const;
        default:
          return { kind: "Number" } as const;
      }
    })();
    return new Property({
      propertyName: n,
      columnName: n === "Id" ? "ID" : n,
      displayName: n,
      config,
      required: false,
      readOnly: isReadOnly,
      key: isKey,
    });
  };
  return new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [
      make("Id", "Number", true, true),
      make("Title", "Text"),
      make("Body", "Note"),
      make("ViewCount", "Number"),
      make("IsPublished", "Boolean"),
      make("PublishedAt", "DateTime"),
      make("Status", "Choice"),
      make("Tags", "MultiChoice"),
      make("Created", "DateTime", false, true),
    ],
  });
}

/** Column → typed value, for compact assertions; property identity is pinned separately. */
function byColumn(fields: readonly IWriteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [f.property.columnName, f.value]),
  );
}

describe("PayloadBuilder", () => {
  it("buildForAdd emits one IWriteField per set writable property — the model's own Property and the TYPED value", () => {
    const type = et();
    const when = new Date("2026-01-02T03:04:05Z");
    const b = new Blog();
    b.Title = "X";
    b.ViewCount = 3;
    b.IsPublished = true;
    b.PublishedAt = when;
    b.Status = "Draft";
    b.Tags = ["a", "b"];
    const fields = PayloadBuilder.buildForAdd(b, type);
    expect(byColumn(fields)).toEqual({
      Title: "X",
      ViewCount: 3,
      IsPublished: true,
      PublishedAt: when,
      Status: "Draft",
      Tags: ["a", "b"],
    });
    // The provider spells the wire from the Property it is handed — so it must be
    // the model's instance (its config, its column), and the Date must still be a Date.
    const published = fields.find(
      (f) => f.property.columnName === "PublishedAt",
    )!;
    expect(published.property).toBe(type.findProperty("PublishedAt"));
    expect(published.value).toBe(when);
  });

  it("buildForAdd skips undefined properties", () => {
    const b = new Blog();
    b.Title = "X";
    expect(byColumn(PayloadBuilder.buildForAdd(b, et()))).toEqual({
      Title: "X",
    });
  });

  it("buildForAdd omits a null field: an insert carries no clear", () => {
    // An optional unset date (e.g. Project.StartDate: Date | null = null) is null on
    // the entity. There is no prior value to clear on insert, so it is not a field.
    const b = new Blog();
    b.Title = "X";
    b.PublishedAt = null as unknown as Date;
    expect(byColumn(PayloadBuilder.buildForAdd(b, et()))).toEqual({
      Title: "X",
    });
  });

  it("buildForUpdate carries null for a dirty cleared column — an explicit clear", () => {
    const type = et();
    const b = new Blog();
    b.PublishedAt = null as unknown as Date;
    const fields = PayloadBuilder.buildForUpdate(b, type, ["PublishedAt"]);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.property).toBe(type.findProperty("PublishedAt"));
    expect(fields[0]!.value).toBeNull();
  });

  it("buildForAdd never includes Id or read-only fields", () => {
    const b = new Blog();
    b.Title = "X";
    b.Created = new Date();
    const columns = PayloadBuilder.buildForAdd(b, et()).map(
      (f) => f.property.columnName,
    );
    expect(columns).not.toContain("ID");
    expect(columns).not.toContain("Created");
  });

  it("buildForUpdate includes only the dirty columns", () => {
    const b = new Blog();
    b.Title = "X";
    b.ViewCount = 7;
    const dirty = ["Title"]; // only Title changed
    expect(byColumn(PayloadBuilder.buildForUpdate(b, et(), dirty))).toEqual({
      Title: "X",
    });
  });

  it("buildForUpdate carries an empty multi-value array — a multi-value clear", () => {
    const b = new Blog();
    b.Tags = [];
    expect(byColumn(PayloadBuilder.buildForUpdate(b, et(), ["Tags"]))).toEqual({
      Tags: [],
    });
  });

  it("buildForUpdate omits an undefined dirty column: nothing to say", () => {
    const b = new Blog();
    expect(PayloadBuilder.buildForUpdate(b, et(), ["Title"])).toEqual([]);
  });

  it("buildForUpdate skips read-only fields even if listed dirty", () => {
    const b = new Blog();
    b.Created = new Date();
    expect(PayloadBuilder.buildForUpdate(b, et(), ["Created"])).toEqual([]);
  });

  // The user's toProvider reconciles a model type with the field's typed value
  // (the sample's CategoryOption ↔ "eng"); it is the only codec slot core applies.
  // A null model value must NOT have it invoked — the codec assumes a
  // non-null model value. Mirrors Materialize's read-path guard.
  it("applies toProvider to a set value and never to a null one", () => {
    class Doc {
      Id?: number;
      Category: { id: string } | null = null;
    }
    const category = new Property({
      propertyName: "Category",
      columnName: "Category",
      displayName: "Category",
      config: {
        kind: "Choice",
        options: [],
        fillIn: false,
        radioButtons: false,
      },
      required: false,
      readOnly: false,
      key: false,
      codec: {
        toProvider: (o) => (o as { id: string }).id, // throws on null if invoked
        fromProvider: (s) => s,
      },
    });
    const etDoc = new EntityType<Doc>({
      ctor: Doc,
      list: { kind: "title", value: "Docs" },
      properties: [
        new Property({
          propertyName: "Id",
          columnName: "ID",
          displayName: "ID",
          config: { kind: "Number" },
          required: false,
          readOnly: true,
          key: true,
        }),
        category,
      ],
    });
    const set = new Doc();
    set.Category = { id: "eng" };
    expect(PayloadBuilder.buildForAdd(set, etDoc)).toEqual([
      { property: category, value: "eng" },
    ]);

    const unset = new Doc(); // Category stays null
    // Insert omits a null field entirely (nothing to set; the codec is
    // never invoked) — there is no existing value to "clear" on create.
    expect(PayloadBuilder.buildForAdd(unset, etDoc)).toEqual([]);
    // Update DOES carry null to clear a dirty field — still without invoking
    // the codec.
    expect(PayloadBuilder.buildForUpdate(unset, etDoc, ["Category"])).toEqual([
      { property: category, value: null },
    ]);
  });

  // Regression guard for the codec merge: Materialize and PayloadBuilder read ONLY
  // the provider pair (toProvider/fromProvider). If PayloadBuilder ever started
  // applying codec.toWire at the column boundary, a DateTime column would hand the
  // provider an ISO string where the typed-provider boundary expects a Date — this
  // property's author-supplied toWire throws, so a wrongly-invoked wire pair fails
  // loudly instead of silently passing (a DateTime's own toWire is otherwise an
  // identity no-op on a Date going the wrong way, which would mask the bug).
  it("ignores codec.toWire at the column boundary — a Date reaches the provider as a Date, never the wire pair", () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    const prop = new Property({
      propertyName: "When",
      columnName: "When",
      displayName: "When",
      config: {
        kind: "DateTime",
        displayFormat: "DateTime",
        friendlyFormat: "Disabled",
      },
      required: false,
      readOnly: false,
      key: false,
      codec: {
        toWire: () => {
          throw new Error("toWire must not run at the column boundary");
        },
      },
    });
    class Row {
      Id?: number;
      When?: Date;
    }
    const id = new Property({
      propertyName: "Id",
      columnName: "ID",
      displayName: "ID",
      config: { kind: "Number" },
      required: false,
      readOnly: true,
      key: true,
    });
    const etRow = new EntityType<Row>({
      ctor: Row,
      list: { kind: "title", value: "Rows" },
      properties: [id, prop],
    });
    const row = new Row();
    row.When = when;
    const fields = PayloadBuilder.buildForAdd(row, etRow);
    expect(fields).toEqual([{ property: prop, value: when }]);
    expect(fields[0]!.value).toBeInstanceOf(Date);
  });

  // A Json field's codec owns the WHOLE model value: for a MultiJsonField the
  // array itself is the value (one JSON string), not a list of values each getting
  // its own wire slot the way a multi-Lookup/multi-Choice column would. Regression
  // coverage for the bug found while implementing shapeCodec: toProviderValue's
  // generic "map a codec over an array model value" branch used to fire for a
  // MultiJsonField's array too, calling the shape codec once per element instead
  // of once with the array — `value.map is not a function`, since a lone shape
  // instance isn't itself an array.
  describe("a Json field's codec, through PayloadBuilder", () => {
    it("a populated MultiJsonField builds one JSON string holding every element", () => {
      const p = new Process();
      const t1 = new TaskDefinition();
      t1.Title = "A";
      const t2 = new TaskDefinition();
      t2.Title = "B";
      p.Tasks = [t1, t2];

      const fields = PayloadBuilder.buildForAdd(p, processEt());
      const tasksField = fields.find(
        (f) => f.property.propertyName === "Tasks",
      )!;
      expect(typeof tasksField.value).toBe("string");
      expect(JSON.parse(tasksField.value as string)).toEqual([
        { Title: "A" },
        { Title: "B" },
      ]);
    });

    it("a single JsonField still builds one JSON object string, not an array", () => {
      const p = new Process();
      const headline = new TaskDefinition();
      headline.Title = "Kickoff";
      p.Headline = headline;

      const fields = PayloadBuilder.buildForAdd(p, processEt());
      const headlineField = fields.find(
        (f) => f.property.propertyName === "Headline",
      )!;
      expect(typeof headlineField.value).toBe("string");
      expect(JSON.parse(headlineField.value as string)).toEqual({
        Title: "Kickoff",
      });
    });

    it("still maps a non-Json multi-value field's own codec element-wise — the Json special case is scoped to Json alone", () => {
      interface Opt {
        id: string;
        label: string;
      }
      class Multi {
        Id?: number;
        Fruits?: Opt[];
      }
      const fruits = new Property({
        propertyName: "Fruits",
        columnName: "Fruits",
        displayName: "Fruits",
        config: {
          kind: "Choice",
          multi: true,
          options: [],
          fillIn: false,
          radioButtons: false,
        },
        required: false,
        readOnly: false,
        key: false,
        codec: {
          toProvider: (o) => (o as Opt).id,
          fromProvider: (s) => ({ id: s as string, label: "" }),
        },
      });
      const etMulti = new EntityType<Multi>({
        ctor: Multi,
        list: { kind: "title", value: "Multis" },
        properties: [
          new Property({
            propertyName: "Id",
            columnName: "ID",
            displayName: "ID",
            config: { kind: "Number" },
            required: false,
            readOnly: true,
            key: true,
          }),
          fruits,
        ],
      });
      const row = new Multi();
      row.Fruits = [
        { id: "a", label: "Apple" },
        { id: "b", label: "Banana" },
      ];
      expect(byColumn(PayloadBuilder.buildForAdd(row, etMulti))).toEqual({
        Fruits: ["a", "b"],
      });
    });
  });
});

@JsonShape()
class TaskDefinition {
  @TextField() Title?: string;
}

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @MultiJsonField({ of: () => TaskDefinition }) Tasks?: TaskDefinition[];
  @JsonField({ of: () => TaskDefinition }) Headline?: TaskDefinition;
}

function processEt() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  return mb.build().findEntityType(Process as never)!;
}
