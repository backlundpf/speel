import { describe, it, expect } from "vitest";
import { Materialize } from "../../../src/Query/Materialize.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

class Project {
  Id?: number;
  Title?: string;
  Owner?: SiteUser | null;
  OwnerId?: number;
}

function projectEntityType() {
  const mb = new ModelBuilder();
  mb.entity(SiteUser, (b) => {
    b.toList({ title: "UserInfo" });
    b.property((u) => u.Title).isText();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((p) => p.Title).isText();
    b.hasOne(SiteUser, (p) => p.Owner)
      .withMany()
      .hasForeignKey((p) => p.OwnerId);
  });
  const model = mb.build();
  return model.findEntityType(Project)!;
}

describe("Materialize.itemWithExpands", () => {
  it("materializes scalar fields and attaches a single-valued expand", () => {
    const et = projectEntityType();
    const record = { ID: 7, Title: "Apollo", Owner: { ID: 3, Title: "Ada" } };
    const entity = Materialize.itemWithExpands(record, et, [
      { navName: "Owner", fields: ["Title"] },
    ]) as Project;
    expect(entity.Id).toBe(7);
    expect(entity.Title).toBe("Apollo");
    expect(entity.Owner).toBeInstanceOf(SiteUser);
    expect((entity.Owner as SiteUser).Title).toBe("Ada");
  });

  it("leaves the nav undefined when the record carries no expand object", () => {
    const et = projectEntityType();
    const entity = Materialize.itemWithExpands({ ID: 8, Title: "B" }, et, [
      { navName: "Owner", fields: ["Title"] },
    ]) as Project;
    expect(entity.Owner).toBeUndefined();
  });
});
