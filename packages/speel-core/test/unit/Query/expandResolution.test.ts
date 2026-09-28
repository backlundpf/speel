import { describe, it, expect } from "vitest";
import { resolveExpandFields } from "../../../src/Query/expandResolution.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { InvalidOperationException } from "../../../src/errors.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

class Category {
  Id?: number;
  Name?: string;
}
class Product {
  Id?: number;
  Title?: string;
  Owner?: SiteUser | null;
  OwnerId?: number;
  Category?: Category | null;
  CategoryId?: number;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(SiteUser, (b) => {
    // A person column is a lookup to a provider-source entity — the source, not
    // the class, is what makes Owner one.
    b.toProviderSource({ kind: "provider", key: "principals" });
    b.property((u) => u.Title).isText();
    b.property((u) => u.Email)
      .isText()
      .hasColumnName("EMail");
  });
  mb.entity(Category, (b) => {
    b.toList("Categories");
    b.property((c) => c.Name).isText();
  });
  mb.entity(Product, (b) => {
    b.toList("Products");
    b.property((p) => p.Title).isText();
    b.hasOne(SiteUser, (p) => p.Owner)
      .withMany()
      .hasForeignKey((p) => p.OwnerId);
    b.hasOne(Category, (p) => p.Category)
      .withMany()
      .hasForeignKey((p) => p.CategoryId);
  });
  return mb.build();
}

describe("resolveExpandFields", () => {
  it("returns explicit fields verbatim when provided", () => {
    const et = model().findEntityType(Product)!;
    expect(resolveExpandFields(et, "Owner", ["Title", "EMail"])).toEqual([
      "Title",
      "EMail",
    ]);
  });

  it("defaults a provider-targeted nav to the full target column set", () => {
    const et = model().findEntityType(Product)!;
    const fields = resolveExpandFields(et, "Owner");
    expect(fields).toEqual(model().findEntityType(SiteUser)!.columnNames);
  });

  it("defaults a Lookup nav to the target's key and its display field", () => {
    const m = model();
    const et = m.findEntityType(Product)!;
    const key = et.findNavigation("Category")!.target.key.columnName;
    // The key rides along so the expanded object can be told apart from — and matched
    // to — the target's own rows. Without it a picker cannot find the held value among
    // its options, and a save that derives the FK from the nav would lose the id.
    expect(resolveExpandFields(et, "Category")).toEqual([key, "Title"]);
  });

  it("throws for an unknown navigation", () => {
    const et = model().findEntityType(Product)!;
    expect(() => resolveExpandFields(et, "Nope")).toThrow(
      InvalidOperationException,
    );
  });
});
