// test/unit/ModelBuilder/ModelBuilder.test.ts
import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";

class Blog {
  Id?: number;
  Title?: string;
}
class Comment {
  Id?: number;
  Body?: string;
}

describe("ModelBuilder", () => {
  it("registers entities via inline configure form", () => {
    const mb = new ModelBuilder();
    mb.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Comment, (b) => {
      b.toList("Comments");
      b.property((e) => e.Body).isNote();
    });
    const model = mb.build();
    expect(model.findEntityType(Blog)!.list.value).toBe("Blogs");
    expect(model.findEntityType(Comment)!.list.value).toBe("Comments");
  });

  it("supports the no-configure overload (returns the builder)", () => {
    const mb = new ModelBuilder();
    const eb = mb.entity(Blog);
    eb.toList("Blogs");
    eb.property((e) => e.Title).isText();
    const model = mb.build();
    expect(model.findEntityType(Blog)).toBeDefined();
  });

  it("entity() is idempotent by ctor (same builder reused, no duplicate)", () => {
    const mb = new ModelBuilder();
    const a = mb.entity(Blog).toList("A");
    const b = mb.entity(Blog).toList("B"); // same builder; toList just overrides
    expect(b).toBe(a);
    const model = mb.build();
    expect(model.entityTypes.filter((e) => e.ctor === Blog)).toHaveLength(1);
    expect(model.findEntityType(Blog)!.list.value).toBe("B");
  });
});
