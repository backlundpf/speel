import { describe, it, expect } from "vitest";
import { ModelBuilder, type EntityCtor } from "@speel/core";
import {
  projectEntityToValues,
  applyValuesToEntity,
} from "../src/form/projection.js";

class Item {
  Id?: number;
  Title?: string;
  Count?: number;
}

function et() {
  const mb = new ModelBuilder();
  mb.entity(Item, (b) => {
    b.toList("Items");
    b.property((e) => e.Id).isNumber(); // 'Id' is the key by convention
    b.property((e) => e.Title).isText();
    b.property((e) => e.Count).isNumber();
  });
  return mb.build().findEntityType(Item as unknown as EntityCtor)!;
}

describe("projection", () => {
  it("projects entity property values into a propertyName-keyed record", () => {
    const e = Object.assign(new Item(), { Id: 1, Title: "A", Count: 3 });
    const values = projectEntityToValues(et(), e);
    expect(values).toMatchObject({ Id: 1, Title: "A", Count: 3 });
  });
  it("applies a values record back onto the entity", () => {
    const e = Object.assign(new Item(), { Id: 1, Title: "A", Count: 3 });
    applyValuesToEntity(et(), e, { Title: "B", Count: 9 });
    expect(e.Title).toBe("B");
    expect(e.Count).toBe(9);
  });
});
