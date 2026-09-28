import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";

class Doc {
  Id?: number;
  Title?: string;
}

describe("toList provisioning metadata (B1)", () => {
  it("stores provisioning opts on the list source", () => {
    const mb = new ModelBuilder();
    mb.entity(Doc, (b) => {
      b.toList("Docs", {
        template: "documentLibrary",
        url: "Shared Documents",
        description: "d",
      });
      b.property((e) => e.Title).isText();
    });
    const et = mb.build().findEntityType(Doc)!;
    expect(et.listProvisioning).toEqual({
      template: "documentLibrary",
      url: "Shared Documents",
      description: "d",
    });
  });

  it("leaves provisioning undefined when opts omitted", () => {
    const mb = new ModelBuilder();
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Title).isText();
    });
    expect(mb.build().findEntityType(Doc)!.listProvisioning).toBeUndefined();
  });
});
