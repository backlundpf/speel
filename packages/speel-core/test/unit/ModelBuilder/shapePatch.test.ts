import { describe, it, expect } from "vitest";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  MultiJsonField,
  patchShapeInstance,
  shapeValueErrors,
  collectErrors,
} from "../../../src/index.js";
import type { FieldContext } from "../../../src/types.js";

@JsonShape()
class TaskDefinition {
  @TextField({ required: true }) Title?: string;
  @TextField() Notes?: string;
}

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @MultiJsonField({ of: () => TaskDefinition }) Tasks?: TaskDefinition[];
}

function shapeType() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  return mb.build().findEntityType(TaskDefinition as never)!;
}

/** Round-trips a stored blob into instances, which is how unknown keys get attached. */
function loaded(json: string): TaskDefinition[] {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  const et = mb.build().findEntityType(Process as never)!;
  const conv = et.findProperty("Tasks")!.codec!;
  return conv.fromProvider!(json) as TaskDefinition[];
}

describe("patchShapeInstance", () => {
  it("returns a new instance of the shape class, not a mutation", () => {
    const [task] = loaded('[{"Title":"Review"}]');
    const next = patchShapeInstance(shapeType(), task!, { Title: "Approve" });

    expect(next).not.toBe(task);
    expect(next).toBeInstanceOf(TaskDefinition);
    expect(next.Title).toBe("Approve");
    expect(task!.Title).toBe("Review"); // the original is untouched
  });

  it("carries unknown keys across an edit", () => {
    const [task] = loaded('[{"Title":"Review","ReviewedBy":"someone@x.com"}]');
    const next = patchShapeInstance(shapeType(), task!, { Title: "Approve" });

    // The whole point: a v1 client editing a row must not delete v2's field.
    // Object.assign would drop this, because the bag is non-enumerable.
    expect(Object.keys(next)).toEqual(["Title"]);
    const mb = new ModelBuilder();
    mb.entity(Process as never);
    const conv = mb
      .build()
      .findEntityType(Process as never)!
      .findProperty("Tasks")!.codec!;
    expect(JSON.parse(conv.toProvider!([next]) as string)).toEqual([
      { Title: "Approve", ReviewedBy: "someone@x.com" },
    ]);
  });

  it("drops a key the patch sets to undefined rather than storing an own undefined", () => {
    const [task] = loaded('[{"Title":"Review","Notes":"n"}]');
    const next = patchShapeInstance(shapeType(), task!, { Notes: undefined });
    expect(Object.keys(next)).toEqual(["Title"]);
  });
});

describe("shapeValueErrors", () => {
  it("reports a required property missing on one element, naming how many", () => {
    const errors = shapeValueErrors(
      shapeType(),
      [{ Title: "ok" }, { Notes: "no title" }],
      true,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/1/);
  });

  it("is silent when every element satisfies the shape", () => {
    expect(
      shapeValueErrors(shapeType(), [{ Title: "a" }, { Title: "b" }], true),
    ).toEqual([]);
  });

  it("checks a single value too, and treats absent as nothing to check", () => {
    expect(shapeValueErrors(shapeType(), { Notes: "x" }, false)).toHaveLength(
      1,
    );
    expect(shapeValueErrors(shapeType(), undefined, false)).toEqual([]);
    expect(shapeValueErrors(shapeType(), undefined, true)).toEqual([]);
  });
});

describe("a Json property's attached validation", () => {
  function tasksProperty() {
    const mb = new ModelBuilder();
    mb.entity(Process as never);
    return mb
      .build()
      .findEntityType(Process as never)!
      .findProperty("Tasks")!;
  }

  it("reports an error when an element is missing a required value", () => {
    const prop = tasksProperty();
    const ctx: FieldContext = {
      values: {},
      value: [{ Title: "ok" }, { Notes: "no title" }],
      mode: "edit",
    };
    expect(collectErrors(prop.customValidations, ctx)).toHaveLength(1);
  });

  it("reports nothing when every element is complete", () => {
    const prop = tasksProperty();
    const ctx: FieldContext = {
      values: {},
      value: [{ Title: "a" }, { Title: "b" }],
      mode: "edit",
    };
    expect(collectErrors(prop.customValidations, ctx)).toEqual([]);
  });
});
