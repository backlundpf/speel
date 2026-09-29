import { describe, it, expect } from "vitest";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  DateTimeField,
  MultiChoiceField,
  JsonField,
  MultiJsonField,
  DataException,
} from "../../../src/index.js";
import { Materialize } from "../../../src/Query/Materialize.js";

@JsonShape()
class TaskDefinition {
  @TextField() Title?: string;
  @DateTimeField() DueDate?: Date;
}

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @MultiJsonField({ of: () => TaskDefinition }) Tasks?: TaskDefinition[];
  @JsonField({ of: () => TaskDefinition }) Headline?: TaskDefinition;
}

function tasksCodec() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  const et = mb.build().findEntityType(Process as never)!;
  return et.findProperty("Tasks")!.codec!;
}

function headlineCodec() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  const et = mb.build().findEntityType(Process as never)!;
  return et.findProperty("Headline")!.codec!;
}

function processEntityType() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  return mb.build().findEntityType(Process)!;
}

describe("a Json property's codec", () => {
  it("writes instances as a JSON string with dates as ISO", () => {
    const task = new TaskDefinition();
    task.Title = "Review";
    task.DueDate = new Date("2026-10-01T00:00:00.000Z");

    const wire = tasksCodec().toProvider!([task]) as string;
    expect(JSON.parse(wire)).toEqual([
      { Title: "Review", DueDate: "2026-10-01T00:00:00.000Z" },
    ]);
  });

  it("reads a string back as instances with real Dates", () => {
    const rows = tasksCodec().fromProvider!(
      '[{"Title":"Review","DueDate":"2026-10-01T00:00:00.000Z"}]',
    ) as TaskDefinition[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toBeInstanceOf(TaskDefinition);
    expect(rows[0]!.Title).toBe("Review");
    expect(rows[0]!.DueDate).toBeInstanceOf(Date);
  });

  it("keeps keys the shape no longer declares, and writes them back", () => {
    const conv = tasksCodec();
    const stored = '[{"Title":"Review","ReviewedBy":"someone@x.com"}]';
    const rows = conv.fromProvider!(stored) as TaskDefinition[];

    // Invisible to anything that walks the object…
    expect(Object.keys(rows[0]!)).toEqual(["Title"]);
    expect(JSON.stringify(rows[0])).toBe('{"Title":"Review"}');
    // …but still there when it goes back, so an older client cannot delete a
    // newer one's field by saving a row.
    expect(JSON.parse(conv.toProvider!(rows) as string)).toEqual([
      { Title: "Review", ReviewedBy: "someone@x.com" },
    ]);
  });

  it("tells an absent column from an empty list", () => {
    const conv = tasksCodec();
    expect(conv.fromProvider!(null)).toBeUndefined();
    expect(conv.fromProvider!("")).toBeUndefined();
    expect(conv.fromProvider!("[]")).toEqual([]);
  });

  it("survives a blob that is not the shape it expects", () => {
    // Stored data predates the model, or something else wrote the column.
    expect(() => tasksCodec().fromProvider!("not json")).toThrow(/Tasks/);
  });
});

describe("a single (non-multi) Json property's codec", () => {
  it("writes one instance as a JSON object, not an array", () => {
    const task = new TaskDefinition();
    task.Title = "Kickoff";

    const wire = headlineCodec().toProvider!(task) as string;
    expect(JSON.parse(wire)).toEqual({ Title: "Kickoff" });
  });

  it("reads a JSON object back as a single instance, not an array", () => {
    const row = headlineCodec().fromProvider!(
      '{"Title":"Kickoff"}',
    ) as TaskDefinition;

    expect(row).toBeInstanceOf(TaskDefinition);
    expect(Array.isArray(row)).toBe(false);
    expect(row.Title).toBe("Kickoff");
  });

  it("tells an absent column apart from other falsy input", () => {
    const conv = headlineCodec();
    expect(conv.fromProvider!(null)).toBeUndefined();
    expect(conv.fromProvider!(undefined)).toBeUndefined();
    expect(conv.fromProvider!("")).toBeUndefined();
  });
});

// Materialize maps `fromProvider` element-wise over an array RAW column value —
// the shape a multi-Lookup/multi-Choice column arrives in. A Json column never
// arrives that way: the provider always hands back a single string (the whole
// blob), multi or not, so that per-element branch can never fire for a Json
// property. Pinned here through Materialize.item itself, not the codec
// directly, since that per-element guard lives in Materialize, not in
// shapeCodec.
describe("Materialize reading a Json column", () => {
  it("reads a MultiJsonField's string column as instances — never per-element, since the column is one string, not an array", () => {
    const row = Materialize.item(
      { ID: 1, Tasks: '[{"Title":"Review"},{"Title":"Ship"}]' },
      processEntityType(),
    );
    expect(row.Tasks).toHaveLength(2);
    expect(row.Tasks![0]).toBeInstanceOf(TaskDefinition);
    expect(row.Tasks!.map((t) => t.Title)).toEqual(["Review", "Ship"]);
  });
});

describe("a Json column that is not the shape the property declares", () => {
  it("names the property when the column holds a JSON null", () => {
    // Was a bare `TypeError: Cannot read properties of null (reading 'Title')`
    // with no property in it, and the whole query dead with it.
    expect(() => headlineCodec().fromProvider!("null")).toThrow(DataException);
    expect(() => headlineCodec().fromProvider!("null")).toThrow(/Headline/);
  });

  it("names the property when the column holds a scalar", () => {
    expect(() => headlineCodec().fromProvider!('"just text"')).toThrow(
      /Headline/,
    );
    expect(() => tasksCodec().fromProvider!("42")).toThrow(/Tasks/);
  });

  it("skips a null element in a multi column rather than failing the query", () => {
    const rows = tasksCodec().fromProvider!(
      '[{"Title":"Review"},null,{"Title":"Ship"}]',
    ) as TaskDefinition[];
    expect(rows.map((t) => t.Title)).toEqual(["Review", "Ship"]);
  });

  it("names the property for a non-object element of a multi column", () => {
    expect(() => tasksCodec().fromProvider!('[{"Title":"a"},"b"]')).toThrow(
      /Tasks/,
    );
  });

  it("refuses an array in a single Json column instead of mangling it", () => {
    // It used to read as an empty instance with the array harvested into the
    // unknown-key bag, and the next save wrote `{"0":…,"1":…}` over the data.
    const conv = headlineCodec();
    expect(() => conv.fromProvider!('[{"Title":"a"},{"Title":"b"}]')).toThrow(
      DataException,
    );
    expect(() => conv.fromProvider!('[{"Title":"a"}]')).toThrow(
      /Headline.*MultiJsonField/s,
    );
  });

  it("never carries array indices forward as unknown keys", () => {
    // A row already written by that older build: the residue reads, but it is
    // not written back, so the row heals on its next save.
    const conv = headlineCodec();
    const row = conv.fromProvider!(
      '{"Title":"Kickoff","0":{"Title":"a"},"1":{"Title":"b"}}',
    ) as TaskDefinition;
    expect(row.Title).toBe("Kickoff");
    expect(JSON.parse(conv.toProvider!(row) as string)).toEqual({
      Title: "Kickoff",
    });
  });

  it("names the property when a multi property is handed a single instance", () => {
    const task = new TaskDefinition();
    task.Title = "Review";
    expect(() => tasksCodec().toProvider!(task)).toThrow(DataException);
    expect(() => tasksCodec().toProvider!(task)).toThrow(/Tasks/);
  });

  it("still wraps a single stored object into a list for a multi property — deliberately lenient", () => {
    const rows = tasksCodec().fromProvider!(
      '{"Title":"Review"}',
    ) as TaskDefinition[];
    expect(rows.map((t) => t.Title)).toEqual(["Review"]);
  });
});

// A property inside a shape carries its own `codec`, and core applies one
// PER ELEMENT for an array value — Materialize.item and
// PayloadBuilder.toProviderValue both do. A shape has to do the same, or a
// multi-Choice inside one round-trips ["T:x","T:y"] into the string "x,T:y".
@JsonShape()
class Tagged {
  @TextField() Title?: string;
  @MultiChoiceField<string>({
    options: ["x", "y"],
    codec: {
      fromProvider: (v) => String(v).replace(/^T:/, ""),
      toProvider: (v) => `T:${String(v)}`,
    },
  })
  Tags?: string[];
}

@Entity({ list: "Tagged" })
class TaggedOwner {
  Id?: number;
  @MultiJsonField({ of: () => Tagged }) Rows?: Tagged[];
}

function taggedCodec() {
  const mb = new ModelBuilder();
  mb.entity(TaggedOwner as never);
  const et = mb.build().findEntityType(TaggedOwner as never)!;
  return et.findProperty("Rows")!.codec!;
}

describe("a shape property whose own codec sees an array", () => {
  it("applies the codec per element, in both directions", () => {
    const conv = taggedCodec();
    const rows = conv.fromProvider!(
      '[{"Title":"a","Tags":["T:x","T:y"]}]',
    ) as Tagged[];

    expect(rows[0]!.Tags).toEqual(["x", "y"]);
    expect(JSON.parse(conv.toProvider!(rows) as string)).toEqual([
      { Title: "a", Tags: ["T:x", "T:y"] },
    ]);
  });
});

// The forward-compatibility promise the whole design rests on: two app versions
// run against one list for days, because SPFx serves cached bundles.
describe("unknown keys across versions", () => {
  it("gives every element of a multi value its own bag", () => {
    const conv = tasksCodec();
    const rows = conv.fromProvider!(
      '[{"Title":"a","OnlyOnA":1},{"Title":"b","OnlyOnB":2}]',
    ) as TaskDefinition[];
    rows[0]!.Title = "a2";

    expect(JSON.parse(conv.toProvider!(rows) as string)).toEqual([
      { Title: "a2", OnlyOnA: 1 },
      { Title: "b", OnlyOnB: 2 },
    ]);
  });

  it("carries no bag onto an element the caller newly added", () => {
    const conv = tasksCodec();
    const rows = conv.fromProvider!(
      '[{"Title":"a","OnlyOnA":1}]',
    ) as TaskDefinition[];
    const fresh = new TaskDefinition();
    fresh.Title = "b";
    rows.push(fresh);

    expect(JSON.parse(conv.toProvider!(rows) as string)).toEqual([
      { Title: "a", OnlyOnA: 1 },
      { Title: "b" },
    ]);
  });

  it("lets a declared key beat a stale carried one of the same name", () => {
    // v1 read the row (Notes is not in its model, so it went into the bag);
    // v2 declares Notes and the caller edits it. The edit must win — otherwise
    // the newer client can never change the field the older one is carrying.
    const v1 = boardCodec(["Title"]);
    const v2 = boardCodec(["Title", "Notes"]);

    const rows = v1.fromProvider!('[{"Title":"a","Notes":"stale"}]') as Item[];
    // v1's model has no Notes property, so the stored value never reaches the
    // instance — it rides along in the bag instead.
    expect(rows[0]!.Notes).toBeUndefined();

    rows[0]!.Notes = "edited";
    expect(JSON.parse(v2.toProvider!(rows) as string)).toEqual([
      { Title: "a", Notes: "edited" },
    ]);
  });
});

// Two models over the same classes, declared fluently so the shape's property
// set can differ between them — one app version behind, exactly as a cached
// SPFx bundle is.
class Item {
  Title?: string;
  Notes?: string;
}
class Board {
  Id?: number;
  Items?: Item[];
}

function boardCodec(declared: readonly string[]) {
  const mb = new ModelBuilder();
  mb.shape(Item as never, (b) => {
    for (const name of declared) b.property<string>(name).isText();
  });
  mb.entity(Board as never, (b) => {
    b.toList("Boards");
    b.property<Item[]>("Items").isMultiJson({ of: () => Item as never });
  });
  return mb
    .build()
    .findEntityType(Board as never)!
    .findProperty("Items")!.codec!;
}
