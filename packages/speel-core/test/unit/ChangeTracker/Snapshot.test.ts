import { describe, it, expect } from "vitest";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  DateTimeField,
  MultiJsonField,
} from "../../../src/index.js";
import { Materialize } from "../../../src/Query/Materialize.js";

class Blog {
  Id?: number;
  Title?: string | undefined;
  Tags?: string[];
  PublishedAt?: Date;
}

function et() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const tags = new Property({
    propertyName: "Tags",
    columnName: "Tags",
    displayName: "Tags",
    config: {
      kind: "Choice",
      multi: true,
      options: ["a", "b", "c"],
      fillIn: false,
      radioButtons: false,
    },
    required: false,
    readOnly: false,
    key: false,
  });
  const pub = new Property({
    propertyName: "PublishedAt",
    columnName: "PublishedAt",
    displayName: "PublishedAt",
    config: {
      kind: "DateTime",
      displayFormat: "DateTime",
      friendlyFormat: "Disabled",
    },
    required: false,
    readOnly: false,
    key: false,
  });
  return new EntityType({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title, tags, pub],
  });
}

describe("Snapshot", () => {
  it("captures configured properties only", () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    (e as any).Untracked = "x";
    const snap = Snapshot.take(e, et());
    expect(snap.values).toEqual({
      Id: 1,
      Title: "A",
      Tags: undefined,
      PublishedAt: undefined,
    });
  });

  it("diffDirtyColumns returns SP internal names of changed properties", () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    const snap = Snapshot.take(e, et());
    e.Title = "B";
    expect(snap.diffDirtyColumns(e, et())).toEqual(["Title"]);
  });

  it("string array compared element-wise with order", () => {
    const e = new Blog();
    e.Tags = ["a", "b"];
    const snap = Snapshot.take(e, et());
    e.Tags = ["b", "a"];
    expect(snap.diffDirtyColumns(e, et())).toEqual(["Tags"]);
  });

  it("Date compared by getTime()", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const e = new Blog();
    e.PublishedAt = d;
    const snap = Snapshot.take(e, et());
    e.PublishedAt = new Date("2026-01-01T00:00:00Z"); // same instant, different instance
    expect(snap.diffDirtyColumns(e, et())).toEqual([]);
  });

  it("null and undefined considered equal", () => {
    const e = new Blog();
    e.Title = undefined;
    const snap = Snapshot.take(e, et());
    (e as any).Title = null;
    expect(snap.diffDirtyColumns(e, et())).toEqual([]);
  });
});

// An object-valued column — a Json field's shape instance, or a Choice whose
// options are objects — used to be dirty forever: `equal` had no branch for
// plain objects, and a snapshot's clone is never the same object as the live
// value, so every save re-sent the column and getDirtyColumns() never emptied.

@JsonShape()
class TaskDefinition {
  @TextField() Title?: string;
  @DateTimeField() DueDate?: Date;
}

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @TextField() Name?: string;
  @MultiJsonField({ of: () => TaskDefinition }) Tasks?: TaskDefinition[];
}

function processEt() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  return mb.build().findEntityType(Process as never)!;
}

/** A row as it comes back from the provider, through the real read path. */
function loadProcess(tasksColumn: string) {
  const et = processEt();
  const entity = Materialize.item(
    { ID: 1, Name: "P", Tasks: tasksColumn },
    et,
  ) as unknown as Process;
  return { et, entity, snap: Snapshot.take(entity, et) };
}

class Ticket {
  Id?: number;
  Status?: { Key: string; Text: string };
}

function ticketEt() {
  return new EntityType({
    ctor: Ticket,
    list: { kind: "title", value: "Tickets" },
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
        propertyName: "Status",
        columnName: "Status",
        displayName: "Status",
        config: {
          kind: "Choice",
          multi: false,
          options: [
            { Key: "open", Text: "Open" },
            { Key: "done", Text: "Done" },
          ],
          fillIn: false,
          radioButtons: false,
        },
        required: false,
        readOnly: false,
        key: false,
      }),
    ],
  });
}

describe("Snapshot over object-valued columns", () => {
  it("a populated Json column is not dirty after a load with no edits", () => {
    const { et, entity, snap } = loadProcess(
      '[{"Title":"Review","DueDate":"2026-10-01T00:00:00.000Z"},{"Title":"Ship"}]',
    );
    expect(entity.Tasks).toHaveLength(2);
    expect(snap.diffDirtyColumns(entity, et)).toEqual([]);
  });

  it("a Json column is dirty once a shape's property really changes", () => {
    const { et, entity, snap } = loadProcess('[{"Title":"Review"}]');
    entity.Tasks![0]!.Title = "Reviewed";
    expect(snap.diffDirtyColumns(entity, et)).toEqual(["Tasks"]);
  });

  it("a Json column is dirty when a shape's Date changes, and not when it is re-set to the same instant", () => {
    const { et, entity, snap } = loadProcess(
      '[{"Title":"Review","DueDate":"2026-10-01T00:00:00.000Z"}]',
    );
    entity.Tasks![0]!.DueDate = new Date("2026-10-01T00:00:00.000Z");
    expect(snap.diffDirtyColumns(entity, et)).toEqual([]);
    entity.Tasks![0]!.DueDate = new Date("2026-10-02T00:00:00.000Z");
    expect(snap.diffDirtyColumns(entity, et)).toEqual(["Tasks"]);
  });

  it("unknown keys carried on a shape instance do not make the row dirty", () => {
    // The bag is symbol-keyed and non-enumerable precisely so it stays out of
    // the comparison: a v2 field an older client cannot see must not make that
    // client re-save the row on every load.
    const { et, entity, snap } = loadProcess(
      '[{"Title":"Review","ReviewedBy":"someone@x.com"}]',
    );
    expect(snap.diffDirtyColumns(entity, et)).toEqual([]);
  });

  it("an object-valued Choice is not permanently dirty either", () => {
    const et = ticketEt();
    const e = new Ticket();
    e.Id = 1;
    e.Status = { Key: "open", Text: "Open" };
    const snap = Snapshot.take(e, et);
    expect(snap.diffDirtyColumns(e, et)).toEqual([]);
    e.Status = { Key: "done", Text: "Done" };
    expect(snap.diffDirtyColumns(e, et)).toEqual(["Status"]);
  });

  it("tells an object apart from an array and from a Date at the same key", () => {
    const et = ticketEt();
    const e = new Ticket();
    e.Status = { Key: "open", Text: "Open" };
    const snap = Snapshot.take(e, et);
    (e as unknown as Record<string, unknown>).Status = [
      { Key: "open", Text: "Open" },
    ];
    expect(snap.diffDirtyColumns(e, et)).toEqual(["Status"]);
    (e as unknown as Record<string, unknown>).Status = new Date(0);
    expect(snap.diffDirtyColumns(e, et)).toEqual(["Status"]);
  });
});
